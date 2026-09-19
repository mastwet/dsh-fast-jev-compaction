/**
 * The Jev compaction backend.
 *
 * It is a `BasicCompactionEngine` subclass that overrides the backend's sole
 * documented customization hook, `summarize()`. Everything else — trigger
 * policy, retention, range selection, tool-pair lock safety, the
 * `compaction/start` … `compaction/end` bracket, surface-change detection,
 * manual-command error classes, and the durability checkpoint — stays exactly
 * the base package's behavior, so this plugin adds a decision source and no
 * second compaction policy.
 *
 * The produced summary is not a rewritten summary. It is the region's retained
 * content, verbatim, with the items Jev released replaced by one-line notes.
 * When Jev is unavailable, fails, or releases too little, the hook delegates to
 * `super.summarize()`, which is the built-in model summary — the same fallback
 * the upstream Claude Code hook makes.
 *
 * @module dsh-compaction-jev/engine
 */
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import { contentHasImage, createUserMessage, } from '@deepseek-ai/dsh-llm';
import { JevCompactionConfigSchema, resolveJevConfig } from './config.js';
import { batchCalls, collectToolCalls, decideCall, fitState, questionsFor, } from './jev/plan.js';
import { JevHttpClient, noulAnswer, } from './jev/protocol.js';
import { projectMessages, renderRegion, splitSystemHead } from './surface.js';
/** Provider name recorded on the summary event for this backend's own output. */
const JEV_PROVIDER = 'typesafe';
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Ask one batch of questions and reduce its answers to per-call probabilities.
 * @param asker - the Jev transport.
 * @param state - the fitted conversation state, resent with every batch.
 * @param batch - the calls this batch asks about.
 * @param signal - caller cancellation, forwarded to the transport.
 * @returns one answer pair per call in the batch.
 * @throws when the transport fails or an answer is malformed.
 */
async function askBatch(asker, state, batch, signal) {
    const questions = Object.assign({}, ...batch.map(questionsFor));
    const response = await asker.ask(state, questions, signal);
    return new Map(batch.map((call) => [
        call.id,
        {
            keepCall: noulAnswer(response.answers, `call_${call.id}`),
            keepResult: noulAnswer(response.answers, `result_${call.id}`),
        },
    ]));
}
/**
 * Compaction backend that keeps retained history verbatim and lets Jev decide
 * what is no longer needed.
 *
 * Load one implementation per context as `ctx.compaction`; the bundle patch
 * replaces the default backend's loader row by id.
 */
export class JevCompactionEngine extends BasicCompactionEngine {
    static inject = BasicCompactionEngine.inject;
    static Config = JevCompactionConfigSchema;
    #jev;
    #asker;
    #warnedMissingCredential = false;
    /**
     * @param ctx - the context the compaction service is provided on.
     * @param config - the loader row's configuration: the base backend's own
     * keys plus this plugin's `jev` block.
     */
    constructor(ctx, config = {}) {
        // The base backend validates its config against a fixed key set, so the
        // `jev` block is removed before it is handed the base keys it knows. The
        // Loader still sees the whole object: it validates against this class's
        // merged `Config`.
        const { jev, ...base } = config;
        super(ctx, base);
        this.#jev = resolveJevConfig(jev);
    }
    /** The Jev transport, created on first use so an unconfigured deployment never builds one. */
    #client() {
        this.#asker ??= new JevHttpClient({
            apiKey: this.#jev.apiKey ?? '',
            model: this.#jev.model,
            baseUrl: this.#jev.baseUrl,
            timeoutMs: this.#jev.timeoutMs,
        });
        return this.#asker;
    }
    /**
     * Decide the region with Jev and render the checkpoint that keeps what it kept.
     *
     * Delegates to the base backend's model summary whenever Jev cannot be asked
     * or releases too little, so a deployment without a TypeSafe credential keeps
     * compacting the way it did before this plugin was installed.
     *
     * @param input - the replayed conversation prefix the backend selected.
     * @param agent - supplies the routed model for the fallback summary.
     * @param signal - cancellation, forwarded to every Jev request.
     * @returns verbatim checkpoint content, or the built-in summary.
     */
    async summarize(input, agent, signal) {
        const jev = this.#jev;
        if (jev.apiKey === undefined) {
            if (!this.#warnedMissingCredential) {
                this.#warnedMissingCredential = true;
                this.ctx.logger.warn(`dsh-compaction-jev: ${jev.apiKeyEnv} is not set; using the built-in summary`);
            }
            return super.summarize(input, agent, signal);
        }
        const { region } = splitSystemHead(input.messages);
        if (region.length === 0)
            return super.summarize(input, agent, signal);
        // An image or file occurrence has no text form to keep verbatim, and the
        // built-in path already hands the whole region to a model that can see it.
        if (region.some((message) => contentHasImage(message.content))) {
            this.ctx.logger.info('dsh-compaction-jev: the selected region carries an image; using the built-in summary');
            return super.summarize(input, agent, signal);
        }
        let rendered;
        try {
            rendered = await this.#decide(region, signal);
        }
        catch (error) {
            if (signal?.aborted === true)
                throw error;
            this.ctx.logger.warn(`dsh-compaction-jev: Jev could not decide the region (${messageOf(error)}); using the built-in summary`);
            return super.summarize(input, agent, signal);
        }
        const meter = this.ctx.tokenMeter;
        const before = region.reduce((sum, message) => sum + meter.estimateMessage(message), 0);
        const after = meter.estimateMessage(createUserMessage({
            content: rendered.blocks,
            source: { kind: 'plugin', plugin: 'dsh-compaction-jev' },
        }));
        const reduction = rendered.charsBefore === 0 ? 0 : (rendered.charsBefore - rendered.charsAfter) / rendered.charsBefore;
        if (after >= before || reduction < jev.minReductionRatio) {
            this.ctx.logger.info(`dsh-compaction-jev: Jev released ${(reduction * 100).toFixed(1)}% of the region (~${before} → ~${after} tokens), below the configured floor; using the built-in summary`);
            return super.summarize(input, agent, signal);
        }
        this.ctx.logger.info(`dsh-compaction-jev: kept history verbatim over ${rendered.blocks.length} block(s), releasing ${(reduction * 100).toFixed(1)}% of ${region.length} message(s) (~${before} → ~${after} tokens)`);
        return { summary: rendered.blocks, provider: JEV_PROVIDER, model: jev.model };
    }
    /** Pair, fit, ask, decide, and render one region. */
    async #decide(region, signal) {
        const options = this.#jev.options;
        const messages = projectMessages(region);
        const calls = collectToolCalls(messages, options.preserveRecentMessages);
        const candidates = calls.filter((call) => !call.pinned);
        const answers = new Map();
        let stateTokens = 0;
        let stateStage = '';
        let requests = 0;
        if (candidates.length > 0) {
            const fitted = fitState(messages, calls, options);
            stateTokens = fitted.tokens;
            stateStage = fitted.stage;
            const batches = batchCalls(candidates, fitted.tokens, options);
            requests = batches.length;
            const asker = this.#client();
            const answered = await Promise.all(batches.map((batch) => askBatch(asker, fitted.state, batch, signal)));
            for (const map of answered)
                for (const [id, answer] of map)
                    answers.set(id, answer);
        }
        const decisions = calls.map((call) => decideCall(call, answers.get(call.id) ?? { keepCall: 1, keepResult: 1 }, options));
        return renderRegion({
            messages: region,
            calls,
            decisions,
            truncateHeadChars: options.truncateHeadChars,
            stateStage: stateStage.length > 0 ? stateStage : 'no candidates',
            stateTokens,
            requests,
        });
    }
}
export default JevCompactionEngine;

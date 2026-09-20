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
 * `super.summarize()`, which is the built-in model summary.
 *
 * Every value that decides how the backend behaves lives in the
 * `dsh-compaction-jev` settings namespace and is read on each compaction, so
 * the Settings page changes behavior without a restart and the loader row
 * carries no Jev configuration of its own.
 *
 * ## No ECMAScript private members
 *
 * A cordis service method is invoked with a *shadow* object as `this`
 * (`vendor/cordis/src/utils.ts`, `createShadowMethod`): the shadow forwards
 * ordinary property reads to the real instance, but it is a proxy and so has no
 * ECMAScript private brand. A `#field` or `#method` reached through it throws
 * `Cannot read private member #… from an object whose class did not declare it`
 * — which is how `/compact` failed the first time this backend shipped, because
 * the manual command enters the service from the host realm while the backend
 * is composed in the agent preset's isolated group. Instance state therefore
 * lives in ordinary properties (the base class does the same) and helpers that
 * need no instance state are module-level functions.
 *
 * @module dsh-compaction-jev/engine
 */
import type { Agent } from '@deepseek-ai/dsh-agent';
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import { type ContentBlock, type Message, type TokenUsage, type ToolSchema } from '@deepseek-ai/dsh-llm';
/**
 * The summarizer hook's input, restated from
 * `@deepseek-ai/dsh-compaction-basic`'s `lib/types/summarizer.d.ts`.
 *
 * The installed package's `exports` map exposes only its root entry, so that
 * declaration cannot be imported and the backend's hook types are not
 * re-exported. `protected override` on the base class is the compile-time check
 * that this restatement still matches the hook the backend actually calls.
 */
export interface SummarizationInput {
    readonly tools?: readonly ToolSchema[];
    readonly messages: readonly Message[];
}
/**
 * The summarizer hook's result, restated from the same declaration. This
 * plugin takes the unmarked branch: its content comes from Jev over HTTP, not
 * from one call through `ctx.llm.stream()`, so it reports no `llmStreamCall`
 * marker and no raw provider output.
 */
export type SummaryResult = {
    summary: ContentBlock[];
    provider: string;
    model: string;
    maxTokens?: number;
    usage?: TokenUsage;
} & ({
    rawOutput: ContentBlock[];
    llmStreamCall: true;
} | {
    rawOutput?: ContentBlock[];
    llmStreamCall?: never;
});
/**
 * Compaction backend that keeps retained history verbatim and lets Jev decide
 * what is no longer needed.
 *
 * Load one implementation per context as `ctx.compaction`; an agent preset
 * points its compaction row at this package.
 */
export declare class JevCompactionEngine extends BasicCompactionEngine {
    static inject: string[];
    /** Reported once per process, so a disabled namespace does not repeat per compaction. */
    private reportedDisabled;
    /** Reported once per process, so a missing credential does not repeat per compaction. */
    private reportedMissingCredential;
    /**
     * Decide the region with Jev and render the checkpoint that keeps what it kept.
     *
     * Delegates to the base backend's model summary whenever the settings
     * namespace is disabled, carries no usable credential, hides Jev, or Jev
     * releases too little of the region, so compaction keeps working the way it
     * did before this plugin was installed.
     *
     * @param input - the replayed conversation prefix the backend selected.
     * @param agent - supplies the routed model for the fallback summary.
     * @param signal - cancellation, forwarded to every Jev request.
     * @returns verbatim checkpoint content, or the built-in summary.
     */
    protected summarize(input: SummarizationInput, agent: Agent, signal?: AbortSignal): Promise<SummaryResult>;
}
export default JevCompactionEngine;

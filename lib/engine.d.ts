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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import { type ContentBlock, type Message, type TokenUsage, type ToolSchema } from '@deepseek-ai/dsh-llm';
import { type JevCompactionConfig } from './config.js';
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
 * Load one implementation per context as `ctx.compaction`; the bundle patch
 * replaces the default backend's loader row by id.
 */
export declare class JevCompactionEngine extends BasicCompactionEngine {
    #private;
    static inject: string[];
    static Config: typeof BasicCompactionEngine.Config;
    /**
     * @param ctx - the context the compaction service is provided on.
     * @param config - the loader row's configuration: the base backend's own
     * keys plus this plugin's `jev` block.
     */
    constructor(ctx: Context, config?: JevCompactionConfig);
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
    protected summarize(input: SummarizationInput, agent: Agent, signal?: AbortSignal): Promise<SummaryResult>;
}
export default JevCompactionEngine;

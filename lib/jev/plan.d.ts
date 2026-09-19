/**
 * The Jev decision plan: pairing tool calls with their results, fitting the
 * whole conversation into one request budget, asking two `noul` questions per
 * candidate call, and turning the answers into per-call actions.
 *
 * Ported from `fast-jev-compaction` (MIT) `src/state.ts` and `src/compact.ts`.
 * The fitting stages, their order, the thresholds, and the JSON keys sent to
 * Jev are unchanged, so upstream's estimator calibration still holds. See
 * `NOTICE`.
 *
 * @module dsh-compaction-jev/jev/plan
 */
import type { JevMessage, JevQuestions } from './protocol.js';
/**
 * One `history` entry as Jev receives it. The `tool_calls` and `result` keys
 * are the upstream wire names and are deliberately not camel-cased.
 */
export interface HistoryEntry {
    i: number;
    role: 'user' | 'assistant';
    text: string;
    /** Structured per call, or one compact line per call once the state must shrink. */
    tool_calls?: HistoryToolCall[] | string[];
}
/** One structured tool call inside a {@link HistoryEntry}. */
export interface HistoryToolCall {
    id: string;
    tool: string;
    input: string;
    result: string;
}
/** The state sent with every Jev request: the whole history, results omitted. */
export interface JevCompactionState {
    context: string;
    goal: string;
    history: HistoryEntry[];
}
/** A fitted state plus the stage that produced it. */
export interface FittedState {
    state: JevCompactionState;
    tokens: number;
    stage: string;
}
/** A tool call paired with its result by call id. */
export interface ToolCall {
    /** Short id used in the Jev state and question names (`t1`, `t2`, …). */
    id: string;
    callId: string;
    tool: string;
    input: Record<string, unknown>;
    /** Index of the message holding the tool-call block. */
    callIndex: number;
    /** Index of the message holding the tool-result block. */
    resultIndex: number;
    resultChars: number;
    isError: boolean;
    /** In the first or the newest preserved messages; never a candidate. */
    pinned: boolean;
}
/** Jev's two probabilities about one call. */
export interface CallAnswer {
    /** Probability that the call itself still matters. */
    keepCall: number;
    /** Probability that the full result still needs to stay verbatim. */
    keepResult: number;
}
/** What happens to one call and its result. */
export type CallAction = 'keep' | 'drop_result' | 'drop_call';
/** One call's resolved action and the reason it was chosen. */
export interface CallDecision extends CallAnswer {
    id: string;
    tool: string;
    action: CallAction;
    reason: 'pinned' | 'kept' | 'result_dropped' | 'call_dropped';
}
/** Resolved Jev decision options. */
export interface ResolvedJevOptions {
    goal: string;
    keepThreshold: number;
    preserveRecentMessages: number;
    maxStateTokens: number;
    maxRequestTokens: number;
    truncateHeadChars: number;
}
/** Defaults mirroring upstream's `DEFAULT_OPTIONS`. */
export declare const DEFAULT_JEV_OPTIONS: ResolvedJevOptions;
/** The state preamble explaining the compaction task to Jev. */
export declare const STATE_CONTEXT = "A coding assistant conversation is being compacted to free context. `history` is the whole conversation so far, oldest first; tool outputs are replaced by a short `result` note and long texts may be abridged. Each question asks whether one tool call, or the full output of that call, still needs to stay in the history verbatim. Whatever is not kept is deleted permanently, but the assistant can always re-run a tool or re-read a file.";
/**
 * Fill absent options from {@link DEFAULT_JEV_OPTIONS}, rejecting non-finite
 * numbers in favour of the default the way upstream does.
 * @param options - the caller's partial options.
 * @returns every option resolved.
 */
export declare function resolveJevOptions(options?: Partial<ResolvedJevOptions>): ResolvedJevOptions;
/**
 * Whether one message index belongs to the pinned first or newest messages.
 * @param index - message index.
 * @param total - message count.
 * @param preserveRecentMessages - newest messages never touched.
 * @returns whether the index is pinned.
 */
export declare function isPinned(index: number, total: number, preserveRecentMessages: number): boolean;
/**
 * Pair every tool call with its result by call id. Calls without a result are
 * not candidates, because there is nothing to drop yet.
 * @param messages - the projected transcript.
 * @param preserveRecentMessages - newest messages never touched.
 * @returns the paired calls in transcript order.
 */
export declare function collectToolCalls(messages: readonly JevMessage[], preserveRecentMessages: number): ToolCall[];
/**
 * The two `noul` questions asked about one call.
 * @param call - the call to ask about.
 * @returns the question map, keyed by the answer names it produces.
 */
export declare function questionsFor(call: ToolCall): JevQuestions;
/**
 * Split candidate calls into batches whose questions, together with the always
 * complete state, fit one request.
 * @param calls - the candidate calls, in transcript order.
 * @param stateTokens - the fitted state's estimated size.
 * @param options - resolved options supplying `maxRequestTokens`.
 * @returns the batches to ask concurrently.
 * @throws when the state leaves no room for even one call's questions.
 */
export declare function batchCalls(calls: readonly ToolCall[], stateTokens: number, options: Pick<ResolvedJevOptions, 'maxRequestTokens'>): ToolCall[][];
/**
 * Resolve one call's action from its answers and the keep threshold.
 * @param call - the call's identity and pinned state.
 * @param answer - Jev's two probabilities.
 * @param options - resolved options supplying `keepThreshold`.
 * @returns the action and the reason behind it.
 */
export declare function decideCall(call: Pick<ToolCall, 'id' | 'tool' | 'pinned'>, answer: CallAnswer, options: Pick<ResolvedJevOptions, 'keepThreshold'>): CallDecision;
/**
 * The last three user prompts, as the default `goal`.
 * @param messages - the projected transcript.
 * @returns the joined goal text.
 */
export declare function goalFromMessages(messages: readonly JevMessage[]): string;
/**
 * Build the Jev state from the whole conversation and shrink it in stages until
 * it fits `maxStateTokens`: tool inputs are truncated, then long texts are
 * abridged oldest-first (pinned messages last), then old messages collapse to a
 * one-line note, then old tool calls shrink to one line each, then old messages
 * that carry no call are left out, then runs of old call-only messages are
 * folded into one entry.
 * @param messages - the projected transcript.
 * @param calls - the paired calls.
 * @param options - resolved options supplying the state ceiling, retention, and goal.
 * @returns the fitted state, its estimated size, and the stage that fit it.
 * @throws when even the last stage is too big.
 */
export declare function fitState(messages: readonly JevMessage[], calls: readonly ToolCall[], options: Pick<ResolvedJevOptions, 'maxStateTokens' | 'preserveRecentMessages' | 'goal'>): FittedState;

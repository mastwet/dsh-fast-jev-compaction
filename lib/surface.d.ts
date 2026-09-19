/**
 * DSH message projection and checkpoint rendering.
 *
 * The compaction backend hands this module the derived messages of the region
 * being compacted, in surface order, optionally led by the conversation's
 * system head. Projection turns them into the transcript shape Jev scores;
 * rendering turns Jev's per-call decisions back into the content blocks of the
 * single replacement checkpoint node.
 *
 * Rendering never rewrites retained content: text, tool inputs, and retained
 * tool results are copied byte-for-byte. Only the items Jev released are
 * replaced by one-line notes.
 *
 * @module dsh-compaction-jev/surface
 */
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm';
import type { CallDecision, ToolCall } from './jev/plan.js';
import type { JevMessage } from './jev/protocol.js';
/** What the renderer needs from the decision pass. */
export interface RenderInput {
    /** Region messages, in surface order, without the conversation's system head. */
    messages: readonly Message[];
    /** Every paired call, in transcript order. */
    calls: readonly ToolCall[];
    /** One decision per call, same order. */
    decisions: readonly CallDecision[];
    /** Characters of a dropped tool result retained before its note. */
    truncateHeadChars: number;
    /** The state-fitting stage that was used, for the ledger line. */
    stateStage: string;
    /** Estimated state size in tokens, for the ledger line. */
    stateTokens: number;
    /** Number of requests the decision pass made, for the ledger line. */
    requests: number;
}
/** What rendering produced. */
export interface RenderOutput {
    /** Content blocks for the replacement checkpoint node. */
    blocks: ContentBlock[];
    /** Characters of region content before rendering. */
    charsBefore: number;
    /** Characters of rendered content. */
    charsAfter: number;
    /** Non-text blocks inside the region that the checkpoint does not carry. */
    droppedBlocks: number;
}
/**
 * Split an input message list into the conversation's system head and the
 * region being compacted.
 * @param messages - the derived messages the backend offered.
 * @returns the leading system message, when present, and the region messages.
 */
export declare function splitSystemHead(messages: readonly Message[]): {
    head: Message | undefined;
    region: readonly Message[];
};
/**
 * Project region messages into the transcript shape Jev scores. A system
 * message inside the region keeps its text under the user role, because it is
 * instruction text the model was shown.
 * @param region - region messages, in surface order.
 * @returns the projected transcript.
 */
export declare function projectMessages(region: readonly Message[]): JevMessage[];
/**
 * Build the replacement checkpoint's content blocks from Jev's decisions.
 * @param input - the region, the decisions, and the diagnostics for the ledger line.
 * @returns the blocks, the character accounting, and the dropped-block count.
 */
export declare function renderRegion(input: RenderInput): RenderOutput;

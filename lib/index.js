/**
 * `dsh-compaction-jev`: a context-compaction backend for the DeepSeek Harness
 * that keeps retained history verbatim instead of rewriting it.
 *
 * Every tool call and tool result outside the pinned head and tail is scored by
 * Jev (TypeSafe System One) in one fast request per batch. A result Jev still
 * wants stays byte-for-byte; a call that still matters keeps its input and a
 * bounded head of its output; anything else is replaced by a one-line note. The
 * checkpoint is therefore a projection of the conversation, never a paraphrase
 * of it.
 *
 * The backend subclasses `@deepseek-ai/dsh-compaction-basic`, so it inherits
 * that package's trigger policy, retention, locking, and durability unchanged
 * and overrides only its `summarize()` hook. When Jev is not configured, fails,
 * or releases too little of the region, the hook falls back to the built-in
 * model summary.
 *
 * Install by overriding the base compaction loader row, or by pointing an agent
 * preset's `compaction-basic` row at this package. See `README.md`.
 *
 * @module dsh-compaction-jev
 */
export { JevCompactionEngine, } from './engine.js';
export { default } from './engine.js';
export { JevCompactionConfigSchema, resolveJevConfig, } from './config.js';
export { DEFAULT_JEV_OPTIONS, collectToolCalls, decideCall, fitState, resolveJevOptions, } from './jev/plan.js';
export { DEFAULT_JEV_MODEL, JevHttpClient, SYSTEM_ONE_URL, buildJevRequest, parseJevResponse, } from './jev/protocol.js';
export { estimateTokens } from './jev/tokens.js';
export { projectMessages, renderRegion, splitSystemHead, } from './surface.js';

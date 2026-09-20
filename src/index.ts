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
 * and overrides only its `summarize()` hook. When Jev is switched off, not
 * configured, fails, or releases too little of the region, the hook falls back
 * to the built-in model summary.
 *
 * Three entry points make up the package:
 *
 * - This root is the plugin the bundle patch mounts: it registers the
 *   `dsh-compaction-jev` settings namespace, the single home for every value
 *   that decides how the backend behaves. It is the package ROOT because the Web
 *   client table maps loader entries to packages by module specifier, and a
 *   subpath entry is permanently not a client row — the browser half is
 *   discoverable only through a root entry.
 * - `dsh-compaction-jev/engine` is the compaction backend, loaded where
 *   compaction is composed (an agent preset's isolated group in a Web
 *   deployment). It carries no plugin face: it is the service class the group's
 *   row provides.
 * - `dsh-compaction-jev/client` is the Settings page section that edits the
 *   namespace.
 *
 * See `README.md`.
 *
 * @module dsh-compaction-jev
 */

export { apply, inject, name } from './settings/index.js'
export {
  JevCompactionEngine,
  type SummarizationInput,
  type SummaryResult,
} from './engine.js'
export {
  JEV_SETTINGS_DEFAULTS,
  JEV_SETTINGS_NAMESPACE,
  JEV_SETTING_FIELDS,
  JEV_SETTING_ORDER,
  resolveJevSettings,
  type JevSettingField,
  type JevSettingKey,
  type JevSettings,
} from './settings/fields.js'
export { JevSettingsSchema } from './settings/schema.js'
export {
  DEFAULT_JEV_OPTIONS,
  collectToolCalls,
  decideCall,
  fitState,
  resolveJevOptions,
  type CallAction,
  type CallAnswer,
  type CallDecision,
  type ResolvedJevOptions,
  type ToolCall,
} from './jev/plan.js'
export {
  DEFAULT_JEV_MODEL,
  JevHttpClient,
  SYSTEM_ONE_URL,
  buildJevRequest,
  parseJevResponse,
  type JevAsker,
  type JevMessage,
  type JevQuestions,
  type JevResponse,
} from './jev/protocol.js'
export { estimateTokens } from './jev/tokens.js'
export {
  projectMessages,
  renderRegion,
  splitSystemHead,
  type RenderInput,
  type RenderOutput,
} from './surface.js'
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

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import {
  contentHasImage,
  createUserMessage,
  type ContentBlock,
  type Message,
  type TokenUsage,
  type ToolSchema,
} from '@deepseek-ai/dsh-llm'
// Loads the declaration merging that puts `settings` on `Context`. The
// namespace is optional: a deployment without a settings provider resolves the
// field defaults, whose `enabled` is false.
import type {} from '@deepseek-ai/dsh-settings'
// Loads the declaration merging that puts `tokenMeter` on `Context`. The
// backend is composed only in deployments that mount a meter, and the base
// package it subclasses carries the same requirement.
import type {} from '@deepseek-ai/dsh-token-meter'
import {
  JEV_SETTINGS_NAMESPACE,
  resolveJevSettings,
  type JevSettings,
} from './settings/fields.js'
import {
  batchCalls,
  collectToolCalls,
  decideCall,
  fitState,
  questionsFor,
  resolveJevOptions,
  type CallAnswer,
  type CallDecision,
  type ToolCall,
} from './jev/plan.js'
import {
  JevHttpClient,
  noulAnswer,
  type JevAsker,
  type JevQuestions,
  type JevState,
  type JevResponse,
} from './jev/protocol.js'
import { projectMessages, renderRegion, splitSystemHead, type RenderOutput } from './surface.js'

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
  readonly tools?: readonly ToolSchema[]
  readonly messages: readonly Message[]
}

/**
 * The summarizer hook's result, restated from the same declaration. This
 * plugin takes the unmarked branch: its content comes from Jev over HTTP, not
 * from one call through `ctx.llm.stream()`, so it reports no `llmStreamCall`
 * marker and no raw provider output.
 */
export type SummaryResult = {
  summary: ContentBlock[]
  provider: string
  model: string
  maxTokens?: number
  usage?: TokenUsage
} & (
  | { rawOutput: ContentBlock[]; llmStreamCall: true }
  | { rawOutput?: ContentBlock[]; llmStreamCall?: never }
)

/** Provider name recorded on the summary event for this backend's own output. */
const JEV_PROVIDER = 'typesafe'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read the settings namespace from whatever provider the host mounted.
 * @param ctx - the context the backend was composed on.
 * @returns every field resolved, defaulting to `enabled: false` when no
 * provider registered the namespace.
 */
function readSettings(ctx: Context): JevSettings {
  const provider = ctx.get('settings') as Context['settings'] | undefined
  return resolveJevSettings(provider?.get(JEV_SETTINGS_NAMESPACE))
}

/**
 * Ask one batch of questions and reduce its answers to per-call probabilities.
 * @param asker - the Jev transport.
 * @param state - the fitted conversation state, resent with every batch.
 * @param batch - the calls this batch asks about.
 * @param signal - caller cancellation, forwarded to the transport.
 * @returns one answer pair per call in the batch, and the model the provider
 * reported when it named one.
 * @throws when the transport fails or an answer is malformed.
 */
async function askBatch(
  asker: JevAsker,
  state: JevState,
  batch: readonly ToolCall[],
  signal?: AbortSignal,
): Promise<{ answers: Map<string, CallAnswer>; model: string | undefined }> {
  const questions: JevQuestions = Object.assign({}, ...batch.map(questionsFor))
  const response: JevResponse = await asker.ask(state, questions, signal)
  return {
    answers: new Map(
      batch.map((call) => [
        call.id,
        {
          keepCall: noulAnswer(response.answers, `call_${call.id}`),
          keepResult: noulAnswer(response.answers, `result_${call.id}`),
        } satisfies CallAnswer,
      ]),
    ),
    model: response.model,
  }
}

/** One decided region: the checkpoint content and the model that decided it. */
interface Decision {
  rendered: RenderOutput
  model: string | undefined
}

/**
 * Pair, fit, ask, decide, and render one region. Module-level because a shadow
 * cannot reach an instance helper.
 * @param region - the conversation prefix this compaction replaces.
 * @param settings - the resolved namespace section the compaction obeys.
 * @param apiKey - the credential read from the environment variable the section names.
 * @param signal - cancellation, forwarded to every Jev request.
 * @returns the checkpoint content and the model the provider reported, if any.
 * @throws when the region cannot be fitted into the state ceiling or when Jev
 * cannot be reached or answered.
 */
async function decideRegion(
  region: readonly Message[],
  settings: JevSettings,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Decision> {
  const options = resolveJevOptions(settings)
  const asker = new JevHttpClient({
    apiKey,
    model: settings.model,
    baseUrl: settings.baseUrl,
    timeoutMs: settings.timeoutMs,
  })
  const messages = projectMessages(region)
  const calls = collectToolCalls(messages, options.preserveRecentMessages)
  const candidates = calls.filter((call) => !call.pinned)
  const answers = new Map<string, CallAnswer>()
  let model: string | undefined
  let stateTokens = 0
  let stateStage = ''
  let requests = 0

  if (candidates.length > 0) {
    const fitted = fitState(messages, calls, options)
    stateTokens = fitted.tokens
    stateStage = fitted.stage
    const batches = batchCalls(candidates, fitted.tokens, options)
    requests = batches.length
    const answered = await Promise.all(
      batches.map((batch) => askBatch(asker, fitted.state, batch, signal)),
    )
    for (const one of answered) {
      model ??= one.model
      for (const [id, answer] of one.answers) answers.set(id, answer)
    }
  }

  const decisions: CallDecision[] = calls.map((call) =>
    decideCall(call, answers.get(call.id) ?? { keepCall: 1, keepResult: 1 }, options),
  )
  return {
    rendered: renderRegion({
      messages: region,
      calls,
      decisions,
      truncateHeadChars: options.truncateHeadChars,
      stateStage: stateStage.length > 0 ? stateStage : 'no candidates',
      stateTokens,
      requests,
    }),
    model,
  }
}

/**
 * Compaction backend that keeps retained history verbatim and lets Jev decide
 * what is no longer needed.
 *
 * Load one implementation per context as `ctx.compaction`; an agent preset
 * points its compaction row at this package.
 */
export class JevCompactionEngine extends BasicCompactionEngine {
  static override inject = BasicCompactionEngine.inject

  /** Reported once per process, so a disabled namespace does not repeat per compaction. */
  private reportedDisabled = false

  /** Reported once per process, so a missing credential does not repeat per compaction. */
  private reportedMissingCredential = false

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
  protected override async summarize(
    input: SummarizationInput,
    agent: Agent,
    signal?: AbortSignal,
  ): Promise<SummaryResult> {
    const settings = readSettings(this.ctx)
    if (!settings.enabled) {
      if (!this.reportedDisabled) {
        this.reportedDisabled = true
        this.ctx.logger.info(
          `dsh-compaction-jev: disabled in the "${JEV_SETTINGS_NAMESPACE}" settings; using the built-in summary`,
        )
      }
      return super.summarize(input, agent, signal)
    }

    const apiKey = process.env[settings.apiKeyEnv]
    if (apiKey === undefined || apiKey.length === 0) {
      if (!this.reportedMissingCredential) {
        this.reportedMissingCredential = true
        this.ctx.logger.warn(
          `dsh-compaction-jev: enabled, but ${settings.apiKeyEnv} is not set; using the built-in summary`,
        )
      }
      return super.summarize(input, agent, signal)
    }

    const { region } = splitSystemHead(input.messages)
    if (region.length === 0) return super.summarize(input, agent, signal)

    // An image or file occurrence has no text form to keep verbatim, and the
    // built-in path already hands the whole region to a model that can see it.
    if (region.some((message) => contentHasImage(message.content))) {
      this.ctx.logger.info(
        'dsh-compaction-jev: the selected region carries an image; using the built-in summary',
      )
      return super.summarize(input, agent, signal)
    }

    let decision: Decision
    try {
      decision = await decideRegion(region, settings, apiKey, signal)
    } catch (error) {
      if (signal?.aborted === true) throw error
      this.ctx.logger.warn(
        `dsh-compaction-jev: Jev could not decide the region (${messageOf(error)}); using the built-in summary`,
      )
      return super.summarize(input, agent, signal)
    }

    const rendered = decision.rendered
    const meter = this.ctx.tokenMeter
    const before = region.reduce((sum, message) => sum + meter.estimateMessage(message), 0)
    const after = meter.estimateMessage(
      createUserMessage({
        content: rendered.blocks,
        source: { kind: 'plugin', plugin: 'dsh-compaction-jev' },
      }),
    )
    const reduction =
      rendered.charsBefore === 0 ? 0 : (rendered.charsBefore - rendered.charsAfter) / rendered.charsBefore
    if (after >= before || reduction < settings.minReductionRatio) {
      this.ctx.logger.info(
        `dsh-compaction-jev: Jev released ${(reduction * 100).toFixed(1)}% of the region (~${before} → ~${after} tokens), below the configured floor; using the built-in summary`,
      )
      return super.summarize(input, agent, signal)
    }

    this.ctx.logger.info(
      `dsh-compaction-jev: kept history verbatim over ${rendered.blocks.length} block(s), releasing ${(reduction * 100).toFixed(1)}% of ${region.length} message(s) (~${before} → ~${after} tokens)`,
    )
    return {
      summary: rendered.blocks,
      provider: JEV_PROVIDER,
      model: decision.model ?? settings.model,
    }
  }
}

export default JevCompactionEngine
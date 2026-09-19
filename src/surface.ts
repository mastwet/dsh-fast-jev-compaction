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

import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'
import type { CallDecision, ToolCall } from './jev/plan.js'
import type { JevMessage, JevToolResult, JevToolUse } from './jev/protocol.js'

/** What the renderer needs from the decision pass. */
export interface RenderInput {
  /** Region messages, in surface order, without the conversation's system head. */
  messages: readonly Message[]
  /** Every paired call, in transcript order. */
  calls: readonly ToolCall[]
  /** One decision per call, same order. */
  decisions: readonly CallDecision[]
  /** Characters of a dropped tool result retained before its note. */
  truncateHeadChars: number
  /** The state-fitting stage that was used, for the ledger line. */
  stateStage: string
  /** Estimated state size in tokens, for the ledger line. */
  stateTokens: number
  /** Number of requests the decision pass made, for the ledger line. */
  requests: number
}

/** What rendering produced. */
export interface RenderOutput {
  /** Content blocks for the replacement checkpoint node. */
  blocks: ContentBlock[]
  /** Characters of region content before rendering. */
  charsBefore: number
  /** Characters of rendered content. */
  charsAfter: number
  /** Non-text blocks inside the region that the checkpoint does not carry. */
  droppedBlocks: number
}

/**
 * Split an input message list into the conversation's system head and the
 * region being compacted.
 * @param messages - the derived messages the backend offered.
 * @returns the leading system message, when present, and the region messages.
 */
export function splitSystemHead(messages: readonly Message[]): {
  head: Message | undefined
  region: readonly Message[]
} {
  const first = messages[0]
  if (first !== undefined && first.role === 'system') {
    return { head: first, region: messages.slice(1) }
  }
  return { head: undefined, region: messages }
}

function parseToolInput(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // The model produced arguments that are not JSON; the raw string below is
    // the only faithful representation of what it asked for.
  }
  return { arguments: raw }
}

/**
 * Text of a nested tool-result content list.
 * @param content - the result's content blocks.
 * @returns the concatenated text, or a placeholder naming the non-text blocks.
 */
function resultText(content: readonly ContentBlock[]): string {
  const parts: string[] = []
  let other = 0
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text)
    else other += 1
  }
  if (other > 0) parts.push(`[${other} non-text block(s)]`)
  return parts.join('\n')
}

/**
 * Project region messages into the transcript shape Jev scores. A system
 * message inside the region keeps its text under the user role, because it is
 * instruction text the model was shown.
 * @param region - region messages, in surface order.
 * @returns the projected transcript.
 */
export function projectMessages(region: readonly Message[]): JevMessage[] {
  return region.map((message) => {
    const text: string[] = []
    const toolUses: JevToolUse[] = []
    const toolResults: JevToolResult[] = []
    let other = 0
    for (const block of message.content) {
      switch (block.type) {
        case 'text':
          text.push(block.text)
          break
        case 'tool-call':
          toolUses.push({
            toolUseId: block.id,
            tool: block.name,
            input: parseToolInput(block.arguments),
          })
          break
        case 'tool-result':
          toolResults.push({
            toolUseId: block.toolCallId,
            text: resultText(block.content),
            isError: block.isError === true,
          })
          break
        default:
          other += 1
      }
    }
    if (other > 0) text.push(`[${other} non-text block(s)]`)
    return {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      text: text.join('\n'),
      toolUses,
      toolResults,
    }
  })
}

/** Characters of text, tool input, and tool output the region holds. */
function messageChars(message: Message): number {
  let total = 0
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        total += block.text.length
        break
      case 'tool-call':
        total += block.arguments.length
        break
      case 'tool-result':
        total += resultText(block.content).length
        break
      default:
        break
    }
  }
  return total
}

/**
 * The bounded head retained from a dropped tool result.
 * @param text - the original result text.
 * @param headChars - characters to retain.
 * @returns the retained head plus its note, or the original when it is short.
 */
function truncatedResultText(text: string, headChars: number): string {
  if (text.length <= headChars + 120) return text
  const head = headChars > 0 ? `${text.slice(0, headChars)}\n` : ''
  return `${head}[dsh-compaction-jev truncated ${text.length - headChars} chars of this tool result; re-run the tool if needed]`
}

/**
 * Render one region message into the checkpoint's text lines.
 * @param message - the region message.
 * @param actions - call id to action, for the calls this region holds.
 * @param indexed - call id to its paired call, for result sizes.
 * @param truncateHeadChars - characters of a dropped result retained before its note.
 * @returns the message's lines, or `null` when nothing survives.
 */
function renderMessage(
  message: Message,
  actions: ReadonlyMap<string, CallDecision['action']>,
  indexed: ReadonlyMap<string, ToolCall>,
  truncateHeadChars: number,
  counter: { droppedBlocks: number },
): string | null {
  const lines: string[] = []
  let text = ''
  let other = 0
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        text += block.text
        break
      case 'tool-call': {
        if (actions.get(block.id) === 'drop_call') break
        lines.push(`[tool call ${block.name} ${block.id}] ${block.arguments}`)
        break
      }
      case 'tool-result': {
        const action = actions.get(block.toolCallId)
        if (action === 'drop_call') break
        const call = indexed.get(block.toolCallId)
        const ok = block.isError === true ? 'error' : 'ok'
        if (action === 'drop_result') {
          const original = resultText(block.content)
          const head = truncatedResultText(original, truncateHeadChars)
          if (head === original) lines.push(`[tool result ${block.toolCallId} ${ok}]`, original)
          else
            lines.push(
              `[tool result ${block.toolCallId} ${ok}, ${call?.resultChars ?? original.length} chars released by Jev]`,
              head,
            )
        } else {
          lines.push(`[tool result ${block.toolCallId} ${ok}]`, resultText(block.content))
        }
        break
      }
      default:
        other += 1
        lines.push(`[${block.type} block not carried by Jev compaction]`)
    }
  }
  counter.droppedBlocks += other
  if (text.trim().length === 0 && lines.length === 0) return null
  const marker = message.role === 'assistant' ? '--- assistant ---' : '--- user ---'
  const body = [marker]
  if (text.length > 0) body.push(text)
  body.push(...lines)
  return body.join('\n')
}

/**
 * Build the replacement checkpoint's content blocks from Jev's decisions.
 * @param input - the region, the decisions, and the diagnostics for the ledger line.
 * @returns the blocks, the character accounting, and the dropped-block count.
 */
export function renderRegion(input: RenderInput): RenderOutput {
  const actions = new Map<string, CallDecision['action']>()
  const indexed = new Map<string, ToolCall>()
  const byShortId = new Map<string, ToolCall>()
  for (const call of input.calls) {
    indexed.set(call.callId, call)
    byShortId.set(call.id, call)
  }
  for (const decision of input.decisions) {
    if (decision.action === 'keep') continue
    const call = byShortId.get(decision.id)
    if (call !== undefined) actions.set(call.callId, decision.action)
  }

  const kept = input.decisions.filter((decision) => decision.reason === 'kept').length
  const pinned = input.decisions.filter((decision) => decision.reason === 'pinned').length
  const resultsDropped = input.decisions.filter(
    (decision) => decision.reason === 'result_dropped',
  ).length
  const callsDropped = input.decisions.filter(
    (decision) => decision.reason === 'call_dropped',
  ).length

  const ledger = [
    `[Jev compaction: ${input.decisions.length} tool call(s) scored — ${kept} kept, ${resultsDropped} result(s) released, ${callsDropped} call(s) removed, ${pinned} pinned.`,
    `Retained text, tool inputs, and retained tool results are verbatim; removed items can be re-run or re-read.`,
    `State fitted at stage "${input.stateStage}" (~${input.stateTokens} tokens) across ${input.requests} request(s).]`,
  ].join(' ')

  const counter = { droppedBlocks: 0 }
  const blocks: ContentBlock[] = [{ type: 'text', text: ledger }]
  for (const message of input.messages) {
    const rendered = renderMessage(message, actions, indexed, input.truncateHeadChars, counter)
    if (rendered !== null) blocks.push({ type: 'text', text: rendered })
  }

  const charsBefore = input.messages.reduce((sum, message) => sum + messageChars(message), 0)
  const charsAfter = blocks.reduce(
    (sum, block) => sum + (block.type === 'text' ? block.text.length : 0),
    0,
  )
  return { blocks, charsBefore, charsAfter, droppedBlocks: counter.droppedBlocks }
}
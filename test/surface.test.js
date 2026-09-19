/**
 * Unit tests for DSH message projection and checkpoint rendering.
 *
 * The promise under test is that retained content survives byte-for-byte: a
 * dropped result shrinks to a note, a kept result is copied exactly, and no
 * tool result is ever rendered without the call it answers.
 *
 * Every render fixture leads with an older message. Index 0 is always pinned,
 * so a call at index 0 is never a candidate for release.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { projectMessages, renderRegion, splitSystemHead } from '../lib/surface.js'
import { collectToolCalls, decideCall } from '../lib/jev/plan.js'

/** One DSH user message carrying plain text. */
function userMessage(body) {
  return { role: 'user', content: [{ type: 'text', text: body }] }
}

/** One DSH assistant message with text and tool calls. */
function assistantMessage(body, ...calls) {
  const content = []
  if (body.length > 0) content.push({ type: 'text', text: body })
  for (const [id, name, args] of calls) {
    content.push({ type: 'tool-call', id, name, arguments: JSON.stringify(args) })
  }
  return { role: 'assistant', content }
}

/** One DSH tool-result message. */
function toolResultMessage(toolCallId, body, isError = false) {
  return {
    role: 'user',
    content: [
      { type: 'tool-result', toolCallId, content: [{ type: 'text', text: body }], isError },
    ],
  }
}

/** A system head, as the backend prepends for prefix-cache reuse. */
function systemMessage(body) {
  return { role: 'system', content: [{ type: 'text', text: body }] }
}

/** Render a region where every call gets the supplied action. */
function renderWith(region, action, truncateHeadChars = 300) {
  const messages = [userMessage('goal'), ...region]
  const projected = projectMessages(messages)
  const calls = collectToolCalls(projected, 0)
  const decisions = calls.map((call) =>
    decideCall(
      call,
      action === 'drop_call'
        ? { keepCall: 0, keepResult: 0 }
        : action === 'drop_result'
          ? { keepCall: 1, keepResult: 0 }
          : { keepCall: 1, keepResult: 1 },
      { keepThreshold: 0.5 },
    ),
  )
  return renderRegion({
    messages,
    calls,
    decisions,
    truncateHeadChars,
    stateStage: 'full',
    stateTokens: 100,
    requests: 1,
  })
}

/** The concatenated text of a render result. */
function textOf(rendered) {
  return rendered.blocks.map((block) => block.text).join('\n')
}

test('splitSystemHead separates the prepended system head from the region', () => {
  const { head, region } = splitSystemHead([systemMessage('persona'), userMessage('hi')])
  assert.equal(head.role, 'system')
  assert.equal(region.length, 1)
  assert.equal(region[0].role, 'user')

  const without = splitSystemHead([userMessage('hi')])
  assert.equal(without.head, undefined)
  assert.equal(without.region.length, 1)
})

test('projectMessages lifts text, tool calls, and tool results', () => {
  const region = [
    assistantMessage('reading', ['c1', 'Read', { file_path: 'src/a.ts' }]),
    toolResultMessage('c1', 'file body'),
  ]
  const [asked, answered] = projectMessages(region)
  assert.equal(asked.role, 'assistant')
  assert.equal(asked.text, 'reading')
  assert.equal(asked.toolUses.length, 1)
  assert.deepEqual(asked.toolUses[0], {
    toolUseId: 'c1',
    tool: 'Read',
    input: { file_path: 'src/a.ts' },
  })
  assert.equal(answered.toolResults.length, 1)
  assert.equal(answered.toolResults[0].text, 'file body')
  assert.equal(answered.toolResults[0].isError, false)
})

test('projectMessages keeps arguments that are not JSON', () => {
  const region = [
    { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'Bash', arguments: 'rm -rf /' }] },
  ]
  assert.deepEqual(projectMessages(region)[0].toolUses[0].input, { arguments: 'rm -rf /' })
})

test('projectMessages names non-text blocks instead of dropping them silently', () => {
  const region = [
    { role: 'user', content: [{ type: 'image', attachment: { id: 'a' } }, { type: 'text', text: 'look' }] },
  ]
  const [projected] = projectMessages(region)
  assert.match(projected.text, /1 non-text block\(s\)/)
  assert.match(projected.text, /look/)
})

test('a system message inside the region is projected under the user role', () => {
  const region = [systemMessage('in-history instructions'), userMessage('hi')]
  const [projected] = projectMessages(region)
  assert.equal(projected.role, 'user')
  assert.equal(projected.text, 'in-history instructions')
})

test('a pinned first call is never a candidate, whatever the answers say', () => {
  const messages = [
    assistantMessage('', ['c1', 'Read', { file_path: 'src/a.ts' }]),
    toolResultMessage('c1', 'body'),
  ]
  const calls = collectToolCalls(projectMessages(messages), 0)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].pinned, true)
  const decision = decideCall(calls[0], { keepCall: 0, keepResult: 0 }, { keepThreshold: 0.5 })
  assert.equal(decision.action, 'keep')
})

test('rendering a kept call keeps the result verbatim', () => {
  const body = 'the exact file body, with src/generated/a.ts and 4213 tokens'
  const rendered = renderWith(
    [
      assistantMessage('reading', ['c1', 'Read', { file_path: 'src/a.ts' }]),
      toolResultMessage('c1', body),
    ],
    'keep',
  )
  const text = textOf(rendered)
  assert.ok(text.includes(body), 'the result body is copied byte-for-byte')
  assert.ok(text.includes('[tool call Read c1] {"file_path":"src/a.ts"}'), 'the input is verbatim')
  assert.ok(!text.includes('released by Jev'))
})

test('a dropped result keeps a bounded head and is named as released', () => {
  const body = `${'h'.repeat(400)}${'t'.repeat(400)}`
  const rendered = renderWith(
    [
      assistantMessage('reading', ['c1', 'Read', { file_path: 'src/a.ts' }]),
      toolResultMessage('c1', body),
    ],
    'drop_result',
    300,
  )
  const text = textOf(rendered)
  assert.match(text, /800 chars released by Jev/)
  assert.match(text, /re-run the tool if needed/)
  assert.ok(text.includes('h'.repeat(300)), 'a bounded head survives')
  assert.ok(!text.includes('h'.repeat(301)), 'the head is bounded by truncateHeadChars')
  assert.ok(!text.includes('t'.repeat(400)), 'the released tail is gone')
})

test('a dropped result short enough to defend is kept whole', () => {
  const rendered = renderWith(
    [
      assistantMessage('reading', ['c1', 'Read', { file_path: 'src/a.ts' }]),
      toolResultMessage('c1', 'a short body'),
    ],
    'drop_result',
    300,
  )
  const text = textOf(rendered)
  assert.match(text, /a short body/, 'nothing is lost from a result that was never large')
  assert.match(text, /1 result\(s\) released/, 'the ledger counts the release')
  assert.ok(!/chars released by Jev/.test(text), 'no truncation line is emitted when the body is intact')
})

test('a dropped call removes its input and its result together', () => {
  const rendered = renderWith(
    [
      assistantMessage('reading', ['c1', 'Read', { file_path: 'src/secret.ts' }]),
      toolResultMessage('c1', 'secret body'),
    ],
    'drop_call',
  )
  const text = textOf(rendered)
  assert.ok(!text.includes('src/secret.ts'), 'the call input is gone')
  assert.ok(!text.includes('secret body'), 'the result is gone')
})

test('no tool result is ever rendered without its call', () => {
  const rendered = renderWith(
    [
      assistantMessage('', ['c1', 'Read', { file_path: 'src/a.ts' }]),
      toolResultMessage('c1', 'body'),
    ],
    'drop_call',
  )
  const text = textOf(rendered)
  assert.ok(!text.includes('[tool result c1'), 'the orphaned result was removed with its call')
  assert.ok(!text.includes('--- assistant ---'), 'the emptied assistant message produced no block')
})

test('mixed decisions keep one call and release the other', () => {
  const messages = [
    userMessage('goal'),
    assistantMessage('', ['c1', 'Read', { file_path: 'src/a.ts' }], ['c2', 'Bash', { command: 'ls' }]),
    toolResultMessage('c1', 'kept body'),
    toolResultMessage('c2', `released ${'x'.repeat(600)}`),
  ]
  const calls = collectToolCalls(projectMessages(messages), 0)
  const decisions = [
    decideCall(calls[0], { keepCall: 1, keepResult: 1 }, { keepThreshold: 0.5 }),
    decideCall(calls[1], { keepCall: 1, keepResult: 0 }, { keepThreshold: 0.5 }),
  ]
  const rendered = renderRegion({
    messages,
    calls,
    decisions,
    truncateHeadChars: 4,
    stateStage: 'full',
    stateTokens: 1,
    requests: 1,
  })
  const text = textOf(rendered)
  assert.ok(text.includes('kept body'), 'the kept result stays verbatim')
  assert.ok(!text.includes('x'.repeat(600)), 'the released result body is gone')
  assert.ok(text.includes('[tool call Read c1]'))
  assert.ok(text.includes('[tool call Bash c2]'), 'a call with a released result keeps its input')
})

test('the ledger names every decision count', () => {
  const rendered = renderWith(
    [
      assistantMessage('', ['c1', 'Read', { file_path: 'a' }]),
      toolResultMessage('c1', 'a body'),
      assistantMessage('', ['c2', 'Read', { file_path: 'b' }]),
      toolResultMessage('c2', 'b body'),
    ],
    'drop_call',
  )
  assert.match(rendered.blocks[0].text, /2 tool call\(s\) scored/)
  assert.match(rendered.blocks[0].text, /2 call\(s\) removed/)
  assert.match(rendered.blocks[0].text, /verbatim/)
})

test('rendering reports the character accounting and dropped block count', () => {
  const rendered = renderWith(
    [
      { role: 'user', content: [{ type: 'image', attachment: { id: 'a' } }] },
      userMessage('plain text'),
    ],
    'keep',
  )
  assert.equal(rendered.droppedBlocks, 1)
  assert.ok(rendered.charsBefore > 0)
  assert.ok(rendered.charsAfter > 0)
})

test('an error result is marked as an error, not as success', () => {
  const rendered = renderWith(
    [
      assistantMessage('', ['c1', 'Bash', { command: 'false' }]),
      toolResultMessage('c1', 'exit code 1', true),
    ],
    'keep',
  )
  assert.match(textOf(rendered), /\[tool result c1 error\]/)
})
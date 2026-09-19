/**
 * Unit tests for the Jev decision plan, the wire protocol, and the shared
 * transcript types.
 *
 * These exercise the ported core: the upstream behaviors that the plugin's
 * promise rests on — pairing a call with its result, pinning the head and tail,
 * the keep thresholds, the staged state fitting, and request batching.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_JEV_OPTIONS,
  batchCalls,
  collectToolCalls,
  decideCall,
  fitState,
  goalFromMessages,
  isPinned,
  resolveJevOptions,
} from '../lib/jev/plan.js'
import { estimateTokens, truncate, abridge } from '../lib/jev/tokens.js'
import {
  JevHttpClient,
  buildJevRequest,
  noulAnswer,
  parseJevResponse,
} from '../lib/jev/protocol.js'

/** One projected message with no tool traffic. */
function text(role, body) {
  return { role, text: body, toolUses: [], toolResults: [] }
}

/** One projected assistant message requesting a call. */
function call(role, toolCallId, tool, input, body = '') {
  return {
    role,
    text: body,
    toolUses: [{ toolUseId: toolCallId, tool, input }],
    toolResults: [],
  }
}

/** One projected user message carrying a result. */
function result(toolCallId, body, isError = false) {
  return {
    role: 'user',
    text: '',
    toolUses: [],
    toolResults: [{ toolUseId: toolCallId, text: body, isError }],
  }
}

/** A transcript with one complete call/result pair between filler messages. */
function pairedTranscript(resultBody = 'x'.repeat(400)) {
  return [
    text('user', 'fix the failing test'),
    call('assistant', 'c1', 'Read', { file_path: 'src/a.ts' }),
    result('c1', resultBody),
    text('assistant', 'the file looks fine'),
    text('user', 'keep going'),
  ]
}

test('isPinned keeps the first message and the newest tail', () => {
  assert.equal(isPinned(0, 10, 3), true, 'index 0 is always pinned')
  assert.equal(isPinned(7, 10, 3), true, 'the newest three are pinned')
  assert.equal(isPinned(6, 10, 3), false)
})

test('collectToolCalls pairs a call with its result and pins by position', () => {
  const calls = collectToolCalls(pairedTranscript(), 2)
  assert.equal(calls.length, 1)
  const [only] = calls
  assert.equal(only.tool, 'Read')
  assert.equal(only.callId, 'c1')
  assert.equal(only.id, 't1', 'short ids are assigned in transcript order')
  assert.equal(only.callIndex, 1)
  assert.equal(only.resultIndex, 2)
  assert.equal(only.resultChars, 400)
  assert.equal(only.isError, false)
  assert.equal(only.pinned, false, 'both ends sit outside the pinned head and tail')
})

test('collectToolCalls pins a call whose result is inside the retained tail', () => {
  const calls = collectToolCalls(pairedTranscript(), 4)
  assert.equal(calls[0].pinned, true, 'a result in the newest four messages is pinned')
})

test('collectToolCalls ignores a call with no result', () => {
  const messages = [text('user', 'hi'), call('assistant', 'c9', 'Read', {})]
  assert.deepEqual(collectToolCalls(messages, 0), [])
})

test('decideCall applies the keep threshold in result-then-call order', () => {
  const kept = decideCall({ id: 't1', tool: 'Read', pinned: false }, { keepCall: 0.9, keepResult: 0.8 }, { keepThreshold: 0.5 })
  assert.equal(kept.action, 'keep')
  assert.equal(kept.reason, 'kept')

  const droppedResult = decideCall({ id: 't1', tool: 'Read', pinned: false }, { keepCall: 0.9, keepResult: 0.1 }, { keepThreshold: 0.5 })
  assert.equal(droppedResult.action, 'drop_result')

  const droppedCall = decideCall({ id: 't1', tool: 'Read', pinned: false }, { keepCall: 0.1, keepResult: 0.0 }, { keepThreshold: 0.5 })
  assert.equal(droppedCall.action, 'drop_call')

  const pinned = decideCall({ id: 't1', tool: 'Read', pinned: true }, { keepCall: 0, keepResult: 0 }, { keepThreshold: 0.5 })
  assert.equal(pinned.action, 'keep')
  assert.equal(pinned.reason, 'pinned', 'a pinned call is kept whatever Jev answers')
})

test('resolveJevOptions falls back to upstream defaults and clamps retention', () => {
  assert.deepEqual(resolveJevOptions(), DEFAULT_JEV_OPTIONS)
  const resolved = resolveJevOptions({ preserveRecentMessages: -4, maxStateTokens: Number.NaN })
  assert.equal(resolved.preserveRecentMessages, 0)
  assert.equal(resolved.maxStateTokens, DEFAULT_JEV_OPTIONS.maxStateTokens)
})

test('estimateTokens prices words, digits, and symbols without a tokenizer', () => {
  assert.equal(estimateTokens('hello world'), 2)
  assert.equal(estimateTokens('1234'), 2)
  assert.ok(estimateTokens('a'.repeat(13)) >= 3, 'a long word costs one token per six letters')
  assert.equal(estimateTokens(''), 0)
})

test('truncate and abridge bound text without losing the tail', () => {
  assert.equal(truncate('abcdef', 10), 'abcdef')
  assert.equal(truncate('abcdefghij', 5), 'abcd…')
  assert.equal(abridge('short', 400, 150), 'short')
  const long = 'h'.repeat(100) + 't'.repeat(100)
  const abridged = abridge(long, 10, 10)
  assert.ok(abridged.startsWith('h'.repeat(10)))
  assert.ok(abridged.endsWith('t'.repeat(10)))
  assert.match(abridged, /chars omitted/)
})

test('goalFromMessages takes the last three prompt-like user messages', () => {
  const messages = [
    text('user', 'one'),
    text('assistant', 'ok'),
    text('user', 'two'),
    result('c1', 'tool output'),
    text('user', 'three'),
    text('user', 'four'),
  ]
  assert.equal(goalFromMessages(messages), 'two\nthree\nfour', 'a result-only message is not a prompt')
})

test('fitState fits a small transcript at the full stage', () => {
  const messages = pairedTranscript()
  const calls = collectToolCalls(messages, 0)
  const fitted = fitState(messages, calls, { maxStateTokens: 25_000, preserveRecentMessages: 0, goal: '' })
  assert.equal(fitted.stage, 'full')
  assert.ok(fitted.tokens > 0)
  assert.equal(
    fitted.state.history.length,
    4,
    'the result-only message contributes no entry: its note rides on the call entry',
  )
  const first = fitted.state.history[0]
  assert.equal(first.role, 'user')
  assert.equal(first.text, 'fix the failing test')
  const withCall = fitted.state.history[1]
  assert.equal(withCall.tool_calls.length, 1)
  assert.equal(withCall.tool_calls[0].id, 't1')
  assert.match(withCall.tool_calls[0].result, /^ok, 400 chars \(omitted\)$/,
    'the state replaces every result with a short note')
  assert.ok(!JSON.stringify(fitted.state).includes('x'.repeat(50)),
    'no result body reaches the state')
})

test('fitState shrinks tool inputs before anything else', () => {
  const messages = [
    text('user', 'goal'),
    call('assistant', 'c1', 'Write', { file_path: 'src/a.ts', content: 'y'.repeat(4000) }),
    result('c1', 'ok'),
    text('assistant', 'done'),
  ]
  const calls = collectToolCalls(messages, 0)
  const fitted = fitState(messages, calls, { maxStateTokens: 300, preserveRecentMessages: 0, goal: '' })
  assert.equal(fitted.stage, 'inputs<=200')
  const line = fitted.state.history[1].tool_calls[0].input
  assert.ok(line.length <= 200, 'the input was truncated to the tighter cap')
})

test('fitState throws rather than sending a state over the ceiling', () => {
  const messages = [
    text('user', 'goal'),
    call('assistant', 'c1', 'Read', {}),
    result('c1', 'ok'),
    text('assistant', 'z'.repeat(4000)),
  ]
  const calls = collectToolCalls(messages, 0)
  assert.throws(
    () => fitState(messages, calls, { maxStateTokens: 1, preserveRecentMessages: 0, goal: '' }),
    /history too large for Jev/,
  )
})

test('batchCalls splits questions that do not fit one request together', () => {
  const messages = []
  for (let i = 0; i < 40; i += 1) {
    messages.push(call('assistant', `c${i}`, 'Read', { file_path: `src/f${i}.ts` }))
    messages.push(result(`c${i}`, 'ok'))
  }
  const calls = collectToolCalls(messages, 0)
  const batches = batchCalls(calls, 100, { maxRequestTokens: 400 })
  assert.ok(batches.length > 1, 'the questions were split across requests')
  assert.equal(batches.flat().length, calls.length, 'every call is asked about exactly once')
})

test('batchCalls refuses a state that leaves no room for a question', () => {
  const messages = pairedTranscript()
  const calls = collectToolCalls(messages, 0)
  assert.throws(() => batchCalls(calls, 29_900, { maxRequestTokens: 30_000 }), /no room for questions/)
})

test('buildJevRequest carries the model, state, and questions verbatim', () => {
  const request = buildJevRequest(
    { apiKey: 'k', model: 'jev-latest' },
    { context: 'c', goal: 'g', history: [] },
    { q1: { type: 'noul', instructions: 'i' } },
  )
  assert.equal(request.method, 'POST')
  assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone')
  assert.equal(request.headers.authorization, 'Bearer k')
  const body = JSON.parse(request.body)
  assert.equal(body.model, 'jev-latest')
  assert.deepEqual(body.state, { context: 'c', goal: 'g', history: [] })
  assert.deepEqual(body.questions, { q1: { type: 'noul', instructions: 'i' } })
})

test('buildJevRequest honours a custom endpoint and model', () => {
  const request = buildJevRequest({ apiKey: 'k', model: 'm', baseUrl: 'http://127.0.0.1:1/x' }, {}, {})
  assert.equal(request.url, 'http://127.0.0.1:1/x')
  assert.equal(JSON.parse(request.body).model, 'm')
})

test('parseJevResponse rejects every malformed answer', () => {
  assert.throws(() => parseJevResponse(500, false, 'boom'), /Jev request failed \(500\)/)
  assert.throws(() => parseJevResponse(200, true, 'not json'), /malformed JSON/)
  assert.throws(() => parseJevResponse(200, true, '{"model":"m"}'), /missing answers/)
  assert.throws(() => parseJevResponse(200, true, '{"answers":null}'), /missing answers/)
  assert.deepEqual(parseJevResponse(200, true, '{"answers":{}}'), { answers: {} })
})

test('noulAnswer returns the probability and rejects anything else', () => {
  assert.equal(noulAnswer({ a: { noul: 0.25 } }, 'a'), 0.25)
  assert.throws(() => noulAnswer({}, 'a'), /Invalid Jev answer for a/)
  assert.throws(() => noulAnswer({ a: {} }, 'a'), /Invalid Jev answer for a/)
  assert.throws(() => noulAnswer({ a: { noul: Number.NaN } }, 'a'), /Invalid Jev answer for a/)
})

test('JevHttpClient fails closed without a credential', async () => {
  const client = new JevHttpClient({ apiKey: '' })
  await assert.rejects(() => client.ask({}, {}), /TYPESAFE_API_KEY is not configured/)
})

test('JevHttpClient sends the built request through the injected fetch', async () => {
  const seen = []
  const fetcher = async (url, init) => {
    seen.push({ url, init })
    return {
      status: 200,
      ok: true,
      text: async () => '{"answers":{"x":{"noul":0.7}}}',
    }
  }
  const client = new JevHttpClient({ apiKey: 'k', model: 'm', fetch: fetcher })
  const response = await client.ask({ context: 'c' }, { x: { type: 'noul', instructions: 'i' } })
  assert.equal(response.answers.x.noul, 0.7)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].url, 'https://api.typesafe.ai/v1/systemone')
  assert.equal(seen[0].init.method, 'POST')
  assert.ok(seen[0].init.signal instanceof AbortSignal, 'the call is bounded by a signal')
})

test('JevHttpClient surfaces a transport failure', async () => {
  const fetcher = async () => ({ status: 401, ok: false, text: async () => 'unauthorized' })
  const client = new JevHttpClient({ apiKey: 'k', fetch: fetcher })
  await assert.rejects(() => client.ask({}, {}), /Jev request failed \(401\)/)
})
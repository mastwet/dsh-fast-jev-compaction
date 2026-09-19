/**
 * Integration tests for the compaction backend itself.
 *
 * These are the tests that hold the plugin to its two contracts:
 *
 * 1. `BasicCompactionEngine` really dispatches its `summarize()` hook to this
 *    subclass, and accepts the shape it returns.
 * 2. Every condition that makes Jev unusable delegates to the base backend's
 *    model summary rather than failing the compaction.
 *
 * `JevCompactionEngine.prototype.summarize` is protected, which is a
 * compile-time modifier only; the tests call it directly. No network is
 * touched: the transport is reached through `globalThis.fetch`, which is
 * replaced for the duration of a test.
 */

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'

import { JevCompactionEngine } from '../lib/index.js'

const KEY_ENV = 'DSH_JEV_TEST_KEY'
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env[KEY_ENV]
})

/** One DSH user message carrying plain text. */
function user(text) {
  return { role: 'user', content: [{ type: 'text', text }] }
}

/** One DSH assistant message with text and tool calls. */
function assistant(text, ...calls) {
  const content = []
  if (text !== undefined) content.push({ type: 'text', text })
  for (const [id, name, args] of calls) {
    content.push({ type: 'tool-call', id, name, arguments: JSON.stringify(args) })
  }
  return { role: 'assistant', content }
}

/** One DSH tool-result message. */
function result(toolCallId, body) {
  return {
    role: 'user',
    content: [{ type: 'tool-result', toolCallId, content: [{ type: 'text', text: body }], isError: false }],
  }
}

/** A region with two unreleasable-size results outside the pinned head and tail. */
function region() {
  return [
    user('find the bug'),
    assistant(undefined, ['c1', 'Read', { file_path: 'src/a.ts' }]),
    result('c1', `A${'a'.repeat(4_000)}`),
    assistant(undefined, ['c2', 'Bash', { command: 'grep -r bug src' }]),
    result('c2', `B${'b'.repeat(4_000)}`),
    assistant('done'),
  ]
}

/** Build a context with the two services the backend reads. */
function makeContext() {
  const ctx = new Context()
  ctx.provide('tokenMeter', {
    estimateMessage: (message) => JSON.stringify(message).length,
    measure: () => ({ nodes: [], totalTokens: 0 }),
  })
  ctx.provide('llm', { stream: async function* () {} })
  Object.assign(ctx, {
    logger: { info() {}, warn: (...args) => ctx.warnings.push(args.map(String).join(' ')) },
    warnings: [],
  })
  return ctx
}

/**
 * Construct the backend over a context with a Jev credential in the environment.
 * @param jev - overrides merged into the `jev` config block.
 * @returns the engine under test.
 */
function makeEngine(jev = {}) {
  process.env[KEY_ENV] = 'test-key'
  return new JevCompactionEngine(makeContext(), {
    auto: false,
    jev: { apiKeyEnv: KEY_ENV, model: 'jev-test', preserveRecentMessages: 1, ...jev },
  })
}

/**
 * Replace the base backend's summarizer so delegation is observable.
 * @param sentinel - the summary the spy returns.
 * @returns a reader for the call count plus a restore function.
 */
function spyOnBaseSummary(sentinel) {
  const original = BasicCompactionEngine.prototype.summarize
  let calls = 0
  BasicCompactionEngine.prototype.summarize = async function () {
    calls += 1
    return sentinel
  }
  return {
    count: () => calls,
    restore: () => {
      BasicCompactionEngine.prototype.summarize = original
    },
  }
}

/** Answer every question with the supplied probabilities. */
function stubJev(call, resultProbability) {
  const seen = []
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    seen.push({ url, body })
    const answers = {}
    for (const id of Object.keys(body.questions)) {
      answers[id] = { noul: id.startsWith('result_') ? resultProbability : call }
    }
    return { status: 200, ok: true, text: async () => JSON.stringify({ answers }) }
  }
  return seen
}

test('the backend constructs as a compaction service and keeps the jev block out of the base config', () => {
  const engine = makeEngine()
  assert.equal(engine.constructor.name, 'JevCompactionEngine')
  assert.ok(engine instanceof BasicCompactionEngine)
  assert.equal(engine.config.auto, false, 'the base config survives the jev block being stripped')
  assert.equal(typeof engine.summarize, 'function')
})

test('an unset credential delegates to the built-in summary', async () => {
  delete process.env[KEY_ENV]
  const engine = new JevCompactionEngine(makeContext(), {
    auto: false,
    jev: { apiKeyEnv: KEY_ENV },
  })
  const spy = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    const out = await engine.summarize({ messages: region() }, {})
    assert.equal(spy.count(), 1)
    assert.deepEqual(out.summary, [{ type: 'text', text: 'BASE' }])
  } finally {
    spy.restore()
  }
})

test('a region carrying an image delegates to the built-in summary', async () => {
  const engine = makeEngine()
  const withImage = [
    user('look'),
    { role: 'user', content: [{ type: 'image', attachment: { id: 'a' } }] },
    assistant('done'),
  ]
  const spy = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    const out = await engine.summarize({ messages: withImage }, {})
    assert.equal(spy.count(), 1, 'the whole region is handed to the model that can see it')
    assert.equal(out.provider, 'base')
  } finally {
    spy.restore()
  }
})

test('a Jev failure delegates to the built-in summary', async () => {
  const engine = makeEngine()
  globalThis.fetch = async () => ({ status: 503, ok: false, text: async () => 'unavailable' })
  const spy = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    const out = await engine.summarize({ messages: region() }, {})
    assert.equal(spy.count(), 1)
    assert.equal(out.provider, 'base')
  } finally {
    spy.restore()
  }
})

test('a decision that releases too little delegates to the built-in summary', async () => {
  const engine = makeEngine()
  stubJev(1, 1)
  const spy = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    const out = await engine.summarize({ messages: region() }, {})
    assert.equal(spy.count(), 1, 'keeping everything cannot shrink the region')
    assert.equal(out.provider, 'base')
  } finally {
    spy.restore()
  }
})

test('the released region becomes a verbatim checkpoint under the typesafe provider', async () => {
  const engine = makeEngine()
  const requests = stubJev(1, 0)
  const out = await engine.summarize({ messages: region() }, {})

  assert.equal(out.provider, 'typesafe', `fallback warnings: ${JSON.stringify(engine.ctx.warnings)}`)
  assert.equal(out.model, 'jev-test')
  assert.equal(out.llmStreamCall, undefined, 'this content came from Jev, not one llm stream call')
  assert.equal(requests.length, 1, 'one request carries every question batch')

  const text = out.summary.map((block) => block.text).join('\n')
  assert.match(text, /2 tool call\(s\) scored/, 'both calls were scored')
  assert.match(text, /2 result\(s\) released/)
  assert.match(text, /find the bug/, 'retained text is verbatim')
  assert.match(text, /\[tool call Read c1\] \{"file_path":"src\/a\.ts"\}/, 'the call input is verbatim')
  assert.ok(!text.includes('b'.repeat(4_000)), 'the released result bodies are gone')
  assert.ok(!text.includes('a'.repeat(4_000)), 'the released result bodies are gone')
})

test('the questions name both the call and its result, keyed by short id', async () => {
  const engine = makeEngine()
  const requests = stubJev(1, 0)
  await engine.summarize({ messages: region() }, {})

  const body = requests[0].body
  assert.equal(requests[0].url, 'https://api.typesafe.ai/v1/systemone')
  assert.equal(body.model, 'jev-test')
  assert.deepEqual(Object.keys(body.questions).sort(), ['call_t1', 'call_t2', 'result_t1', 'result_t2'])
  for (const question of Object.values(body.questions)) assert.equal(question.type, 'noul')
  assert.equal(body.state.goal, 'find the bug', 'the goal is taken from the region')
  const serialized = JSON.stringify(body.state)
  assert.ok(!serialized.includes('a'.repeat(50)), 'no result body is sent to Jev')
})

test('a dropped call removes its input while the kept call keeps its own', async () => {
  const engine = makeEngine()
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    const answers = {}
    for (const id of Object.keys(body.questions)) {
      answers[id] = { noul: id === 'call_t2' || id === 'result_t2' ? 0 : 1 }
    }
    return { status: 200, ok: true, text: async () => JSON.stringify({ answers }) }
  }
  const out = await engine.summarize({ messages: region() }, {})
  const text = out.summary.map((block) => block.text).join('\n')
  assert.match(text, /src\/a\.ts/, 'the kept call keeps its input')
  assert.ok(!text.includes('grep -r bug src'), 'the removed call lost its input')
  assert.ok(!text.includes('b'.repeat(4_000)), 'the removed call lost its result')
})

test('cancellation propagates instead of degrading to a summary', async () => {
  const engine = makeEngine()
  const controller = new AbortController()
  controller.abort()
  globalThis.fetch = async () => {
    throw controller.signal.reason
  }
  const spy = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    await assert.rejects(() => engine.summarize({ messages: region() }, {}, controller.signal))
    assert.equal(spy.count(), 0, 'an aborted compaction is not silently replaced by a summary')
  } finally {
    spy.restore()
  }
})

test('a region with no tool traffic asks Jev nothing', async () => {
  const engine = makeEngine()
  let called = 0
  globalThis.fetch = async () => {
    called += 1
    return { status: 200, ok: true, text: async () => '{"answers":{}}' }
  }
  const spy = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    const out = await engine.summarize({ messages: [user('a'), assistant('b'), user('c')] }, {})
    assert.equal(called, 0, 'nothing to score means no request')
    assert.equal(spy.count(), 1, 'and no reduction to make, so the base summary is used')
    assert.equal(out.provider, 'base')
  } finally {
    spy.restore()
  }
})
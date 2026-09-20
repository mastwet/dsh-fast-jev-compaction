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
 * Add the host's settings provider, holding the namespace this package owns.
 * @param ctx - the context to extend.
 * @param section - the resolved section the provider serves; omit it to leave
 * the service absent, which is how a deployment without the host half looks.
 * @returns the same context.
 */
function withSettings(ctx, section) {
  if (section !== undefined) {
    ctx.provide('settings', { get: (ns) => (ns === 'dsh-compaction-jev' ? section : undefined) })
  }
  return ctx
}

/**
 * Construct the backend over a context with Jev switched on and a credential in
 * the environment.
 * @param settings - overrides merged into the enabled namespace section.
 * @returns the engine under test.
 */
function makeEngine(settings = {}) {
  process.env[KEY_ENV] = 'test-key'
  const ctx = withSettings(makeContext(), {
    enabled: true,
    apiKeyEnv: KEY_ENV,
    model: 'jev-test',
    preserveRecentMessages: 1,
    ...settings,
  })
  return new JevCompactionEngine(ctx, { auto: false })
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

/**
 * Count outbound requests while answering nothing, so a backend that must not
 * ask Jev is held to asking nothing rather than to failing quietly.
 * @returns a reader for the request count.
 */
function countingJev() {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return { status: 200, ok: true, text: async () => '{"answers":{}}' }
  }
  return () => calls
}

test('the backend constructs as a compaction service under the base configuration', () => {
  const engine = makeEngine()
  assert.equal(engine.constructor.name, 'JevCompactionEngine')
  assert.ok(engine instanceof BasicCompactionEngine)
  assert.equal(engine.config.auto, false, 'the row config is the base backend own config')
  assert.equal(typeof engine.summarize, 'function')
})

test('a method invoked through a cordis service shadow still decides', async () => {
  // cordis calls every service method with a shadow object as `this`
  // (vendor/cordis/src/utils.ts, createShadowMethod). The shadow forwards
  // ordinary property reads to the real instance, but it is a proxy and has no
  // ECMAScript private brand, so any #member reached through it throws
  // "Cannot read private member #… from an object whose class did not declare
  // it". `/compact` enters the backend that way from the host realm while the
  // backend is composed inside an agent preset's isolated group. A plain proxy
  // reproduces that call exactly.
  const engine = makeEngine()
  const shadow = new Proxy(engine, {})
  const requests = stubJev(1, 0)
  const out = await shadow.summarize({ messages: region() }, {})
  assert.equal(out.provider, 'typesafe', `shadow call failed: ${JSON.stringify(engine.ctx.warnings)}`)
  assert.equal(requests.length, 1)
})

test('the shadowed call takes the disabled and unset-credential paths too', async () => {
  // Both early returns touch instance state, so both are reached through a
  // shadow here rather than only through the real instance.
  const disabled = new Proxy(makeEngine({ enabled: false }), {})
  const requests = countingJev()
  const spy = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    const out = await disabled.summarize({ messages: region() }, {})
    assert.equal(out.provider, 'base')
    assert.equal(requests(), 0)
  } finally {
    spy.restore()
  }

  delete process.env[KEY_ENV]
  const credentialless = new Proxy(
    new JevCompactionEngine(
      withSettings(makeContext(), { enabled: true, apiKeyEnv: KEY_ENV }),
      { auto: false },
    ),
    {},
  )
  const second = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    const out = await credentialless.summarize({ messages: region() }, {})
    assert.equal(out.provider, 'base')
  } finally {
    second.restore()
  }
})

test('a deployment that never mounted the host half delegates to the built-in summary', async () => {
  // The engine is the half loaded where compaction is composed; the namespace is
  // registered on the host plane. Absent it, the field defaults apply, and their
  // `enabled` is false.
  const engine = new JevCompactionEngine(makeContext(), { auto: false })
  const requests = countingJev()
  const spy = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    const out = await engine.summarize({ messages: region() }, {})
    assert.equal(spy.count(), 1)
    assert.equal(requests(), 0, 'a disabled backend asks Jev nothing')
    assert.equal(out.provider, 'base')
  } finally {
    spy.restore()
  }
})

test('switching the setting off delegates to the built-in summary even with a credential', async () => {
  const engine = makeEngine({ enabled: false })
  const requests = countingJev()
  const spy = spyOnBaseSummary({ summary: [{ type: 'text', text: 'BASE' }], provider: 'base', model: 'm' })
  try {
    const out = await engine.summarize({ messages: region() }, {})
    assert.equal(spy.count(), 1, 'the off switch is the base behavior, not a failed request')
    assert.equal(requests(), 0)
    assert.equal(out.provider, 'base')
  } finally {
    spy.restore()
  }
})

test('an unset credential delegates to the built-in summary', async () => {
  delete process.env[KEY_ENV]
  const engine = new JevCompactionEngine(
    withSettings(makeContext(), { enabled: true, apiKeyEnv: KEY_ENV }),
    { auto: false },
  )
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
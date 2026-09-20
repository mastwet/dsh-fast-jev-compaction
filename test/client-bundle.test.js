/**
 * Tests for the browser half's artifact and its registration.
 *
 * The bundle is not a library: the shell hands it a module table and takes back
 * a factory, so the artifact's own protocol is what can break — a missing
 * external, a row registered under the wrong id, an apply that reaches for a
 * service it never declared. These tests load the built file exactly that way,
 * with the baseline modules supplied and every other request refused, and drive
 * `apply` against a recording context.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const bundlePath = resolve(import.meta.dirname, '../lib/client.js')

/** A style element the page stub records, standing in for a real one. */
function createStyleElement() {
  return { id: '', textContent: '' }
}

/** Loads of the same file must re-execute it, so each gets a distinct URL. */
let bundleLoads = 0

/**
 * Load the built bundle the way the Web shell's loader does: capture the
 * registered row, then call its factory with the baseline modules and nothing
 * else.
 * @returns the registered id and the factory's exports.
 */
async function loadBundle() {
  /** @type {{ id: string, factory: (require: (name: string) => unknown) => Record<string, unknown> }} */
  let row
  const appended = []
  const present = new Set()
  globalThis.window = { __ModuleLoader__: { load: (registered) => { row = registered } } }
  globalThis.document = {
    getElementById: (id) => (present.has(id) ? createStyleElement() : null),
    createElement: () => createStyleElement(),
    head: {
      append: (element) => {
        appended.push(element)
        present.add(element.id)
      },
    },
  }

  bundleLoads += 1
  await import(`${pathToFileURL(bundlePath).href}?load=${bundleLoads}`)
  assert.ok(row !== undefined, 'the bundle registers one loader row')

  const baseline = new Map([
    ['react', require('react')],
    ['react/jsx-runtime', require('react/jsx-runtime')],
    ['@deepseek-ai/dsh-client-ui-primitives', {
      Button: () => null,
      Switch: () => null,
      Tag: () => null,
    }],
  ])
  const requested = []
  const exported = row.factory((name) => {
    requested.push(name)
    assert.ok(baseline.has(name), `the bundle requested an undeclared module: ${name}`)
    return baseline.get(name)
  })
  return { id: row.id, exported, requested, appended }
}

/** A client context that records every registration and returns an inert scope. */
function createContext() {
  const registered = []
  const effects = []
  const dictionaries = []
  const writes = []
  const scope = {
    getSnapshot: () => ({ status: 'ready', value: undefined, user: undefined, writable: true, revision: 1, mode: 'host', base: undefined }),
    subscribe: () => () => {},
    set: async (field, value) => { writes.push(['set', field, value]) },
    unset: async (field) => { writes.push(['unset', field]) },
  }
  const ctx = {
    effect: (contribute, label) => { effects.push(label); return contribute() },
    locale: {
      register: (namespace, dictionaries_ = {}) => {
        dictionaries.push({ namespace, keys: Object.keys(dictionaries_).sort() })
        return () => {}
      },
      bind: (namespace) => (key) => `${namespace}:${key}`,
    },
    settingsScope: { bind: (spec) => Object.assign(scope, { spec }) },
    slots: {
      inject: (name, contribute) => { registered.push(['inject', name]); return contribute() },
      register: (options, component) => {
        registered.push(['register', options, component])
        return () => {}
      },
    },
  }
  return { ctx, registered, effects, dictionaries, writes, scope }
}

test('the bundle registers one loader row under the package name', async () => {
  const { id, exported, requested } = await loadBundle()
  assert.equal(id, 'dsh-compaction-jev')
  assert.equal(typeof exported.apply, 'function')
  assert.deepEqual(exported.inject, ['slots', 'locale', 'settingsScope'])
  assert.equal('default' in exported, false)
  assert.deepEqual(requested.sort(), [
    '@deepseek-ai/dsh-client-ui-primitives',
    'react',
    'react/jsx-runtime',
  ])
})

test('applying the browser half registers one settings section', async () => {
  const { exported } = await loadBundle()
  const { ctx, registered, dictionaries, effects } = createContext()
  exported.apply(ctx)

  assert.deepEqual(effects, ['dsh-compaction-jev: dictionaries'])
  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0].namespace, 'settings.jev')
  assert.deepEqual(registered[0], ['inject', 'settings.section'])

  const [kind, options, component] = registered[1]
  assert.equal(kind, 'register')
  assert.equal(options.name, 'settings.section')
  assert.equal(options.id, 'jev-compaction')
  assert.equal(options.locale, 'settings.jev')
  assert.equal(typeof options.label(), 'string')
  assert.equal(typeof component, 'function')
})

test('the injected face writes the namespace the backend reads', async () => {
  const { exported } = await loadBundle()
  const { ctx, registered, writes, scope } = createContext()
  exported.apply(ctx)

  const options = registered[1][1]
  const face = options.inject()
  assert.equal(face.hooks.jevSettings, scope)
  assert.equal(scope.spec.namespace, 'dsh-compaction-jev')

  await face.setEnabled(true)
  await face.save([{ field: 'keepThreshold', value: 0.3 }, { field: 'goal', value: 'ship it' }])
  await face.reset('model')
  assert.deepEqual(writes, [
    ['set', 'enabled', true],
    ['set', 'keepThreshold', 0.3],
    ['set', 'goal', 'ship it'],
    ['unset', 'model'],
  ])
})

test('the sheet is inserted once, whatever the apply count', async () => {
  const { exported, appended } = await loadBundle()
  const { ctx } = createContext()
  exported.apply(ctx)
  exported.apply(ctx)
  assert.equal(appended.length, 1)
  assert.match(appended[0].id, /^dsh-compaction-jev-styles$/)
  // Every class the component uses has a rule: a class without one renders bare.
  for (const name of ['section', 'title', 'toggle', 'field', 'input', 'actions', 'hint']) {
    assert.match(appended[0].textContent, new RegExp(`\\.jev-${name}\\{`), `missing rule for jev-${name}`)
  }
})
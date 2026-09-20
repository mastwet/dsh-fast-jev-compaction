/**
 * Tests for the settings namespace and the host half that owns it.
 *
 * The field table is the single home for each field's type, default, and bounds,
 * and the schema is derived from it. These tests hold the two ends together in
 * both directions: what the provider validates is what the table declares, and
 * an absent provider — the fail-safe path a deployment without the host half
 * takes — resolves to a disabled backend of the base behavior.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'

import * as hostHalf from '../lib/settings/index.js'
import {
  JEV_SETTINGS_DEFAULTS,
  JEV_SETTINGS_NAMESPACE,
  JEV_SETTING_FIELDS,
  JEV_SETTING_ORDER,
  JevSettingsSchema,
  resolveJevSettings,
} from '../lib/index.js'

test('the namespace key is the lowercase identifier a settings namespace must be', () => {
  assert.equal(JEV_SETTINGS_NAMESPACE, 'dsh-compaction-jev')
  assert.match(JEV_SETTINGS_NAMESPACE, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
})

test('the schema carries exactly the field table, in the table order', () => {
  const dict = JevSettingsSchema.dict ?? {}
  assert.deepEqual(Object.keys(dict), JEV_SETTING_ORDER)
  for (const key of JEV_SETTING_ORDER) {
    assert.equal(dict[key].type, JEV_SETTING_FIELDS[key].kind, `${key} is edited as its table kind`)
  }
})

test('an empty section resolves to exactly the table defaults', () => {
  assert.deepEqual(JevSettingsSchema({}), JEV_SETTINGS_DEFAULTS)
})

test('the schema holds a number to the bounds the table declares', () => {
  assert.throws(
    () => JevSettingsSchema({ keepThreshold: 1.5 }),
    /keepThreshold/,
    'above the table maximum',
  )
  assert.throws(
    () => JevSettingsSchema({ truncateHeadChars: -1 }),
    /truncateHeadChars/,
    'below the table minimum',
  )
  assert.equal(JevSettingsSchema({ keepThreshold: 0.75 }).keepThreshold, 0.75)
})

test('the schema rejects a value of the wrong type', () => {
  assert.throws(() => JevSettingsSchema({ timeoutMs: 'soon' }), /timeoutMs/)
  assert.throws(() => JevSettingsSchema({ enabled: 'yes' }), /enabled/)
})

test('a mistyped key is carried by the section but never read', () => {
  // schemastery has no strict object mode, so an undeclared key survives
  // resolution rather than failing it. It is inert: the backend reads declared
  // fields only, so the field the typo was meant for keeps its default — which
  // is what the Settings page renders, making the typo show up as "the switch
  // did not take effect" instead of letting some other value apply quietly.
  const resolved = JevSettingsSchema({ keepThreshhold: 0.9 })
  assert.equal(resolved.keepThreshhold, 0.9, 'carried, so a hand edit is not silently erased')
  assert.equal(
    resolveJevSettings(resolved).keepThreshold,
    JEV_SETTINGS_DEFAULTS.keepThreshold,
    'and inert, because the backend reads the declared field',
  )
})

test('an absent provider resolves to disabled defaults', () => {
  const resolved = resolveJevSettings(undefined)
  assert.equal(resolved.enabled, false, 'nothing is switched on by installing the package')
  assert.deepEqual(resolved, JEV_SETTINGS_DEFAULTS)
})

test('a section missing a field keeps that field default', () => {
  const resolved = resolveJevSettings({ enabled: true })
  assert.equal(resolved.enabled, true)
  assert.equal(resolved.model, JEV_SETTINGS_DEFAULTS.model)
})

test('the host half declares its plugin name and needs only the settings provider', () => {
  assert.equal(hostHalf.name, 'dsh-compaction-jev-settings')
  assert.deepEqual(hostHalf.inject, ['settings'])
})

test('the host half registers the namespace once and tolerates a second mount', () => {
  const registered = []
  const warnings = []
  const ctx = new Context()
  ctx.provide('settings', {
    register: (ns) => {
      if (registered.includes(ns)) throw new Error(`settings namespace "${ns}" is already registered`)
      registered.push(ns)
    },
  })
  Object.assign(ctx, { logger: { warn: (...args) => warnings.push(args.map(String).join(' ')) } })

  hostHalf.apply(ctx)
  hostHalf.apply(ctx)

  assert.deepEqual(registered, [JEV_SETTINGS_NAMESPACE], 'the first mount owns the namespace')
  assert.equal(warnings.length, 1, 'the second mount reports instead of failing the plugin tree')
  assert.match(warnings[0], /already registered/)
})
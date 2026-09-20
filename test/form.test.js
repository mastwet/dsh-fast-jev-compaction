/**
 * Tests for the settings page's staging rules and the copy that must cover
 * every field.
 *
 * The page writes only what a save plans, so the interesting behavior is what it
 * refuses and what it skips: invalid text must never reach the document, text
 * that restates the standing value must not silently become an override, and a
 * field the table gains must not reach the page without its label and hint.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { JEV_SETTINGS_DEFAULTS, JEV_SETTING_ORDER } from '../lib/index.js'
import { JEV_STAGED_FIELDS, draftFrom, isOverridden, issueOf, planWrites } from '../lib/settings/form.js'
import { en, zh } from '../lib/settings/locales.js'

/** A resolved section a deployment could hand the page. */
const SETTINGS = { ...JEV_SETTINGS_DEFAULTS, enabled: true, keepThreshold: 0.4 }

test('every field carries a label and a hint in both dictionaries', () => {
  for (const field of JEV_SETTING_ORDER) {
    for (const [name, dictionary] of [['en', en], ['zh', zh]]) {
      assert.equal(typeof dictionary[`${field}Label`], 'string', `${name}: ${field}Label`)
      assert.equal(typeof dictionary[`${field}Hint`], 'string', `${name}: ${field}Hint`)
    }
  }
})

test('both dictionaries declare the same keys', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
})

test('the toggle is not staged, so it writes on the click', () => {
  assert.equal(JEV_STAGED_FIELDS.includes('enabled'), false)
  assert.equal(JEV_STAGED_FIELDS.length, JEV_SETTING_ORDER.length - 1)
})

test('a draft shows the resolved value until the user layer carries its own', () => {
  assert.equal(draftFrom(SETTINGS, undefined).keepThreshold, '0.4')
  assert.equal(draftFrom(SETTINGS, undefined).model, JEV_SETTINGS_DEFAULTS.model)
  assert.equal(draftFrom(SETTINGS, { keepThreshold: 0.05 }).keepThreshold, '0.05')
})

test('a stored layer that is not an object reads as carrying nothing', () => {
  assert.equal(isOverridden(null, 'model'), false)
  assert.equal(isOverridden('nonsense', 'model'), false)
  assert.equal(isOverridden({ model: 'jev-latest' }, 'model'), true)
})

test('a field is overridden by presence, not by its value', () => {
  assert.equal(isOverridden({ keepThreshold: JEV_SETTINGS_DEFAULTS.keepThreshold }, 'keepThreshold'), true)
  assert.equal(isOverridden({ keepThreshold: undefined }, 'keepThreshold'), true)
})

test('empty and unparsable numbers are refused before they are written', () => {
  assert.equal(issueOf('keepThreshold', '   '), 'empty')
  assert.equal(issueOf('keepThreshold', 'abc'), 'number')
  assert.equal(issueOf('keepThreshold', '1.5'), 'range')
  assert.equal(issueOf('keepThreshold', '0.5'), undefined)
  assert.equal(issueOf('model', 'jev-latest'), undefined)
})

test('a field bounded only below refuses what is under it', () => {
  assert.equal(issueOf('timeoutMs', '0'), 'range')
  assert.equal(issueOf('timeoutMs', '1000'), undefined)
})

test('an untouched form writes nothing', () => {
  assert.deepEqual(planWrites(draftFrom(SETTINGS, undefined), undefined, SETTINGS), [])
})

test('only the fields that differ are written, in presentation order', () => {
  const draft = { ...draftFrom(SETTINGS, undefined), keepThreshold: '0.3', goal: 'ship it' }
  assert.deepEqual(planWrites(draft, undefined, SETTINGS), [
    { field: 'keepThreshold', value: 0.3 },
    { field: 'goal', value: 'ship it' },
  ])
})

test('a refused field is skipped while the rest still save', () => {
  const draft = { ...draftFrom(SETTINGS, undefined), keepThreshold: '9', model: 'jev-1.13.0' }
  assert.deepEqual(planWrites(draft, undefined, SETTINGS), [{ field: 'model', value: 'jev-1.13.0' }])
})

test('text that restates what stands writes nothing', () => {
  assert.deepEqual(planWrites(draftFrom(SETTINGS, undefined), undefined, SETTINGS), [])
  assert.deepEqual(planWrites(draftFrom(SETTINGS, { keepThreshold: 0.05 }), { keepThreshold: 0.05 }, SETTINGS), [])
})

test('staged string values are written trimmed', () => {
  const draft = { ...draftFrom(SETTINGS, undefined), goal: '  ship it  ' }
  assert.deepEqual(planWrites(draft, undefined, SETTINGS), [{ field: 'goal', value: 'ship it' }])
})
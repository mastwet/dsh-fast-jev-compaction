/**
 * Styles for the Jev settings page.
 *
 * An out-of-tree browser bundle ships one JavaScript artifact, so it cannot use
 * CSS Modules: the class names and the sheet are generated from one table here
 * (a class that is not in the sheet is impossible), and the sheet is inserted
 * once into the page. Values are the shared `--dsw-*` tokens only, so the page
 * follows the active theme.
 *
 * @module dsh-compaction-jev/client/styles
 */

/** Class body per element, keyed by the name the component uses. */
const RULES = {
  section: 'display:flex;flex-direction:column;',
  title: 'margin:0;font-size:15px;font-weight:600;line-height:1.5;color:var(--dsw-alias-label-primary);',
  intro:
    'margin:6px 0 12px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);',
  toggle:
    'display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-top:0.5px solid var(--dsw-alias-border-l2);border-bottom:0.5px solid var(--dsw-alias-border-l2);',
  toggleText: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;',
  toggleLabel:
    'display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);',
  sectionTitle:
    'margin:18px 0 0;font-size:13px;font-weight:600;line-height:1.5;color:var(--dsw-alias-label-primary);',
  field: 'display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:0.5px solid var(--dsw-alias-border-l2);',
  head: 'display:flex;align-items:center;gap:8px;',
  label:
    'flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);',
  badges: 'display:inline-flex;align-items:center;gap:8px;',
  reset:
    'border:none;background:none;padding:0;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);cursor:pointer;',
  input:
    'height:34px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);',
  inputInvalid: 'border-color:var(--dsw-alias-label-error);',
  hint: 'margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);',
  invalid: 'margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error);',
  note: 'margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);',
  advanced: 'margin-top:14px;',
  advancedSummary:
    'padding:12px 0;border-top:0.5px solid var(--dsw-alias-border-l2);cursor:pointer;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);',
  actions:
    'display:flex;align-items:center;gap:8px;padding-top:16px;border-top:0.5px solid var(--dsw-alias-border-l2);',
  actionsNote: 'flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);',
} as const

/** Class name per element, prefixed so a bundle without a stylesheet cannot collide. */
export const css = Object.fromEntries(
  Object.keys(RULES).map(name => [name, `jev-${name}`]),
) as { readonly [K in keyof typeof RULES]: string }

/** The one sheet this plugin inserts. */
export const jevStyleSheet = Object.entries(RULES)
  .map(([name, body]) => `.jev-${name}{${body}}`)
  .join('\n')

/** Id marking the inserted element, so repeated applies keep one sheet. */
export const JEV_STYLE_ELEMENT_ID = 'dsh-compaction-jev-styles'

/**
 * Insert the sheet once. Called from the plugin body, not from a render, so a
 * disposed and re-applied plugin never leaves the page without its styles.
 * @param target - document to insert into.
 */
export function ensureJevStyles(target: Document = document): void {
  if (target.getElementById(JEV_STYLE_ELEMENT_ID) !== null) return
  const element = target.createElement('style')
  element.id = JEV_STYLE_ELEMENT_ID
  element.textContent = jevStyleSheet
  target.head.append(element)
}
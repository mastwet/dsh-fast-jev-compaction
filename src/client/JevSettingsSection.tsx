/**
 * The Jev compaction settings page.
 *
 * The toggle writes immediately: turning the backend off is the gesture a user
 * reaches for when something looks wrong, and it must not depend on a save.
 * Every other value is staged and written from one save, so a half-typed number
 * never reaches the document; the namespace's own resolution supplies what an
 * untouched field shows, and a field the user layer carries states so and can be
 * cleared back to the deployment value.
 *
 * Fields come from the host field table, so the page cannot offer a control the
 * validator does not have, and no copy is written here: labels, hints, and
 * refusals are all locale keys.
 *
 * @module dsh-compaction-jev/client/JevSettingsSection
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  JEV_SETTING_FIELDS, type JevSettingField, type JevSettingKey, type JevSettings,
} from '../settings/fields.js'
import { JEV_STAGED_FIELDS, draftFrom, isOverridden, issueOf, planWrites, type JevIssue, type JevWrite } from '../settings/form.js'
import { JEV_LOCALE_NAMESPACE, type JevSettingsKey } from '../settings/locales.js'
import { css } from './styles.js'

/** Registration-side business face of the settings page. */
export interface JevSettingsInjected {
  hooks: {
    /** Namespace scope bound by the renderer as `useJevSettings`. */
    jevSettings: SettingsScope<JevSettings>
  }
  /** Write the staged fields; an empty list is a no-op. */
  save: (writes: readonly JevWrite[]) => Promise<void>
  /** Clear one field so it re-inherits the deployment value. */
  reset: (field: JevSettingKey) => Promise<void>
  /** Turn the backend on or off. */
  setEnabled: (enabled: boolean) => Promise<void>
}

/** Full component props. */
export type JevSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<typeof JEV_LOCALE_NAMESPACE>
  & InjectFace<JevSettingsInjected>

/** Copy for one refusal, stating the bound the value missed. */
function refusalCopy(t: JevSettingsSectionProps['t'], issue: JevIssue, spec: JevSettingField): string {
  if (issue === 'empty') return t('invalidEmpty')
  if (issue === 'number') return t('invalidNumber')
  if (spec.min !== undefined && spec.max !== undefined) {
    return t('invalidRange', { min: spec.min, max: spec.max })
  }
  if (spec.min !== undefined) return t('invalidMin', { min: spec.min })
  return t('invalidMax', { max: spec.max })
}

/** The staged fields, the save, and the per-field reset. */
interface JevSettingsFormProps {
  snapshot: SettingsScopeSnapshot<JevSettings>
  settings: JevSettings
  t: JevSettingsSectionProps['t']
  save: JevSettingsInjected['save']
  reset: JevSettingsInjected['reset']
}

function JevSettingsForm({ snapshot, settings, t, save, reset }: JevSettingsFormProps): ReactNode {
  const [draft, setDraft] = useState(() => draftFrom(settings, snapshot.user))
  const writable = snapshot.writable

  // Re-seed on a document move only: the revision advances exactly when a write
  // landed, so typing survives a re-render and a landed save (or another
  // surface's write) replaces the draft with what now stands.
  useEffect(() => {
    setDraft(draftFrom(settings, snapshot.user))
  }, [snapshot.revision])

  const refused = useMemo(() => {
    const found = new Map<JevSettingKey, JevIssue>()
    for (const field of JEV_STAGED_FIELDS) {
      const issue = issueOf(field, draft[field] ?? '')
      if (issue !== undefined) found.set(field, issue)
    }
    return found
  }, [draft])
  const writes = useMemo(() => planWrites(draft, snapshot.user, settings), [draft, snapshot.user, settings])

  const renderField = (field: JevSettingKey): ReactNode => {
    const spec = JEV_SETTING_FIELDS[field]
    const id = `jev-field-${field}`
    const issue = refused.get(field)
    return (
      <div className={css.field} key={field}>
        <div className={css.head}>
          <label className={css.label} htmlFor={id}>{t(`${field}Label` as JevSettingsKey)}</label>
          {isOverridden(snapshot.user, field)
            ? (
              <span className={css.badges}>
                <Tag tone="neutral">{t('overridden')}</Tag>
                <button
                  type="button"
                  className={css.reset}
                  disabled={!writable}
                  onClick={() => { void reset(field) }}
                >
                  {t('reset')}
                </button>
              </span>
            )
            : null}
        </div>
        <input
          id={id}
          className={issue === undefined ? css.input : css.inputInvalid}
          type="text"
          inputMode={spec.kind === 'number' ? 'decimal' : undefined}
          value={draft[field] ?? ''}
          disabled={!writable}
          aria-invalid={issue === undefined ? undefined : true}
          onChange={(event) => { setDraft({ ...draft, [field]: event.target.value }) }}
        />
        <p className={issue === undefined ? css.hint : css.invalid}>
          {issue === undefined
            ? t(`${field}Hint` as JevSettingsKey)
            : refusalCopy(t, issue, spec)}
        </p>
      </div>
    )
  }

  const basic = JEV_STAGED_FIELDS.filter(field => JEV_SETTING_FIELDS[field].advanced !== true)
  const advanced = JEV_STAGED_FIELDS.filter(field => JEV_SETTING_FIELDS[field].advanced === true)
  const saving = writes.length > 0
  const blocked = !writable || refused.size > 0

  return (
    <>
      <h3 className={css.sectionTitle}>{t('paramsTitle')}</h3>
      {basic.map(renderField)}
      {advanced.length === 0
        ? null
        : (
          <details className={css.advanced}>
            <summary className={css.advancedSummary}>{t('advancedSummary')}</summary>
            <p className={css.note}>{t('advancedHint')}</p>
            {advanced.map(renderField)}
          </details>
        )}
      <div className={css.actions}>
        <p className={css.actionsNote}>
          {writable ? (saving ? t('pendingHint') : t('cleanHint')) : t('notWritable')}
        </p>
        <Button
          variant="outline"
          disabled={!writable}
          onClick={() => { setDraft(draftFrom(settings, snapshot.user)) }}
        >
          {t('discard')}
        </Button>
        <Button
          disabled={blocked || !saving}
          onClick={() => { void save(writes) }}
        >
          {t('save')}
        </Button>
      </div>
    </>
  )
}

/**
 * Render the Jev compaction page: the toggle, then the values it governs.
 * @param props - runtime share, locale seat, and the injected business face.
 * @returns the page content the Settings shell mounts.
 */
export function JevSettingsSection(props: JevSettingsSectionProps): ReactNode {
  const snapshot = props.useJevSettings(sel => sel)
  const t = props.t
  if (snapshot.status === 'loading') return <p className={css.note}>{t('loading')}</p>
  const settings = snapshot.value
  if (snapshot.status === 'unavailable' || settings === undefined) {
    return <p className={css.note}>{t('unavailable')}</p>
  }
  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <div className={css.toggle}>
        <div className={css.toggleText}>
          <span className={css.toggleLabel}>
            {t('enableLabel')}
            <Tag tone={settings.enabled ? 'neutral' : 'quiet'}>
              {t(settings.enabled ? 'stateOn' : 'stateOff')}
            </Tag>
          </span>
          <p className={css.hint}>{t('enabledHint')}</p>
        </div>
        <Switch
          checked={settings.enabled}
          label={t('enableLabel')}
          disabled={!snapshot.writable}
          onChange={(next) => { void props.setEnabled(next) }}
        />
      </div>
      <JevSettingsForm snapshot={snapshot} settings={settings} t={t} save={props.save} reset={props.reset} />
    </div>
  )
}
/**
 * Jev compaction plugin, browser half.
 *
 * Registers the `settings.jev` dictionaries and one Settings section that edits
 * the `dsh-compaction-jev` namespace — the single home for whether Jev runs and
 * for every value it runs with. The page owns no values of its own: it stages
 * text and writes the namespace, which is what the backend reads at each
 * compaction.
 *
 * The namespace is registered by this package's root plugin, which the bundle
 * patch mounts on the host plane; the page reads it through the settings scope
 * service and reports a namespace it cannot reach instead of rendering an editor
 * that would write nowhere.
 *
 * @module dsh-compaction-jev/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: installs ctx.slots — the registration goes through the renderer's
// slot registry service.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `settings.section` declaration and the ctx.settingsScope
// Context merge. Collaboration goes through the service, never a value import.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { JEV_SETTINGS_NAMESPACE, type JevSettings } from '../settings/fields.js'
import { JevSettingsSection, type JevSettingsInjected } from './JevSettingsSection.js'
import { JEV_LOCALE_NAMESPACE, en, zh, type JevSettingsKey } from '../settings/locales.js'
import { ensureJevStyles } from './styles.js'

export type { JevSettingsInjected, JevSettingsSectionProps } from './JevSettingsSection.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Jev compaction settings page copy. */
    'settings.jev': JevSettingsKey
  }
}

/**
 * Required services. The target slot is declared by the settings shell, whose
 * activation order relative to this one is not constrained, so the registration
 * waits on the declaration through `slots.inject`.
 */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Register the dictionaries and the settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(JEV_LOCALE_NAMESPACE, { zh, en }), 'dsh-compaction-jev: dictionaries')
  // Not an effect: the sheet is idempotent and stays for the page's lifetime, so
  // a re-apply never leaves the section unstyled.
  ensureJevStyles()

  const scope = ctx.settingsScope.bind<JevSettings>({ namespace: JEV_SETTINGS_NAMESPACE })
  // The nav label is a thunk the shell resolves per render, so a locale change
  // needs no re-registration.
  const t = ctx.locale.bind(JEV_LOCALE_NAMESPACE)

  const injected = (): JevSettingsInjected => ({
    hooks: { jevSettings: scope },
    // One field per write. The scope fences each with the latest namespace
    // revision and reloads host state when a write is rejected, so a refused
    // value cannot leave the page showing what the document does not hold.
    save: async (writes) => {
      for (const write of writes) await scope.set(write.field, write.value)
    },
    reset: async (field) => { await scope.unset(field) },
    setEnabled: async (enabled) => { await scope.set('enabled', enabled) },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'jev-compaction',
    order: 10,
    label: () => t('nav'),
    locale: JEV_LOCALE_NAMESPACE,
    inject: injected,
  }, JevSettingsSection))
}
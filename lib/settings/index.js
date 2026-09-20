/**
 * The host half of `dsh-compaction-jev`: it owns the settings namespace every
 * Jev value lives in.
 *
 * The package's own bundle patch mounts it on the host plane, so the namespace
 * exists before any session mounts the compaction backend that reads it. Only
 * this half registers: the engine in an agent preset reads the same namespace
 * through the host's single settings provider, and a second registration would
 * fail loud.
 *
 * @module dsh-compaction-jev/settings
 */
import { JEV_SETTINGS_NAMESPACE } from './fields.js';
import { JevSettingsSchema } from './schema.js';
/** Plugin name the loader reports. */
export const name = 'dsh-compaction-jev-settings';
/** The settings provider is the only service this half needs. */
export const inject = ['settings'];
/**
 * Register the namespace.
 *
 * An already-registered namespace is reported and left alone instead of thrown:
 * a duplicate mount is a composition mistake, and failing here would take the
 * whole plugin tree down while the registered namespace still serves the engine
 * correctly.
 * @param ctx - the host context to register on.
 */
export function apply(ctx) {
    try {
        ctx.settings.register(JEV_SETTINGS_NAMESPACE, JevSettingsSchema);
    }
    catch (error) {
        ctx.logger.warn(`dsh-compaction-jev: settings namespace "${JEV_SETTINGS_NAMESPACE}" not registered by this mount (${error instanceof Error ? error.message : String(error)})`);
    }
}

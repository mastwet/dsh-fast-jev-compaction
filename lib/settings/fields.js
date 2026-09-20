/**
 * The Jev settings field table: the single home for every field's key, default,
 * type, and bounds.
 *
 * The namespace schema, the fallback used when no settings provider is mounted,
 * and the Settings page all derive from this table, so a field cannot reach the
 * validator without also reaching the page. Display text lives in the client's
 * locale dictionaries, keyed by these same field keys.
 *
 * @module dsh-compaction-jev/settings/fields
 */
import { DEFAULT_JEV_OPTIONS } from '../jev/plan.js';
import { DEFAULT_JEV_MODEL, SYSTEM_ONE_URL } from '../jev/protocol.js';
/** Settings namespace the host half registers and the engine reads. */
export const JEV_SETTINGS_NAMESPACE = 'dsh-compaction-jev';
/** The defaults, written in this one place. */
export const JEV_SETTINGS_DEFAULTS = {
    enabled: false,
    apiKeyEnv: 'TYPESAFE_API_KEY',
    model: DEFAULT_JEV_MODEL,
    baseUrl: SYSTEM_ONE_URL,
    timeoutMs: 60_000,
    minReductionRatio: 0.25,
    goal: '',
    keepThreshold: DEFAULT_JEV_OPTIONS.keepThreshold,
    preserveRecentMessages: DEFAULT_JEV_OPTIONS.preserveRecentMessages,
    maxStateTokens: DEFAULT_JEV_OPTIONS.maxStateTokens,
    maxRequestTokens: DEFAULT_JEV_OPTIONS.maxRequestTokens,
    truncateHeadChars: DEFAULT_JEV_OPTIONS.truncateHeadChars,
};
/**
 * Every field, in the order the Settings page presents them. The record type
 * makes a `JevSettings` key without an entry here a compile error, so the
 * validator and the page cannot drift apart.
 */
export const JEV_SETTING_FIELDS = {
    enabled: { kind: 'boolean' },
    keepThreshold: { kind: 'number', min: 0, max: 1, step: 0.05 },
    preserveRecentMessages: { kind: 'number', min: 0, max: 100, step: 1 },
    minReductionRatio: { kind: 'number', min: 0, max: 1, step: 0.05 },
    truncateHeadChars: { kind: 'number', min: 0, max: 10_000, step: 50 },
    model: { kind: 'string', advanced: true },
    apiKeyEnv: { kind: 'string', advanced: true },
    baseUrl: { kind: 'string', advanced: true },
    timeoutMs: { kind: 'number', min: 1_000, step: 1_000, advanced: true },
    maxStateTokens: { kind: 'number', min: 1, step: 1_000, advanced: true },
    maxRequestTokens: { kind: 'number', min: 1, step: 1_000, advanced: true },
    goal: { kind: 'string', advanced: true },
};
/** Field keys in presentation order. */
export const JEV_SETTING_ORDER = Object.keys(JEV_SETTING_FIELDS);
/**
 * Resolve the section the engine obeys from whatever the settings provider
 * holds. The provider resolves a registered namespace through the schema, so a
 * present section already carries every field; the spread only has to cover the
 * absent-provider case.
 * @param section - `settings.get(JEV_SETTINGS_NAMESPACE)`, or `undefined` when nothing registered it.
 * @returns every field resolved, defaulting to `enabled: false`.
 */
export function resolveJevSettings(section) {
    if (section === null || typeof section !== 'object')
        return JEV_SETTINGS_DEFAULTS;
    return { ...JEV_SETTINGS_DEFAULTS, ...section };
}

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
/** Settings namespace the host half registers and the engine reads. */
export declare const JEV_SETTINGS_NAMESPACE = "dsh-compaction-jev";
/** Every value the namespace carries, each one resolved. */
export interface JevSettings {
    /** Whether the backend may ask Jev at all. `false` runs the built-in summary unchanged. */
    enabled: boolean;
    /** Environment variable holding the TypeSafe API key; the credential itself never enters settings. */
    apiKeyEnv: string;
    /** Jev model name. */
    model: string;
    /** System One endpoint. */
    baseUrl: string;
    /** Per-request timeout in milliseconds. */
    timeoutMs: number;
    /** Minimum share of region characters the checkpoint must remove. */
    minReductionRatio: number;
    /** Ongoing task description placed in the state; empty uses the last three user prompts. */
    goal: string;
    /** Minimum keep probability for a call or result to stay. */
    keepThreshold: number;
    /** Newest region messages never touched; the first is always pinned. */
    preserveRecentMessages: number;
    /** Estimated token ceiling for the state. */
    maxStateTokens: number;
    /** Estimated ceiling for state plus one batch of questions. */
    maxRequestTokens: number;
    /** Characters of a dropped tool result retained before its note. */
    truncateHeadChars: number;
}
/** Name of one field. */
export type JevSettingKey = keyof JevSettings;
/** How a field is edited, and the range its value is held to. */
export interface JevSettingField {
    /** Primitive the field holds, which also selects its control and is the schema's own type name. */
    kind: 'boolean' | 'number' | 'string';
    /** Inclusive minimum for a number field. */
    min?: number;
    /** Inclusive maximum for a number field. */
    max?: number;
    /**
     * Increment a number control offers. Not a validation bound: schemastery's
     * `step` is a multiple-of constraint, which a round token budget would fail,
     * so the schema holds values to `min` and `max` only.
     */
    step?: number;
    /** Whether the Settings page keeps the field behind its advanced disclosure. */
    advanced?: boolean;
}
/** The defaults, written in this one place. */
export declare const JEV_SETTINGS_DEFAULTS: JevSettings;
/**
 * Every field, in the order the Settings page presents them. The record type
 * makes a `JevSettings` key without an entry here a compile error, so the
 * validator and the page cannot drift apart.
 */
export declare const JEV_SETTING_FIELDS: Readonly<Record<JevSettingKey, JevSettingField>>;
/** Field keys in presentation order. */
export declare const JEV_SETTING_ORDER: JevSettingKey[];
/**
 * Resolve the section the engine obeys from whatever the settings provider
 * holds. The provider resolves a registered namespace through the schema, so a
 * present section already carries every field; the spread only has to cover the
 * absent-provider case.
 * @param section - `settings.get(JEV_SETTINGS_NAMESPACE)`, or `undefined` when nothing registered it.
 * @returns every field resolved, defaulting to `enabled: false`.
 */
export declare function resolveJevSettings(section: unknown): JevSettings;

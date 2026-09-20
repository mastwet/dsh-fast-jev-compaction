/**
 * Dictionaries for the Jev settings page.
 *
 * Copy is locale-owned: every string the page renders is a key here, including
 * the navigation label, which the shell resolves per render so a locale switch
 * needs no re-registration. Field copy is keyed by the field table's own keys
 * (`<field>Label` / `<field>Hint`), so a field cannot reach the validator
 * without also reaching a dictionary.
 *
 * @module dsh-compaction-jev/client/locales
 */
/** Dictionary namespace this plugin owns. */
export declare const JEV_LOCALE_NAMESPACE = "settings.jev";
/** English copy. */
export declare const en: {
    nav: string;
    title: string;
    intro: string;
    enableLabel: string;
    enableHint: string;
    stateOn: string;
    stateOff: string;
    paramsTitle: string;
    advancedSummary: string;
    advancedHint: string;
    save: string;
    discard: string;
    pendingHint: string;
    cleanHint: string;
    overridden: string;
    reset: string;
    loading: string;
    unavailable: string;
    notWritable: string;
    invalidEmpty: string;
    invalidNumber: string;
    invalidRange: string;
    invalidMin: string;
    invalidMax: string;
    enabledLabel: string;
    enabledHint: string;
    keepThresholdLabel: string;
    keepThresholdHint: string;
    preserveRecentMessagesLabel: string;
    preserveRecentMessagesHint: string;
    minReductionRatioLabel: string;
    minReductionRatioHint: string;
    truncateHeadCharsLabel: string;
    truncateHeadCharsHint: string;
    modelLabel: string;
    modelHint: string;
    apiKeyEnvLabel: string;
    apiKeyEnvHint: string;
    baseUrlLabel: string;
    baseUrlHint: string;
    timeoutMsLabel: string;
    timeoutMsHint: string;
    maxStateTokensLabel: string;
    maxStateTokensHint: string;
    maxRequestTokensLabel: string;
    maxRequestTokensHint: string;
    goalLabel: string;
    goalHint: string;
};
/** Dictionary key domain: exactly the keys English declares. */
export type JevSettingsKey = keyof typeof en;
/** Chinese copy. */
export declare const zh: Record<JevSettingsKey, string>;

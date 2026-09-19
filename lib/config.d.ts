/**
 * Validated plugin configuration.
 *
 * The backend is a `BasicCompactionEngine` subclass, so its configuration is
 * that engine's own `Config` schema intersected with one `jev` block. Every
 * compaction-policy field (`thresholdRatio`, `retainRatio`, `modelPolicies`, …)
 * therefore stays declared in exactly one place — the base package — and this
 * schema adds only the Jev decision options.
 *
 * The credential is never a config value: `apiKeyEnv` names the environment
 * variable that holds it, the way every other DSH plugin treats secrets.
 *
 * @module dsh-compaction-jev/config
 */
import z from '@deepseek-ai/schemastery';
import { type BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic';
import { type ResolvedJevOptions } from './jev/plan.js';
/** The `jev` configuration block. */
export interface JevConfig {
    /** Environment variable holding the TypeSafe API key. Default `TYPESAFE_API_KEY`. */
    apiKeyEnv?: string;
    /** Jev model name. Default `jev-latest`. */
    model?: string;
    /** System One endpoint. Default `https://api.typesafe.ai/v1/systemone`. */
    baseUrl?: string;
    /** Per-request timeout in milliseconds. Default `60000`. */
    timeoutMs?: number;
    /** Minimum share of region characters the checkpoint must remove. Default `0.25`. */
    minReductionRatio?: number;
    /** Ongoing task description placed in the state. Default: the last three user prompts. */
    goal?: string;
    /** Minimum keep probability for a call or result to stay. Default `0.5`. */
    keepThreshold?: number;
    /** Newest region messages never touched; the first is always pinned. Default `6`. */
    preserveRecentMessages?: number;
    /** Estimated token ceiling for the state. Default `25000`. */
    maxStateTokens?: number;
    /** Estimated ceiling for state plus one batch of questions. Default `30000`. */
    maxRequestTokens?: number;
    /** Characters of a dropped tool result retained before its note. Default `300`. */
    truncateHeadChars?: number;
}
/** The plugin's complete configuration: the base backend's fields plus `jev`. */
export type JevCompactionConfig = BasicCompactionConfig & {
    jev?: JevConfig;
};
/**
 * The loader row's schema: the base backend's fields, unchanged, plus `jev`.
 *
 * `BasicCompactionEngine.Config` is read through its `dict` rather than
 * restated, so a field the base package adds is configurable here without an
 * edit. The cast is the price of Schemastery's callable-schema typing.
 */
export declare const JevCompactionConfigSchema: z<JevCompactionConfig>;
/** The `jev` block with every default resolved. */
export interface ResolvedJevConfig {
    /** The credential, or `undefined` when the environment variable is unset or empty. */
    apiKey: string | undefined;
    /** Environment variable the credential was read from, for diagnostics. */
    apiKeyEnv: string;
    model: string;
    baseUrl: string;
    timeoutMs: number;
    minReductionRatio: number;
    /** Decision options for the plan pass. */
    options: ResolvedJevOptions;
}
/**
 * Resolve the `jev` block against its defaults and read the credential.
 * @param config - the row's `jev` block, when present.
 * @param env - environment to read the credential from; defaults to `process.env`.
 * @returns the resolved Jev configuration.
 */
export declare function resolveJevConfig(config: JevConfig | undefined, env?: NodeJS.ProcessEnv): ResolvedJevConfig;

/**
 * Token estimation and text truncation for Jev requests.
 *
 * Ported from `fast-jev-compaction` (MIT) `src/state.ts`. The estimator is
 * deliberately tokenizer-free and calibrated to land a little above the counts
 * Jev reports, so a fitted state stays under the request ceiling. See `NOTICE`.
 *
 * @module dsh-compaction-jev/jev/tokens
 */
/**
 * Estimate tokens without a tokenizer: a word costs one token per six letters,
 * a digit half a token, any other symbol nine tenths.
 * @param text - the text to price.
 * @returns the estimated token count.
 */
export declare function estimateTokens(text: string): number;
/**
 * Truncate text to a character limit with an ellipsis.
 * @param text - the text to bound.
 * @param limit - maximum characters of the result.
 * @returns the text, or its bounded prefix.
 */
export declare function truncate(text: string, limit: number): string;
/**
 * Abridge text to a head plus a tail with an omission note between them.
 * @param text - the text to abridge.
 * @param head - characters retained from the start.
 * @param tail - characters retained from the end.
 * @returns the abridged text, or the input when it is already short enough.
 */
export declare function abridge(text: string, head: number, tail: number): string;

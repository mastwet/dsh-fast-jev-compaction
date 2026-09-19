/**
 * Token estimation and text truncation for Jev requests.
 *
 * Ported from `fast-jev-compaction` (MIT) `src/state.ts`. The estimator is
 * deliberately tokenizer-free and calibrated to land a little above the counts
 * Jev reports, so a fitted state stays under the request ceiling. See `NOTICE`.
 *
 * @module dsh-compaction-jev/jev/tokens
 */
const TOKEN_PIECES = /[A-Za-z]+|\d+|[^\sA-Za-z\d]/g;
/**
 * Estimate tokens without a tokenizer: a word costs one token per six letters,
 * a digit half a token, any other symbol nine tenths.
 * @param text - the text to price.
 * @returns the estimated token count.
 */
export function estimateTokens(text) {
    let tokens = 0;
    for (const match of text.matchAll(TOKEN_PIECES)) {
        const piece = match[0];
        const first = piece.charCodeAt(0);
        if (first >= 48 && first <= 57)
            tokens += piece.length / 2;
        else if ((first >= 65 && first <= 90) || (first >= 97 && first <= 122)) {
            tokens += 1 + Math.floor((piece.length - 1) / 6);
        }
        else
            tokens += 0.9;
    }
    return Math.ceil(tokens);
}
/**
 * Truncate text to a character limit with an ellipsis.
 * @param text - the text to bound.
 * @param limit - maximum characters of the result.
 * @returns the text, or its bounded prefix.
 */
export function truncate(text, limit) {
    return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}…`;
}
/**
 * Abridge text to a head plus a tail with an omission note between them.
 * @param text - the text to abridge.
 * @param head - characters retained from the start.
 * @param tail - characters retained from the end.
 * @returns the abridged text, or the input when it is already short enough.
 */
export function abridge(text, head, tail) {
    if (text.length <= head + tail + 40)
        return text;
    const omitted = text.length - head - tail;
    return `${text.slice(0, head)}\n[… ${omitted} chars omitted …]\n${text.slice(-tail)}`;
}

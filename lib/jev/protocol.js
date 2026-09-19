/**
 * The Jev (TypeSafe System One) wire protocol and its HTTP transport.
 *
 * Ported from `fast-jev-compaction` (MIT, https://github.com/tamaratran/fast-jev-compaction),
 * `src/types.ts`, `src/request.ts`, and `src/client.ts`. The port keeps the
 * request body, the response validation, and the `noul` answer extraction
 * identical so a change upstream can be re-applied mechanically. Only the
 * `noul` question variant is carried: the compaction path asks no `choice` or
 * `score` question. See `NOTICE` for the upstream copyright.
 *
 * @module dsh-compaction-jev/jev/protocol
 */
/** Default System One endpoint. */
export const SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone';
/** Default Jev model name. */
export const DEFAULT_JEV_MODEL = 'jev-latest';
/**
 * Build the HTTP request for one Jev call.
 * @param params - endpoint, credential, and model selection.
 * @param state - the fitted conversation state.
 * @param questions - the batch's questions.
 * @returns the request to send.
 */
export function buildJevRequest(params, state, questions) {
    return {
        url: params.baseUrl ?? SYSTEM_ONE_URL,
        method: 'POST',
        headers: {
            authorization: `Bearer ${params.apiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: params.model ?? DEFAULT_JEV_MODEL,
            state,
            questions,
        }),
    };
}
/**
 * Validate a Jev response body.
 * @param status - HTTP status, used in the failure message.
 * @param ok - whether the transport reported success.
 * @param text - the raw response body.
 * @returns the parsed response.
 * @throws when the request failed, the body is not JSON, or `answers` is missing.
 */
export function parseJevResponse(status, ok, text) {
    if (!ok)
        throw new Error(`Jev request failed (${status}): ${text.slice(0, 200)}`);
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new Error('Jev returned malformed JSON');
    }
    if (parsed === null ||
        typeof parsed !== 'object' ||
        !('answers' in parsed) ||
        parsed.answers === null ||
        typeof parsed.answers !== 'object') {
        throw new Error('Jev response is missing answers');
    }
    return parsed;
}
/**
 * Read the `noul` probability of one answer.
 * @param answers - the response's answer map.
 * @param name - the answer name the question was keyed by.
 * @returns the probability.
 * @throws when the answer is absent or not a finite number.
 */
export function noulAnswer(answers, name) {
    const answer = answers[name];
    if (answer === undefined || typeof answer.noul !== 'number' || !Number.isFinite(answer.noul)) {
        throw new Error(`Invalid Jev answer for ${name}`);
    }
    return answer.noul;
}
/** Ask Jev over HTTP with the global `fetch`. */
export class JevHttpClient {
    #options;
    #fetcher;
    /**
     * @param options - credential, endpoint, model, and transport selection.
     */
    constructor(options) {
        this.#options = options;
        this.#fetcher = options.fetch;
    }
    /**
     * Ask one batch of questions, aborting on the caller's signal or the timeout.
     * @param state - the fitted conversation state.
     * @param questions - the batch's questions.
     * @param signal - optional caller cancellation.
     * @returns the validated response.
     * @throws when no credential is configured, the request fails, or it times out.
     */
    async ask(state, questions, signal) {
        const { apiKey, model, baseUrl, timeoutMs } = this.#options;
        if (apiKey.length === 0)
            throw new Error('TYPESAFE_API_KEY is not configured');
        const request = buildJevRequest({ apiKey, model, baseUrl }, state, questions);
        const timeout = AbortSignal.timeout(timeoutMs ?? 60_000);
        const composed = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
        // Resolved per call, not captured at construction: a host that installs its
        // own transport after composing this plugin must still be used.
        const fetcher = this.#fetcher ?? globalThis.fetch;
        const response = await fetcher.call(globalThis, request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            signal: composed,
        });
        return parseJevResponse(response.status, response.ok, await response.text());
    }
}

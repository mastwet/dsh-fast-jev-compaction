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
/** Conversation role of one projected message. */
export type JevRole = 'user' | 'assistant';
/** One tool call, as the Jev state carries it. */
export interface JevToolUse {
    toolUseId: string;
    tool: string;
    input: Record<string, unknown>;
}
/** One tool result, as the Jev state pairs it with its call. */
export interface JevToolResult {
    toolUseId: string;
    text: string;
    isError: boolean;
}
/**
 * One projected transcript message. The shape is upstream's `Message`; the
 * projection from DSH messages into it lives in `../surface.ts`.
 */
export interface JevMessage {
    role: JevRole;
    text: string;
    toolUses: JevToolUse[];
    toolResults: JevToolResult[];
}
/** A `noul` question: one statement Jev scores with a probability. */
export interface NoulQuestion {
    type: 'noul';
    instructions: string;
}
/** The questions of one request, keyed by the answer name they produce. */
export type JevQuestions = Record<string, NoulQuestion>;
/** One `noul` answer. */
export interface NoulAnswer {
    noul: number;
}
/** A validated Jev response. */
export interface JevResponse {
    model?: string;
    answers: Record<string, NoulAnswer>;
}
/** The state sent with every request: the whole history with results omitted. */
export type JevState = object;
/**
 * Anything that answers Jev questions. `JevHttpClient` is the shipped
 * implementation; tests supply a fake one and never contact TypeSafe.
 */
export interface JevAsker {
    /**
     * Ask one batch of questions about one state.
     * @param state - the fitted conversation state.
     * @param questions - the batch's questions.
     * @param signal - optional cancellation forwarded to the transport.
     * @returns the validated response.
     */
    ask(state: JevState, questions: JevQuestions, signal?: AbortSignal): Promise<JevResponse>;
}
/** Default System One endpoint. */
export declare const SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone";
/** Default Jev model name. */
export declare const DEFAULT_JEV_MODEL = "jev-latest";
/** One HTTP request, for any fetch-like transport. */
export interface JevRequest {
    url: string;
    method: 'POST';
    headers: Record<string, string>;
    body: string;
}
/**
 * Build the HTTP request for one Jev call.
 * @param params - endpoint, credential, and model selection.
 * @param state - the fitted conversation state.
 * @param questions - the batch's questions.
 * @returns the request to send.
 */
export declare function buildJevRequest(params: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
}, state: JevState, questions: JevQuestions): JevRequest;
/**
 * Validate a Jev response body.
 * @param status - HTTP status, used in the failure message.
 * @param ok - whether the transport reported success.
 * @param text - the raw response body.
 * @returns the parsed response.
 * @throws when the request failed, the body is not JSON, or `answers` is missing.
 */
export declare function parseJevResponse(status: number, ok: boolean, text: string): JevResponse;
/**
 * Read the `noul` probability of one answer.
 * @param answers - the response's answer map.
 * @param name - the answer name the question was keyed by.
 * @returns the probability.
 * @throws when the answer is absent or not a finite number.
 */
export declare function noulAnswer(answers: Record<string, NoulAnswer>, name: string): number;
/** Construction options for {@link JevHttpClient}. */
export interface JevHttpClientOptions {
    /** Bearer credential. An empty string makes every call fail without a request. */
    apiKey: string;
    /** Jev model name; defaults to `jev-latest`. */
    model?: string;
    /** System One endpoint; defaults to {@link SYSTEM_ONE_URL}. */
    baseUrl?: string;
    /** Per-request timeout in milliseconds; defaults to 60000. */
    timeoutMs?: number;
    /** Injectable fetch, for tests. */
    fetch?: typeof globalThis.fetch;
}
/** Ask Jev over HTTP with the global `fetch`. */
export declare class JevHttpClient implements JevAsker {
    #private;
    /**
     * @param options - credential, endpoint, model, and transport selection.
     */
    constructor(options: JevHttpClientOptions);
    /**
     * Ask one batch of questions, aborting on the caller's signal or the timeout.
     * @param state - the fitted conversation state.
     * @param questions - the batch's questions.
     * @param signal - optional caller cancellation.
     * @returns the validated response.
     * @throws when no credential is configured, the request fails, or it times out.
     */
    ask(state: JevState, questions: JevQuestions, signal?: AbortSignal): Promise<JevResponse>;
}

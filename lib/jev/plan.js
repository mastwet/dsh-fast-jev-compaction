/**
 * The Jev decision plan: pairing tool calls with their results, fitting the
 * whole conversation into one request budget, asking two `noul` questions per
 * candidate call, and turning the answers into per-call actions.
 *
 * Ported from `fast-jev-compaction` (MIT) `src/state.ts` and `src/compact.ts`.
 * The fitting stages, their order, the thresholds, and the JSON keys sent to
 * Jev are unchanged, so upstream's estimator calibration still holds. See
 * `NOTICE`.
 *
 * @module dsh-compaction-jev/jev/plan
 */
import { abridge, estimateTokens, truncate } from './tokens.js';
/** Defaults mirroring upstream's `DEFAULT_OPTIONS`. */
export const DEFAULT_JEV_OPTIONS = {
    goal: '',
    keepThreshold: 0.5,
    preserveRecentMessages: 6,
    maxStateTokens: 25_000,
    maxRequestTokens: 30_000,
    truncateHeadChars: 300,
};
/** Tokens the request envelope (`model`, key names) adds around state and questions. */
const REQUEST_OVERHEAD_TOKENS = 20;
/** The state preamble explaining the compaction task to Jev. */
export const STATE_CONTEXT = 'A coding assistant conversation is being compacted to free context. `history` is the whole conversation so far, oldest first; tool outputs are replaced by a short `result` note and long texts may be abridged. Each question asks whether one tool call, or the full output of that call, still needs to stay in the history verbatim. Whatever is not kept is deleted permanently, but the assistant can always re-run a tool or re-read a file.';
/** Successive caps on the serialised tool input included per call. */
const INPUT_CHARS = [1000, 200, 60];
const TEXT_HEAD = 400;
const TEXT_TAIL = 150;
/**
 * Fill absent options from {@link DEFAULT_JEV_OPTIONS}, rejecting non-finite
 * numbers in favour of the default the way upstream does.
 * @param options - the caller's partial options.
 * @returns every option resolved.
 */
export function resolveJevOptions(options = {}) {
    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return {
        goal: options.goal ?? DEFAULT_JEV_OPTIONS.goal,
        keepThreshold: finite(options.keepThreshold, DEFAULT_JEV_OPTIONS.keepThreshold),
        preserveRecentMessages: Math.max(0, Math.floor(finite(options.preserveRecentMessages, DEFAULT_JEV_OPTIONS.preserveRecentMessages))),
        maxStateTokens: Math.max(1, finite(options.maxStateTokens, DEFAULT_JEV_OPTIONS.maxStateTokens)),
        maxRequestTokens: Math.max(1, finite(options.maxRequestTokens, DEFAULT_JEV_OPTIONS.maxRequestTokens)),
        truncateHeadChars: Math.max(0, Math.floor(finite(options.truncateHeadChars, DEFAULT_JEV_OPTIONS.truncateHeadChars))),
    };
}
/**
 * Whether one message index belongs to the pinned first or newest messages.
 * @param index - message index.
 * @param total - message count.
 * @param preserveRecentMessages - newest messages never touched.
 * @returns whether the index is pinned.
 */
export function isPinned(index, total, preserveRecentMessages) {
    return index === 0 || index >= total - preserveRecentMessages;
}
/**
 * Pair every tool call with its result by call id. Calls without a result are
 * not candidates, because there is nothing to drop yet.
 * @param messages - the projected transcript.
 * @param preserveRecentMessages - newest messages never touched.
 * @returns the paired calls in transcript order.
 */
export function collectToolCalls(messages, preserveRecentMessages) {
    const results = new Map();
    messages.forEach((message, index) => {
        for (const result of message.toolResults) {
            results.set(result.toolUseId, {
                index,
                text: result.text,
                isError: result.isError,
            });
        }
    });
    const calls = [];
    messages.forEach((message, callIndex) => {
        for (const tool of message.toolUses) {
            const found = results.get(tool.toolUseId);
            if (found === undefined)
                continue;
            calls.push({
                id: `t${calls.length + 1}`,
                callId: tool.toolUseId,
                tool: tool.tool,
                input: tool.input,
                callIndex,
                resultIndex: found.index,
                resultChars: found.text.length,
                isError: found.isError,
                pinned: isPinned(callIndex, messages.length, preserveRecentMessages) ||
                    isPinned(found.index, messages.length, preserveRecentMessages),
            });
        }
    });
    return calls;
}
/**
 * The two `noul` questions asked about one call.
 * @param call - the call to ask about.
 * @returns the question map, keyed by the answer names it produces.
 */
export function questionsFor(call) {
    return {
        [`call_${call.id}`]: {
            type: 'noul',
            instructions: `Tool call ${call.id} (${call.tool}) should stay in the history: knowing this call was made, with its input, still matters for what the assistant does next`,
        },
        [`result_${call.id}`]: {
            type: 'noul',
            instructions: `The full output of tool call ${call.id} (${call.tool}, ${call.resultChars} chars) should stay in the history verbatim: the assistant still needs its contents and re-running the tool would not do`,
        },
    };
}
/**
 * Split candidate calls into batches whose questions, together with the always
 * complete state, fit one request.
 * @param calls - the candidate calls, in transcript order.
 * @param stateTokens - the fitted state's estimated size.
 * @param options - resolved options supplying `maxRequestTokens`.
 * @returns the batches to ask concurrently.
 * @throws when the state leaves no room for even one call's questions.
 */
export function batchCalls(calls, stateTokens, options) {
    const budget = options.maxRequestTokens - stateTokens - REQUEST_OVERHEAD_TOKENS;
    const batches = [];
    let current = [];
    let currentTokens = 0;
    for (const call of calls) {
        const tokens = estimateTokens(JSON.stringify(questionsFor(call)));
        if (current.length > 0 && currentTokens + tokens > budget) {
            batches.push(current);
            current = [];
            currentTokens = 0;
        }
        if (current.length === 0 && tokens > budget) {
            throw new Error(`Jev state leaves no room for questions (~${stateTokens} of ${options.maxRequestTokens} tokens)`);
        }
        current.push(call);
        currentTokens += tokens;
    }
    if (current.length > 0)
        batches.push(current);
    return batches;
}
/**
 * Resolve one call's action from its answers and the keep threshold.
 * @param call - the call's identity and pinned state.
 * @param answer - Jev's two probabilities.
 * @param options - resolved options supplying `keepThreshold`.
 * @returns the action and the reason behind it.
 */
export function decideCall(call, answer, options) {
    const base = { id: call.id, tool: call.tool, ...answer };
    if (call.pinned)
        return { ...base, action: 'keep', reason: 'pinned' };
    if (answer.keepResult >= options.keepThreshold) {
        return { ...base, action: 'keep', reason: 'kept' };
    }
    if (answer.keepCall >= options.keepThreshold) {
        return { ...base, action: 'drop_result', reason: 'result_dropped' };
    }
    return { ...base, action: 'drop_call', reason: 'call_dropped' };
}
function inputText(input, limit) {
    let json;
    try {
        json = JSON.stringify(input) ?? '[unserializable input]';
    }
    catch {
        json = '[unserializable input]';
    }
    return truncate(json, limit);
}
function resultNote(call) {
    return `${call.isError ? 'error' : 'ok'}, ${call.resultChars} chars (omitted)`;
}
/** One call as a single line, for when the structured form is too costly. */
function compactCall(call) {
    const input = Object.entries(call.input)
        .map(([key, value]) => {
        const text = typeof value === 'string' ? value : inputText({ [key]: value }, 200);
        return `${key}=${text.replace(/\s+/g, ' ')}`;
    })
        .join(' ');
    return `${call.id} ${call.tool} ${truncate(input, INPUT_CHARS[2])} → ${call.isError ? 'error' : 'ok'} ${call.resultChars}ch`;
}
function callsByMessage(calls) {
    const byMessage = new Map();
    for (const call of calls) {
        const list = byMessage.get(call.callIndex);
        if (list === undefined)
            byMessage.set(call.callIndex, [call]);
        else
            list.push(call);
    }
    return byMessage;
}
function historyEntries(messages, calls, inputChars) {
    const byMessage = callsByMessage(calls);
    const entries = [];
    messages.forEach((message, i) => {
        const toolCalls = (byMessage.get(i) ?? []).map((call) => ({
            id: call.id,
            tool: call.tool,
            input: inputText(call.input, inputChars),
            result: resultNote(call),
        }));
        if (message.text.trim().length === 0 && toolCalls.length === 0)
            return;
        const entry = { i, role: message.role, text: message.text };
        if (toolCalls.length > 0)
            entry.tool_calls = toolCalls;
        entries.push(entry);
    });
    return entries;
}
/**
 * The last three user prompts, as the default `goal`.
 * @param messages - the projected transcript.
 * @returns the joined goal text.
 */
export function goalFromMessages(messages) {
    return messages
        .filter((message) => message.role === 'user' &&
        message.text.trim().length > 0 &&
        message.toolResults.length === 0)
        .slice(-3)
        .map((message) => truncate(message.text, 500))
        .join('\n');
}
/**
 * Fold runs of adjacent call-only entries into one entry each, so the per-entry
 * envelope is paid once per run; the call lines keep their ids.
 * @param history - the entries to fold.
 * @param pinned - whether an entry is pinned.
 * @returns the folded entries.
 */
function mergeCallRuns(history, pinned) {
    const merged = [];
    for (const entry of history) {
        const previous = merged[merged.length - 1];
        const foldable = (candidate) => !pinned(candidate) && candidate.text.length === 0 && typeof candidate.tool_calls?.[0] === 'string';
        if (previous !== undefined &&
            foldable(previous) &&
            foldable(entry) &&
            previous.role === entry.role) {
            previous.tool_calls = [
                ...previous.tool_calls,
                ...entry.tool_calls,
            ];
            continue;
        }
        merged.push({ ...entry });
    }
    return merged;
}
/**
 * Build the Jev state from the whole conversation and shrink it in stages until
 * it fits `maxStateTokens`: tool inputs are truncated, then long texts are
 * abridged oldest-first (pinned messages last), then old messages collapse to a
 * one-line note, then old tool calls shrink to one line each, then old messages
 * that carry no call are left out, then runs of old call-only messages are
 * folded into one entry.
 * @param messages - the projected transcript.
 * @param calls - the paired calls.
 * @param options - resolved options supplying the state ceiling, retention, and goal.
 * @returns the fitted state, its estimated size, and the stage that fit it.
 * @throws when even the last stage is too big.
 */
export function fitState(messages, calls, options) {
    const goal = options.goal.length > 0 ? options.goal : goalFromMessages(messages);
    const stateOf = (history) => ({
        context: STATE_CONTEXT,
        goal,
        history,
    });
    const entryTokens = (entry) => estimateTokens(JSON.stringify(entry)) + 1;
    const baseTokens = estimateTokens(JSON.stringify(stateOf([])));
    const fitted = (history, tokens, stage) => ({
        state: stateOf(history),
        tokens,
        stage,
    });
    let history = [];
    let perEntry = [];
    let tokens = 0;
    const rebuild = (inputChars) => {
        history = historyEntries(messages, calls, inputChars);
        perEntry = history.map(entryTokens);
        tokens = baseTokens + perEntry.reduce((sum, n) => sum + n, 0);
    };
    const fits = () => tokens <= options.maxStateTokens;
    const shrink = (index, change) => {
        const entry = history[index];
        if (entry === undefined)
            return;
        change(entry);
        const now = entryTokens(entry);
        tokens += now - (perEntry[index] ?? 0);
        perEntry[index] = now;
    };
    rebuild(INPUT_CHARS[0]);
    if (fits())
        return fitted(history, tokens, 'full');
    for (const limit of INPUT_CHARS.slice(1)) {
        rebuild(limit);
        if (fits())
            return fitted(history, tokens, `inputs<=${limit}`);
    }
    const pinned = (entry) => isPinned(entry.i, messages.length, options.preserveRecentMessages);
    const indices = history.map((_, index) => index);
    const order = [
        ...indices.filter((index) => !pinned(history[index])),
        ...indices.filter((index) => pinned(history[index])),
    ];
    for (const index of order) {
        const entry = history[index];
        if (entry.text.length <= TEXT_HEAD + TEXT_TAIL + 40)
            continue;
        shrink(index, (target) => {
            target.text = abridge(target.text, TEXT_HEAD, TEXT_TAIL);
        });
        if (fits())
            return fitted(history, tokens, 'texts abridged');
    }
    for (const index of order) {
        const entry = history[index];
        if (pinned(entry) || entry.text.length === 0)
            continue;
        const original = messages[entry.i]?.text.length ?? entry.text.length;
        shrink(index, (target) => {
            target.text = `[… ${original} chars omitted …]`;
        });
        if (fits())
            return fitted(history, tokens, 'old messages collapsed');
    }
    const byMessage = callsByMessage(calls);
    for (const index of order) {
        const entry = history[index];
        const own = byMessage.get(entry.i);
        if (pinned(entry) || own === undefined)
            continue;
        shrink(index, (target) => {
            target.tool_calls = own.map(compactCall);
        });
        if (fits())
            return fitted(history, tokens, 'old calls compacted');
    }
    const left = new Set();
    for (const index of order) {
        const entry = history[index];
        if (pinned(entry) || entry.tool_calls !== undefined)
            continue;
        left.add(index);
        tokens -= perEntry[index] ?? 0;
        if (fits()) {
            return fitted(history.filter((_, i) => !left.has(i)), tokens, 'old messages left out');
        }
    }
    history = mergeCallRuns(history.filter((_, i) => !left.has(i)), pinned);
    perEntry = history.map(entryTokens);
    tokens = baseTokens + perEntry.reduce((sum, n) => sum + n, 0);
    if (fits())
        return fitted(history, tokens, 'old calls merged');
    throw new Error(`history too large for Jev (~${tokens} tokens after truncation, limit ${options.maxStateTokens})`);
}

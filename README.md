# dsh-compaction-jev

A DeepSeek Harness context-compaction backend that **does not rewrite your
history**. Every tool call and result the compaction region contains is scored
by [Jev](https://api.typesafe.ai) (TypeSafe System One); what Jev keeps is
carried into the checkpoint byte-for-byte, and what it releases is replaced by a
one-line note.

It replaces the summarizer of DSH's own compaction backend, not the backend. It
is a `BasicCompactionEngine` subclass that overrides one method, so trigger
policy, retention sizing, range selection, tool-pair locking, the
`compaction/start`…`compaction/end` bracket, manual `/compact` handling, and the
durable checkpoint all stay exactly as the base package defines them.

## Why

A summarizer rewrites the region through a model. That is lossy in a way you
cannot audit: the exact file path, the error text, the command that failed, and
the numbers in a test report all become prose that may or may not survive.
Jev decides what is no longer needed; the harness then keeps the rest verbatim.

## How it works

1. The base engine selects a compactable region (everything outside the
   retained tail) and calls this backend's `summarize()` hook with the replayed
   conversation prefix.
2. The region is projected into Jev's transcript shape: every `tool-call` is
   paired with its `tool-result` by id, and every result body is replaced by a
   short note. **No result body is ever sent to Jev.**
3. The state is fitted under `maxStateTokens` in stages — full, then tool inputs
   capped at 1000/200/60 characters, then texts abridged, then old messages
   collapsed, then old calls compacted, then dropped, then merged. The stage
   reached is reported in the checkpoint's ledger line.
4. One batch of requests asks two `noul` questions per unpinned call:
   `keepCall` and `keepResult`. Batches are issued concurrently.
5. A probability at or above `keepThreshold` keeps the item. A call is dropped
   only if the call itself is dropped, **and a dropped call takes its result with
   it**, so no orphaned result can survive in the checkpoint.
6. The retained content is rendered as the checkpoint's content blocks, and
   `reductionRatio` is checked against `minReductionRatio`.

### When it does not apply

Each of these falls back to the base backend's built-in model summary — the same
fallback the upstream Claude Code hook makes — so installing this plugin never
makes compaction worse than it was, it only changes the decision source:

- `TYPESAFE_API_KEY` (or the configured variable) is unset;
- the selected region contains an image, which has no text form to keep
  verbatim;
- the Jev request fails, times out, or answers something malformed;
- the checkpoint would not remove at least `minReductionRatio` of the region, or
  would not be smaller than the region on the harness's own token estimate —
  because the base engine **rejects** a summary that is not smaller than the
  content it shadows, and this hook must not hand it one.

Cancellation is never treated as a failure: an aborted compaction rethrows
rather than quietly substituting a summary.

## Install

The package is consumed by a DSH profile. Two wiring points exist because
deployments place the compaction backend in different planes.

### 1. A profile whose compaction row lives in the composition

Use this when the profile's composed entry list contains the base bundle's
`compaction-basic` row (a headless or custom profile). The package ships
`cordis.patch.yml` for exactly this case:

```text
dsh plugin --profile <profile> add <path-to-this-package>
```

The patch **disables** the default backend's row and **inserts** this one. It
cannot rename a row in place: in a patch entry, `name` is a guard that must match
the target's current name, so changing a row's module means replacing the row.

Set the credential before starting:

```text
TYPESAFE_API_KEY=...        # or the variable named by jev.apiKeyEnv
```

### 2. A Web or Studio deployment, whose backend lives in an agent preset

The shipped `@deepseek-ai/dsh-web-app` layer **disables** the host-plane
`compaction-basic` row, and a session's compaction backend is composed inside a
per-session agent preset, in a group row that isolates the `compaction` service.
A profile-level patch cannot reach into that isolated realm.

Presets are copy-only — there is no patch layer that means "the standard preset
plus one change" — so the wiring point is a preset copy you own:

```text
# inside a DSH session, or by copying the directory by hand
ctx.agentPresets.copy('standard', 'jev')
```

Then, in the copy's `agent.cordis.yml`, replace the `compaction` group's
`compaction-basic` row with this package's row. `preset/compaction-jev.rows.yml`
in this package is that group, ready to paste; it keeps the shipped
`command-compact` and `tool-result-pruner` rows unchanged.

Do not disable the base row globally to achieve this: it is already disabled on
the host plane, and the preset's copy is what the session resolves.

### Building from source

```text
pnpm install
pnpm run build      # tsc -> lib/
pnpm test           # node --test, no network
pnpm run typecheck
```

The delivered tree contains no `node_modules`. `@deepseek-ai/cordis` and
`@deepseek-ai/dsh-compaction-basic` must resolve to the **host's** instances: a
second physical copy of Cordis breaks `Service` and class identity, and a second
copy of the base engine breaks the `summarize()` override. Install the package as
a directory or a `pnpm pack` tarball rather than vendoring its dependencies.

## Configuration

All fields are optional. The `jev` block is validated as part of this plugin's
`Config` schema; the base backend's own fields (`thresholdRatio`,
`retainRatio`, `retainTokens`, `modelPolicies`, `summarizationProvider`,
`summarizationModel`, `maxTokens`, `compactionRetries`, `maxOverflowRetries`,
`auto`) are declared by the base package and passed through unchanged.

| Key | Default | Meaning |
| --- | --- | --- |
| `jev.apiKeyEnv` | `TYPESAFE_API_KEY` | Environment variable holding the TypeSafe key. The value is never a config field. |
| `jev.model` | `jev-latest` | Jev model name. |
| `jev.baseUrl` | `https://api.typesafe.ai/v1/systemone` | System One endpoint. |
| `jev.timeoutMs` | `60000` | Per-request timeout; composed with the harness's cancellation signal. |
| `jev.minReductionRatio` | `0.25` | Minimum share of region characters the checkpoint must remove, else fall back. Clamped to `[0, 1]`. |
| `jev.goal` | last three user prompts | Ongoing task description placed in the state. |
| `jev.keepThreshold` | `0.5` | Minimum Jev probability for a call or result to stay. |
| `jev.preserveRecentMessages` | `6` | Newest region messages never touched. The first region message is always pinned as well. |
| `jev.maxStateTokens` | `25000` | Estimated ceiling for the state sent to Jev. |
| `jev.maxRequestTokens` | `30000` | Estimated ceiling for state plus one batch of questions. |
| `jev.truncateHeadChars` | `300` | Characters of a released tool result retained ahead of its note. |

Raising `keepThreshold` releases more; raising `minReductionRatio` makes the
backend fall back to a plain summary more often.

## Guarantees

- **Retained content is verbatim.** A kept result body, a retained message's
  text, and every rendered tool-call input are copied exactly. The plugin never
  paraphrases what it keeps.
- **Tool pairing is preserved.** A call and its result are decided together. A
  dropped result keeps its call's input and a bounded head plus a note; a dropped
  call removes its result as well, so no result is left answering a call that is
  no longer there.
- **Pinned content is never scored.** The first region message and the newest
  `preserveRecentMessages` are pinned, and a pinned call is kept regardless of
  Jev's answer.
- **Result bodies never leave the machine.** Only the fitted state and the
  questions are sent; the state replaces every result with a short note.
- **The credential is read from the environment**, never from config, logs, or
  the request body's state.
- **No regression without it.** Missing credential, Jev failure, an image in the
  region, or too small a reduction all delegate to the base backend's built-in
  summary.

## Known limitations

- **The region collapses into one checkpoint node.** DSH's compaction contract
  replaces a message range with a single `user/message`. Turn-level assistant
  and user structure, and the tool-call/tool-result event types, therefore become
  text inside that one node rather than surviving as messages. Retained content
  is verbatim; its framing is not a transcript.
- **`reasoning` blocks are not carried.** The checkpoint keeps text, tool-call,
  and tool-result content. A `reasoning` block outside the retained tail is
  replaced by a `[reasoning block not carried by Jev compaction]` marker.
- **Image and file regions fall back.** Any `image` or `file` block in the
  region hands the whole region to the built-in model summary, which can see it.
- **Jev is a network dependency.** A slow or unavailable endpoint costs one
  request timeout per compaction before falling back.
- **A summary can be smaller but less useful.** The backend optimizes for
  faithful retention and token reduction, not for a task-specific brief. If you
  want a prose brief, keep the built-in backend.
- **No end-to-end check in a live session is recorded here.** The suite covers
  the hook, the fallbacks, the plan, and the rendering against a stubbed
  transport; it does not run a real compaction against the live API. Such a run
  needs a TypeSafe credential and a session large enough to trigger pressure.

## Package layout

| Path | Contents |
| --- | --- |
| `src/engine.ts` | `JevCompactionEngine`: the `summarize()` override and its fallbacks. |
| `src/surface.ts` | DSH `Message[]` ↔ Jev projection and checkpoint rendering. |
| `src/jev/protocol.ts` | System One request/response shape and the HTTP client. |
| `src/jev/plan.ts` | Pairing, pinning, state fitting, batching, and decisions. |
| `src/jev/tokens.ts` | The token estimator and text bounding. |
| `src/config.ts` | The `jev` schema, merged with the base backend's own fields. |
| `cordis.patch.yml` | Bundle patch for a profile-level install. |
| `preset/compaction-jev.rows.yml` | The compaction group for a user-owned preset. |
| `test/` | `node --test` suite; the transport is stubbed, no network. |

See `NOTICE` for the upstream attribution of the ported decision algorithm.

## License

MIT, Copyright (c) 2026 大湿. See `LICENSE`. `NOTICE` records the upstream
attribution of the ported decision algorithm and reproduces that project's
license text.
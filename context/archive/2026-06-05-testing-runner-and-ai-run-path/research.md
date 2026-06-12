---
date: 2026-06-05T00:00:00+02:00
researcher: GitHub Copilot
git_commit: e79a1288a913607fd0be8b80b3b8093afa53e622
branch: master
repository: investment-assistant
topic: "Test runner + critical AI run path (Phase 1)"
tags: [research, codebase, vitest, sse, ai-run, continue-analysis, error-handling, persistence]
status: complete
last_updated: 2026-06-05
last_updated_by: GitHub Copilot
---

# Research: Test Runner + Critical AI Run Path (Phase 1)

**Date**: 2026-06-05  
**Researcher**: GitHub Copilot  
**Git Commit**: e79a1288a913607fd0be8b80b3b8093afa53e622  
**Branch**: master  
**Repository**: investment-assistant

## Research Question

For test-plan.md Phase 1: how is the AI run route wired — its SSE stream, DB persist path, error-class surface, and continue-analysis context composition — so that we can choose a test runner + harness and write the integration tests for Risks #1, #2, and #6?

## Summary

All the production code the tests must exercise lives in three files:
`src/pages/api/ai/run.ts` (SSE handler + persistence),
`src/lib/services/ai/index.ts` + `anthropic.ts` / `openai.ts` (provider streams),
and `src/lib/services/ai/errors.ts` (`toSafeAiError`).

The atomicity invariant (Risk #1) is clean: a **single `INSERT`** lives exclusively in the `kind === "done"` branch at line 165; every other code path uses an early `return` before reaching it. `controller.close()` is in a `finally` at line 189 and always runs.

The context-composition invariant (Risk #2) is provable from a DB-query audit: the parent fetch at lines 113–118 calls `.select("output")` — no other column is fetched — so P1 (`prompt_body_snapshot`) and I1 (`input`) cannot reach the provider payload. The payload is constructed verbatim in `anthropic.ts:13–15` / `openai.ts:12–15`.

There are **13 distinct error codes** (Risk #6). Three share the string `"service_unavailable"`; the rest are each unique.

No test runner is installed. Vitest is the confirmed working hypothesis: Vite ^7.3.2 is already pinned via `overrides`. The key open decision is the route-handler harness: `@cloudflare/vitest-pool-workers` (workerd-correct, needed for crypto.subtle HKDF) vs. direct `POST` handler invocation with a constructed `APIContext` (simpler, but crypto behavior may differ).

## Detailed Findings

### A. SSE stream setup and controller lifecycle

**File**: [src/pages/api/ai/run.ts](../../../src/pages/api/ai/run.ts)

```
L11–13   function sseFrame(event, data) — helper that formats every SSE frame
L57–61   ReadableStream created; enqueue helper wraps TextEncoder
L189     controller.close() — inside finally block; runs on success, error, and throw
```

The `ReadableStream` wraps the entire operation inside a single `async start(controller)` callback (L58). The `finally` at L188–190 guarantees `controller.close()` regardless of outcome. This means:

- A successful run: `done` frame enqueued (L172–180), `break` exits the for-await loop, then `finally` closes.
- Any error path inside the try: an `error` frame is enqueued, `return` exits the callback, then `finally` closes.
- An unexpected throw: caught at L183, `error` frame enqueued via `toSafeAiError`, then `finally` closes.

There is no scenario where the stream is left open without a frame.

### B. DB persist path — the only INSERT (Risk #1)

**File**: [src/pages/api/ai/run.ts](../../../src/pages/api/ai/run.ts)

```
L137–141  for await — iterates StreamEvents from runAiAnalysis
L138–141  kind === "text" → enqueue delta frame, continue (no DB access)
L143      // kind === "done" — only branch that reaches the INSERT
L144–163  row construction (AnalysisInsert)
L165      supabase.from("analyses").insert(row).select("id").single()  ← THE ONLY INSERT
L167–170  if (!insertResult.data) → error frame "persist_failed", return
L172–180  enqueue done frame (analysis_id, sources, usage, model, provider)
```

**Every error path before line 165 returns early** — verified exhaustively below. No partial or orphan row is possible.

### C. All pre-insert error paths — exhaustive (Risk #1)

| #   | Trigger                        | Location                                | SSE message                                                     | INSERT?                    |
| --- | ------------------------------ | --------------------------------------- | --------------------------------------------------------------- | -------------------------- |
| 1   | Cross-origin request           | L17–22 (pre-stream, immediate Response) | `forbidden`                                                     | No                         |
| 2   | No authenticated user          | L25–27 (pre-stream)                     | 401 raw                                                         | No                         |
| 3   | Supabase client null           | L30–35 (pre-stream)                     | `service_unavailable`                                           | No                         |
| 4   | Invalid JSON body              | L41–44 (pre-stream)                     | `invalid_body`                                                  | No                         |
| 5   | Validation failure             | L49–52 (pre-stream)                     | `invalid_input` + detail                                        | No                         |
| 6   | user_settings query error      | L75–78                                  | `service_unavailable`                                           | No                         |
| 7   | No API key for provider        | L83–86                                  | `api_key_not_configured` + provider                             | No                         |
| 8   | ai_models query error          | L88–91                                  | `service_unavailable`                                           | No                         |
| 9   | Model disabled / not found     | L92–95                                  | `invalid_model`                                                 | No                         |
| 10  | Decryption → decrypt_failed    | L100–103                                | `api_key_corrupted`                                             | No                         |
| 11  | Decryption → other error       | L104–107                                | `decryption_unavailable`                                        | No                         |
| 12  | parent_analysis_id lookup fail | L120–123                                | `parent_not_found`                                              | No                         |
| 13  | Provider stream throws         | L183–187 (catch)                        | `anthropic_api_error` / `openai_api_error` / `unexpected_error` | No                         |
| 14  | INSERT returns no data         | L167–170 (post-stream)                  | `persist_failed`                                                | Attempted, no row returned |

**Test implication**: assert `SELECT COUNT(*) FROM analyses WHERE user_id = $uid` after each of #6–#13 above returns 0, not just "an error frame was emitted."

### D. continue-analysis context composition (Risk #2)

**File**: [src/pages/api/ai/run.ts](../../../src/pages/api/ai/run.ts)

```
L110   let resolvedContext = input.extra_context;          // default: no parent
L112   if (input.parent_analysis_id) {
L113–118   supabase.from("analyses").select("output")      // ONLY output column
             .eq("id", input.parent_analysis_id)
             .eq("user_id", user.id)                       // ownership guard
             .single();
L120–123   if (parentError) → error "parent_not_found", return
L125   resolvedContext = extra_context
         ? parentData.output + "\n\n" + input.extra_context
         : parentData.output;
L128–135  runAiAnalysis({ prompt: input.prompt_body,       // P2 (current prompt)
                          input: input.input,               // I2 (current input)
                          context: resolvedContext,         // parent.output (verbatim)
                          ... })
```

**Why P1 and I1 cannot leak**: the query at L115 fetches only `output`. The columns `prompt_body_snapshot` (P1) and `input` (I1) are never queried in this branch. They cannot appear in `runAiAnalysis`'s arguments.

**Depth-2 (grandchild)**: the query at L113–118 targets `parent_analysis_id` from the request body — the **immediate parent's id**. The code does not traverse further. When a grandchild is submitted with `parent_analysis_id = <child_id>`, it fetches `child.output` (not grandparent's). This is structurally enforced by a single point of composition — no recursive lookup exists.

### E. Provider payload composition (Risk #2 oracle)

**File**: [src/lib/services/ai/anthropic.ts](../../../src/lib/services/ai/anthropic.ts), lines 13–16

```typescript
const parts = [`Topic: ${opts.input}`, `Instructions: ${opts.prompt}`];
if (opts.context) parts.push(`Additional context: ${opts.context}`);
const userContent = parts.join("\n\n");
// → sent as messages[0].content
```

**File**: [src/lib/services/ai/openai.ts](../../../src/lib/services/ai/openai.ts), lines 12–15

```typescript
const parts = [`Topic: ${opts.input}`, `Instructions: ${opts.prompt}`];
if (opts.context) parts.push(`Additional context: ${opts.context}`);
const input = parts.join("\n\n");
// → sent as the `input` field of client.responses.create
```

Both providers use identical composition logic. The `opts` object is `RunAiAnalysisInput` (src/lib/services/ai/index.ts:23–29): `{ provider, model, prompt, input, context?, apiKey }`. There is no other field. The test stub must capture the **full opts object** and assert:

- `opts.prompt === P2` (current prompt body)
- `opts.input === I2` (current input)
- `opts.context === parent.output` (verbatim, or `parent.output + "\n\n" + extra_context`)
- `opts.prompt` does NOT contain P1
- `opts.input` does NOT contain I1

### F. toSafeAiError — the error-scrubbing boundary (Risks #4, #6)

**File**: [src/lib/services/ai/errors.ts](../../../src/lib/services/ai/errors.ts)

```
L4–8    SafeAiError interface: { status: number|null, code: string|null, message: string }
L11–34  toSafeAiError(err):
          Anthropic.APIError  → message: "anthropic_api_error", code: error.error.type
          OpenAI.APIError     → message: "openai_api_error",    code: err.code
          fallback            → message: "unexpected_error",    status/code: null
```

Used at run.ts:L184–187:

```typescript
const safe = toSafeAiError(err);
console.error("ai_run_failed", safe); // logged to workerd stdout
enqueue(sseFrame("error", safe)); // sent to client
```

**Security note**: the `console.error` at L186 logs the `safe` object (scrubbed). The raw `err` is **not** logged. The raw API key is never in `safe` by construction — `SafeAiError` only carries `status`, `code`, `message`.

**Risk #4 test implication**: to verify no key leaks, tests must:

1. Feed a synthetic provider error whose `err.message` contains the API key sentinel.
2. Assert `toSafeAiError(err)` output does NOT contain the sentinel (it won't, by construction).
3. Assert the captured `console.error` call contains only the `safe` object, not the raw error.

### G. runAiAnalysis abstraction boundary (stubbing target for tests)

**File**: [src/lib/services/ai/index.ts](../../../src/lib/services/ai/index.ts)

```
L23–29  RunAiAnalysisInput: { provider, model, prompt, input, context?, apiKey }
L33     export async function* runAiAnalysis(opts): AsyncGenerator<StreamEvent>
L35–41  branches to streamAnthropic or streamOpenAI
```

`runAiAnalysis` is the single module-boundary stub point for tests. Stubbing at this level:

- Captures the exact `opts` object (the verbatim-composition assertion for Risk #2)
- Avoids real network calls to providers
- Allows controlled `StreamEvent` sequences (yield `text` events, then `done` or throw for Risk #1/#6)

The stub must be an async generator that yields `{ kind: "text", delta: "..." }` then `{ kind: "done", output: "...", sources: ..., usage: ..., model: ..., provider: ... }`.

### H. Test infrastructure state

**package.json** — no test runner installed:

- No `vitest`, `jest`, `@vitest/*`, or `@cloudflare/vitest-pool-workers` in deps or devDeps
- No `"test"` script
- `"overrides": { "vite": "^7.3.2" }` — Vite is pinned transitively
- `@cloudflare/vite-plugin` is present (transitive via `@astrojs/cloudflare`)
- `supabase` CLI is in devDependencies (needed for `supabase start` in Phase 2)

**astro.config.mjs** — `output: "server"`, adapter: cloudflare(), vite with tailwindcss plugin only. No test config.

**CI (.github/workflows/ci.yml)** — runs `npx astro sync && npm run lint && npm run build`. No test step. Phase 4 adds `npm test` here.

**supabase/tests/rls_smoke.sql** — exists; covers 4 tables. Extended in Phase 2.

### I. API route surface to test

```
src/pages/api/
├── ai/run.ts            ← Phase 1 target (SSE, persist, continue, errors)
├── auth/signin.ts
├── auth/signout.ts
├── auth/signup.ts
├── prompts/[id].ts      ← Phase 2 target (cross-tenant)
├── prompts/index.ts     ← Phase 2 target
└── settings/
    ├── api-keys.ts      ← Phase 2 target (key leakage)
    └── default-model.ts
```

Phase 1 focuses exclusively on `src/pages/api/ai/run.ts`.

## Code References

- [src/pages/api/ai/run.ts:11–13](../../../src/pages/api/ai/run.ts) — `sseFrame` helper
- [src/pages/api/ai/run.ts:57–61](../../../src/pages/api/ai/run.ts) — ReadableStream + enqueue helper
- [src/pages/api/ai/run.ts:110–126](../../../src/pages/api/ai/run.ts) — `resolvedContext` and parent fetch (`.select("output")` only, ownership guard)
- [src/pages/api/ai/run.ts:125](../../../src/pages/api/ai/run.ts) — context composition: `parent.output + (extra_context ? "\n\n" + extra_context : "")`
- [src/pages/api/ai/run.ts:128–135](../../../src/pages/api/ai/run.ts) — `runAiAnalysis` call with `prompt: P2, input: I2, context: resolvedContext`
- [src/pages/api/ai/run.ts:143–165](../../../src/pages/api/ai/run.ts) — `kind === "done"` branch, row construction, the only INSERT
- [src/pages/api/ai/run.ts:167–170](../../../src/pages/api/ai/run.ts) — `persist_failed` on INSERT failure
- [src/pages/api/ai/run.ts:183–189](../../../src/pages/api/ai/run.ts) — catch + `toSafeAiError` + `finally { controller.close() }`
- [src/lib/services/ai/index.ts:23–29](../../../src/lib/services/ai/index.ts) — `RunAiAnalysisInput` interface (stub contract)
- [src/lib/services/ai/index.ts:33](../../../src/lib/services/ai/index.ts) — `runAiAnalysis` export (module-boundary stub target)
- [src/lib/services/ai/anthropic.ts:13–16](../../../src/lib/services/ai/anthropic.ts) — provider payload composition (Topic / Instructions / Additional context)
- [src/lib/services/ai/openai.ts:12–15](../../../src/lib/services/ai/openai.ts) — identical composition for OpenAI
- [src/lib/services/ai/errors.ts:4–34](../../../src/lib/services/ai/errors.ts) — `SafeAiError` + `toSafeAiError` (error-scrubbing boundary)
- [src/lib/services/api-key-crypto.ts](../../../src/lib/services/api-key-crypto.ts) — HKDF AES-256-GCM decryption; `decrypt_failed` throw mapped to `api_key_corrupted`

## Architecture Insights

### Single INSERT atomicity

The `analyses` INSERT at run.ts:165 is the only write path in the entire route. There is no "in-progress" row, no two-phase update, no compensating transaction. A failed analysis produces **zero rows** by design — the "done" branch is the only persist path, and every early-return above it leaves the DB untouched. This is the pattern from archive `2026-05-30-api-keys-and-ai-provider-client/plan.md:230` ("Atomicity: single INSERT on SSE done frame").

### No cross-provider payload leakage by construction

`RunAiAnalysisInput` (ai/index.ts:23–29) has exactly 6 fields. There is no `parentPrompt`, no `parentInput`. The context composition at run.ts:125 passes only `parent.output` into `context`. Both `streamAnthropic` and `streamOpenAI` accept only `context?: string`. Parent prompt and parent input structurally cannot appear in the provider payload.

### Error scrubbing is one layer deep

`toSafeAiError` handles Anthropic SDK errors, OpenAI SDK errors, and unknowns. It produces three possible `message` values: `anthropic_api_error`, `openai_api_error`, `unexpected_error`. The logged object at `console.error("ai_run_failed", safe)` is always the scrubbed form — the raw `err` is never logged. The API key, which is in `err` context only if the SDK error message surfaces it, is stripped by the scrubbing.

### controller.close() is in finally — always called

The `finally { controller.close() }` block at run.ts:188–190 runs in all three exit scenarios: `break` after done, `return` after any error frame, or catch after unexpected throw. The stream is never left dangling.

### workerd crypto is native SubtleCrypto (no polyfill)

`api-key-crypto.ts` uses `crypto.subtle.deriveKey` (HKDF) and `crypto.subtle.decrypt` (AES-256-GCM). These are available natively in workerd but may behave differently in Node. This is the strongest argument for `@cloudflare/vitest-pool-workers` (workerd process pool) over bare Vitest with jsdom/node: the decryption code path **must** run in the same crypto environment as production to be meaningful.

### Direct POST invocation as alternative

The exported `POST: APIRoute` function is a plain async function. If workerd pool setup proves complex, it can be tested by calling `POST(apiContext)` directly with a constructed `APIContext` mock. The tradeoff: `crypto.subtle.deriveKey` would run in Node's WebCrypto implementation, which is identical to workerd's SubtleCrypto spec. In practice this should be fine for HKDF/AES-GCM (both implement the Web Crypto spec), but the test plan marks this as "must confirm via Context7 lookup."

## Historical Context (from prior changes)

- [context/archive/2026-05-30-api-keys-and-ai-provider-client/plan.md:230](../../../context/archive/2026-05-30-api-keys-and-ai-provider-client/plan.md) — Decision: single INSERT on `done` frame ensures failed run = no row; no partial rows; no rollback needed.
- [context/archive/2026-05-30-api-keys-and-ai-provider-client/plan.md:286–287](../../../context/archive/2026-05-30-api-keys-and-ai-provider-client/plan.md) — Decision: SDK errors never logged raw; always map to `{status, code, safeMessage}` before surfacing (implemented as `toSafeAiError`).
- [context/archive/2026-05-30-api-keys-and-ai-provider-client/plan.md:51–54](../../../context/archive/2026-05-30-api-keys-and-ai-provider-client/plan.md) — HKDF-per-user AES-GCM via SubtleCrypto — workerd native, no polyfills. Test harness must run in compatible crypto environment.
- [context/archive/2026-05-31-continue-analysis-chain/plan.md:177–179](../../../context/archive/2026-05-31-continue-analysis-chain/plan.md) — Original design: fetch only `output`, compose `parent.output + extra_context`, ownership guard `.eq("user_id", user.id)` as defense-in-depth on top of RLS.
- [context/archive/2026-05-31-first-analysis-other-topic/plan.md:293–294](../../../context/archive/2026-05-31-first-analysis-other-topic/plan.md) — Frontend abort: `AbortController` signal → fetch aborts → ReadableStream throws → `finally { controller.close() }`. This is the client-side abort scenario for Risk #1 tests.
- [context/archive/2026-05-29-data-schema-and-rls/plan.md:140–149](../../../context/archive/2026-05-29-data-schema-and-rls/plan.md) — `analyses` schema: snapshot columns `prompt_name_snapshot`, `prompt_body_snapshot`, `prompt_description_snapshot`; self-ref FK `parent_analysis_id` (ON DELETE SET NULL). Important for test fixture seeding.

## Related Research

No prior research artifacts exist for this change. Phase 2 will reference this document for context on `api/run.ts` architecture.

## Open Questions

1. **Harness decision: vitest-pool-workers vs. direct POST invocation**. Context7 lookup needed: does `@cloudflare/vitest-pool-workers` work with Astro 6's SSR route exports? What is the minimal `wrangler.jsonc` `[test]` pool config? Is Node's `crypto.subtle` spec-compatible enough for HKDF/AES-GCM tests without the workerd pool?

2. **Constructing a minimal `APIContext` mock**. If using direct POST invocation: Astro's `APIContext` type requires `request`, `locals`, `cookies`, `url`, and several other fields. What is the minimal shim that satisfies TypeScript without importing Astro internals?

3. **Supabase stub in unit/integration tests**. For Risk #1: tests need to verify "zero rows inserted." Options: (a) call against a real local Supabase (`npx supabase start`) seeded with a test user; (b) spy on `supabase.from("analyses").insert`. The test plan §4 prefers (a) for Phase 2 multi-tenant tests. For Phase 1 SSE/persistence tests, either works — decision left to planning.

4. **Async generator stub for `runAiAnalysis`**. Vitest `vi.fn()` cannot directly stub async generators. The stub must return an async generator function. Confirm the idiom: `vi.spyOn(aiModule, "runAiAnalysis").mockImplementation(async function* () { yield ...; })`.

5. **`console.error` capture in tests**. For Risk #4/#6: capturing `console.error("ai_run_failed", safe)` output requires either `vi.spyOn(console, "error")` or log-capture via the workerd pool. Confirm the approach with Context7 Vitest docs.

6. **Error-class coverage gap**: three error codes share `"service_unavailable"` (paths #6, #8 in the table above). The test plan Risk #6 says "each distinct failure class maps to a stable, user-distinguishable error code." `service_unavailable` is currently used for three structurally different failures. Planning phase should decide whether to split them or accept the shared string as intentional.

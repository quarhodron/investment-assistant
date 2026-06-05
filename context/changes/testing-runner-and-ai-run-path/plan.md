# Test Runner + Critical AI Run Path — Implementation Plan

## Overview

Bootstrap Vitest with a bare-Node harness and write the first integration tests for `POST /api/ai/run` covering Risks #1 (SSE persistence atomicity — "no row on error"), #2 (continue-analysis context composition at depth 1 and depth 2), and #6 (error-class disambiguation). Production code receives one focused, scoped change — splitting three shared `service_unavailable` error codes into distinct codes so Risk #6's "user-distinguishable per failure class" wording becomes literally true.

## Current State Analysis

- No test runner installed. `package.json` has no `vitest`, no `"test"` script. Vite `^7.3.2` is pinned via `overrides`; `supabase` CLI is in devDeps.
- The wedge route `src/pages/api/ai/run.ts` is fully mapped in `context/changes/testing-runner-and-ai-run-path/research.md` (§§A–G). Single INSERT at L165; `controller.close()` in `finally` at L189; 13 error codes, 3 of which collide on `service_unavailable`.
- `runAiAnalysis` ([src/lib/services/ai/index.ts:33](src/lib/services/ai/index.ts)) is the natural stub boundary — an `async function*` with a 6-field `RunAiAnalysisInput` contract. Stubbing it captures the verbatim composition oracle Risk #2 requires.
- Astro 6 `output: "server"`, `@astrojs/cloudflare` adapter, workerd `nodejs_compat`. The decryption boundary uses `crypto.subtle.deriveKey` (HKDF) and `crypto.subtle.decrypt` (AES-GCM) — both available in Node 22's WebCrypto with spec-equivalent semantics to workerd. Phase 1 stubs `decryptApiKey` so this divergence is not exercised here.
- `eslint.config.js` matches `**/*.{js,mjs,cjs,ts,tsx,jsx}` — tests under `tests/integration/**` and `src/**/*.test.ts` will be linted by the existing base config.
- `tsconfig.json` includes `**/*` — test files are type-checked under the same project.
- `supabase/tests/rls_smoke.sql` is the established pattern for two-user DB fixtures (Phase 2 work, not this plan).

### Key Discoveries

- All 14 pre-insert / insert-failure scenarios for Risk #1 are tabulated in `research.md` §C — directly drivable as an `it.each` table.
- Risk #2's verbatim assertion is provable by capturing the `opts` argument to a stubbed `runAiAnalysis`: P1 and I1 are structurally absent from `RunAiAnalysisInput` because the parent query at run.ts L113–118 selects only `output`.
- `console.error("ai_run_failed", safe)` at run.ts L186 logs only the scrubbed `SafeAiError` — Risk #4 (key-leak) is structurally enforced and deferred to Phase 2 of the test-plan rollout.
- The three `service_unavailable` collisions occur at run.ts L30–35 (Supabase client null when env missing), L75–78 (`user_settings` query error), and L88–91 (`ai_models` query error). They are structurally different failure classes and should carry distinct codes.

## Desired End State

After this plan lands:

- `npm test` runs Vitest in CI-mode against the suite; `npm run test:watch` is available for development.
- A reusable harness under `tests/integration/_harness/` provides: an `APIContext` shim factory, an SSE response parser, a configurable Supabase-client stub, and a `runAiAnalysis` async-generator stub.
- The AI run route emits distinct error codes for each of its 13 distinct failure classes — no collisions.
- Integration tests cover: every Risk #1 scenario (14 cases, asserting `insert` was never invoked + correct error code), every distinct error code (Risk #6), continue-analysis composition at depth 1 + depth 2 with and without `extra_context` (Risk #2), and the happy-path "done" persist + final frame.
- `context/foundation/test-plan.md` §6.1, §6.2, §6.6 are filled with concrete commands and reference test paths.

Verify with: `npm test` exits 0; the test report shows ≥ Risk #1 (14 cases) + Risk #2 (3 cases + happy path) + Risk #6 (13 codes covered) tests passing.

## What We're NOT Doing

- **No CI wiring.** `.github/workflows/ci.yml` is not modified; the `npm test` step is added by Phase 4 of the test-plan rollout.
- **No pre-commit hook for tests.** lint-staged stays as-is; Phase 4 of the test-plan rollout decides the fast subset.
- **No real Supabase in this phase.** The Supabase client is stubbed at the module boundary; Phase 2 of the rollout introduces `npx supabase start` fixtures for cross-tenant tests.
- **No `@cloudflare/vitest-pool-workers`.** Bare Vitest with direct `POST` invocation in Node. Documented as a known divergence in `context/foundation/test-plan.md` §6.1; revisited if/when a test legitimately needs workerd-only behaviour.
- **No API-key leakage assertions.** Risk #4 is owned by Phase 2 of the rollout per `test-plan.md` §3.
- **No multi-tenant / RLS tests.** Risks #3 and #5 are Phase 2.
- **No snapshot-on-save tests.** Risk #7 is Phase 3.
- **No tests for `src/components/*`, `src/pages/*.astro`, or auth pages.** Per `test-plan.md` §7 negative-space.
- **No coverage thresholds enforced.** `@vitest/coverage-v8` is installed for ad-hoc inspection; thresholds are deferred until the suite has enough surface to set meaningful numbers.
- **No changes to the SSE frame shape** other than the three error-code renames in Phase 3.

## Implementation Approach

Strict sequencing: bootstrap → harness → production code split → tests that depend on the split → context-composition tests → cookbook.

Phase 3 ships the production-code split alone (no tests in that diff) so the change is reviewable in isolation; Phase 4 then writes the table-driven test that depends on the new codes. This separation keeps each phase's diff focused and reviewable.

All stubs replace whole modules via `vi.mock(...)`, not deep proxies. The Supabase stub is a small builder over the `.from(table).select(...).eq(...).single()` chain — built only as wide as the route calls today. The `runAiAnalysis` stub is replaced per-test via `vi.mocked(runAiAnalysis).mockImplementation(...)` returning an async iterable.

Test files use explicit imports from `vitest` (no globals) — matches the project's existing import-explicit style.

## Critical Implementation Details

- **Module-boundary stubbing requires `vi.mock` at the top of each test file.** `vi.mock(...)` calls are hoisted by Vitest; they must reference factory functions that don't capture closure state, or use `vi.hoisted()` for shared mocks. Subsequent per-test behaviour is set via `vi.mocked(fn).mockImplementation(...)` inside `beforeEach`/`it`. Failing to follow this pattern is the #1 cause of "mock not applied" confusion with Vitest.
- **The async-generator stub for `runAiAnalysis` must be an async generator function, not a plain function returning a promise.** Vitest's `vi.fn()` accepts an implementation that is itself `async function* () { ... }`. Returning a `Promise<AsyncIterable<...>>` will fail the `for await (const event of generator)` loop in the route.
- **`vi.mock("@/lib/supabase")` replaces `createClient` — return either `null` (to drive the `service_unavailable` path) or a stub builder.** The route calls `createClient(headers, cookies)` once at L29; the stub builder must be returned from that single call. Use a module-scoped `currentSupabaseStub` variable mutated per test.

## Phase 1: Bootstrap Vitest

### Overview

Install Vitest + coverage, write a minimal `vitest.config.ts`, add npm scripts, write one smoke test that imports a pure helper from `src/lib/utils.ts` to prove resolve+TS+`@/*` alias all work end-to-end.

### Changes Required

#### 1. Dependencies

**File**: `package.json`

**Intent**: Add Vitest to devDependencies; add `"test"` and `"test:watch"` scripts.

**Contract**:

- `devDependencies`: `vitest` (match the `overrides.vite` minor — `^3.x` compatible with Vite 7), `@vitest/coverage-v8` (matching vitest version).
- `scripts.test`: `vitest run`
- `scripts["test:watch"]`: `vitest`
- No other manifest changes.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Configure Vitest for Node-environment server-route tests with the project's `@/*` alias.

**Contract**:

- Default `environment: "node"`.
- `resolve.alias`: `"@": fileURLToPath(new URL("./src", import.meta.url))`.
- `test.include`: `["src/**/*.test.ts", "tests/**/*.test.ts"]`.
- `test.exclude`: vitest defaults plus `["dist*/**", ".astro/**"]`.
- `test.coverage`: provider `v8`, reporter `text`, include `src/**`, exclude `src/db/**`, `src/components/ui/**`, `**/*.astro`. No thresholds.
- No globals — tests import `{ describe, it, expect, vi }` from `vitest` explicitly.

#### 3. Smoke test

**File**: `src/lib/utils.test.ts` (new, colocated)

**Intent**: One trivial assertion that exercises the test runner, TS transform, and `@/*` alias resolution.

**Contract**: A single `describe("cn", () => it("merges class names"))` block importing `cn` from `@/lib/utils`, asserting a known merge result.

#### 4. ESLint scope (verify-only)

**File**: `eslint.config.js`

**Intent**: Confirm tests are linted by the existing base block; add no rules unless `npm run lint` fails on the new test files.

**Contract**: No diff expected. If `eslint .` flags the new files, add a narrow override block for `**/*.test.ts` + `tests/**` that disables `@typescript-eslint/no-unsafe-*` rules common in test code (the diff in that case is one config block; do not relax base rules globally).

### Success Criteria

#### Automated Verification

- Vitest installs cleanly: `npm install` exits 0.
- `npm test` exits 0 with one passing test.
- `npm run lint` exits 0 (or, if a rules override was needed, the override is scoped to test paths only).
- `npx astro sync && npx tsc --noEmit` succeeds.

#### Manual Verification

- Running `npm run test:watch` starts the watcher and re-runs on file save.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Test Harness Helpers

### Overview

Build the four reusable helpers Phase 4 + Phase 5 depend on: a Vitest-mockable Supabase-client stub, an async-generator stub factory for `runAiAnalysis`, an `APIContext` shim factory, and an SSE response parser.

### Changes Required

#### 1. APIContext shim

**File**: `tests/integration/_harness/api-context.ts` (new)

**Intent**: Build a minimal `Parameters<APIRoute>[0]` for invoking `POST` directly — only the fields `src/pages/api/ai/run.ts` reads.

**Contract**: Exported `buildApiContext(opts: { body?: unknown; user?: { id: string } | null; origin?: string; headers?: Record<string, string> }): Parameters<APIRoute>[0]`. The returned object provides `request` (a real `Request` with JSON body and headers), `locals.user`, and `cookies` (a no-op `AstroCookies`-shaped object — `get`/`set`/`delete` returning `undefined`). All other `APIContext` fields are absent; the return type is cast `as unknown as Parameters<APIRoute>[0]` at the boundary.

#### 2. SSE response parser

**File**: `tests/integration/_harness/sse.ts` (new)

**Intent**: Read a `Response.body` ReadableStream to completion and parse SSE frames into a typed array.

**Contract**: Exported `parseSseFrames(response: Response): Promise<{ event: string; data: unknown }[]>`. Reads stream to EOF, decodes UTF-8, splits on `\n\n`, parses each frame's `event:` line + `data:` line (JSON-parses `data`). Throws if `response.body` is null. Pure function, no fixtures.

#### 3. Supabase-client stub

**File**: `tests/integration/_harness/supabase-stub.ts` (new)

**Intent**: Provide a chainable Supabase stub matching only the `.from(...).select/eq/insert/single/maybeSingle` calls run.ts makes today; capture `insert` payloads for Risk #1 assertions.

**Contract**:

- Exported `createSupabaseStub(responses: Partial<Record<TableName, TableHandler>>): SupabaseStub` where `TableName` is `"user_settings" | "ai_models" | "analyses"` and `TableHandler` is `(query: { op: "select" | "insert"; cols?: string; filters: Record<string, unknown>; insertRow?: unknown }) => { data: unknown; error: unknown | null }`.
- The returned `SupabaseStub` exposes `.from(table)` chainable, supporting `.select(cols)`, `.eq(col, value)`, `.insert(row)`, `.single()`, `.maybeSingle()` — terminal methods return `Promise<{ data, error }>` derived from the registered handler.
- Exposes `.insertCalls: { table: string; row: unknown }[]` — the array Risk #1 tests assert against.
- A separate `createNullSupabaseStub()` returns the literal `null` (drives the `service_unavailable` / `supabase_unavailable` path).

#### 4. runAiAnalysis stub factory

**File**: `tests/integration/_harness/ai-stub.ts` (new)

**Intent**: Encapsulate the async-generator stub idiom + an opts-capture helper so tests don't reinvent the pattern.

**Contract**:

- Exported `mockRunAiAnalysis(): { capturedOpts: RunAiAnalysisInput | null; setEvents(events: StreamEvent[]): void; setError(err: unknown): void }` — returns a controller object.
- `setEvents([{kind:"text",delta:"a"},{kind:"done",...}])` configures the next call to yield those events.
- `setError(err)` configures the next call to `throw err` partway through (after yielding any text events queued first).
- `capturedOpts` is populated synchronously on call entry.
- Tests use `vi.mocked(runAiAnalysis).mockImplementation(controller.implementation)` — the controller exposes a compatible `implementation` async-generator function.

#### 5. `decryptApiKey` mock helper

**File**: `tests/integration/_harness/ai-stub.ts` (same file as above)

**Intent**: Centralise the `vi.mock("@/lib/services/api-key-crypto")` boilerplate.

**Contract**: Exported `mockDecryptApiKey(): { setKey(key: string): void; setError(err: Error): void }`. By default returns the literal string `"test-api-key"`. `setError(new Error("decrypt_failed"))` drives the `api_key_corrupted` path; any other Error drives `decryption_unavailable`.

### Success Criteria

#### Automated Verification

- Each helper compiles under `npx astro sync && npx tsc --noEmit`.
- `npm run lint` exits 0 across `tests/integration/_harness/**`.
- `npm test` still passes (Phase 1 smoke test unaffected).

#### Manual Verification

- A throwaway scratch test using all four helpers can be authored and run successfully — confirmed by writing one ad-hoc spec, running it, then deleting it.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Split Shared `service_unavailable` Error Codes

### Overview

Rename the three collisions in `src/pages/api/ai/run.ts` so each failure class carries a distinct, user-distinguishable code. This is a production-code change with **no test code in this phase** — it sets up the stable code surface Phase 4 asserts against.

### Changes Required

#### 1. Distinct error codes in run.ts

**File**: `src/pages/api/ai/run.ts`

**Intent**: Replace `message: "service_unavailable"` at three call sites with distinct, descriptive codes.

**Contract**:

- L30–35 (`createClient` returned null — env vars missing): `message: "supabase_unavailable"`. Status remains 503.
- L75–78 (`user_settings` query error): `message: "settings_unavailable"`. Status remains the 200 SSE-stream default; the error is emitted as an SSE error frame, not a status code.
- L88–91 (`ai_models` query error): `message: "models_unavailable"`. Same emission semantics as above.
- No other code in run.ts changes. No frontend changes — the existing UI surfaces these as generic error text already; if any consumer pattern-matches on `"service_unavailable"`, surface it in review.

#### 2. Comment-only marker (optional)

**File**: `src/pages/api/ai/run.ts`

**Intent**: None — do not add comments referencing this change or Risk #6. The rename is self-documenting.

**Contract**: No additional changes beyond the three string literals.

### Success Criteria

#### Automated Verification

- `npx astro sync && npx tsc --noEmit` succeeds.
- `npm run lint` exits 0.
- `npm test` still passes (no test depends on the old strings yet).
- `npm run build` succeeds.
- `grep -n "service_unavailable" src/pages/api/ai/run.ts` returns no matches.

#### Manual Verification

- Trigger each path via the running app:
  1. Stop the dev server's Supabase env, restart, hit `/api/ai/run` — observe `supabase_unavailable` in the SSE error frame.
  2. With a valid env, temporarily revoke the user's `user_settings` row (manually delete via Supabase Studio), hit the API — observe `settings_unavailable`.
  3. Pass an `model_id` that exists but `enabled = false` — observe `invalid_model` (sanity check, this path was already distinct).
- Use an in-browser `fetch()` snippet for each (per lessons.md: never curl for app routes; the browser carries auth cookies):
  ```js
  const r = await fetch("/api/ai/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      /* minimal valid body */
    }),
  });
  const text = await r.text();
  console.log(text);
  ```

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Risk #1 + Risk #6 Tests — Error-Class Table

### Overview

One table-driven integration test that exercises every pre-insert / insert-failure error scenario in run.ts. For each row: assert the emitted SSE error frame matches the expected `message` (Risk #6 — distinct code per class), and assert `supabaseStub.insertCalls` is empty (Risk #1 — no row persisted on error).

### Changes Required

#### 1. Error-table integration test

**File**: `tests/integration/api/ai/run.errors.test.ts` (new)

**Intent**: Single `describe` containing `it.each(scenarios)` over the 14 cases from research.md §C. Each case configures the Supabase + AI + decrypt stubs to trigger that failure, invokes `POST`, parses the response, and asserts the failure outcome.

**Contract**:

- File-top `vi.mock("@/lib/supabase", ...)`, `vi.mock("@/lib/services/ai", ...)`, `vi.mock("@/lib/services/api-key-crypto", ...)` declarations using the helpers from Phase 2.
- Test table: 14 rows mirroring research.md §C — `{ name, setup(stubs), expectedMessage, expectedStatus?, expectedDetail?, shouldAttemptInsert: false | "yes-but-fails" }`.
- For 13 rows (#1–#13): assert `parseSseFrames(response)` contains exactly one `error` frame whose `data.message` equals expected; assert `supabaseStub.insertCalls.length === 0`.
- For row #14 (`persist_failed`): configure the insert handler to return `{ data: null, error: { code: "23505" } }`; assert the error frame is `persist_failed`; assert `supabaseStub.insertCalls.length === 1` (the attempt happened); assert no `done` frame was emitted.
- Helpers from `_harness/` are imported; no test-local duplication of stub logic.

#### 2. Errors-module unit test (small companion)

**File**: `src/lib/services/ai/errors.test.ts` (new, colocated)

**Intent**: Lock the `toSafeAiError` mapping for the three branches (`Anthropic.APIError`, `OpenAI.APIError`, fallback) so refactors to error scrubbing can't silently regress.

**Contract**: Three `it` blocks: synthetic Anthropic error → `{ message: "anthropic_api_error" }`; synthetic OpenAI error → `{ message: "openai_api_error" }`; plain `new Error("...")` → `{ message: "unexpected_error" }`. No assertion on the raw `Error.message` contents (covered by Phase 2 of the rollout).

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with 14 + 3 new tests passing (table cases + errors-module unit).
- Every distinct error code in the route is asserted by exactly one row (Risk #6 coverage check — manual code-grep at review time, not enforced by test).
- `npm run lint` exits 0.
- `npx astro sync && npx tsc --noEmit` succeeds.

#### Manual Verification

- Read the test report; confirm each Risk #1 scenario name in the report matches a row in research.md §C.
- Intentionally introduce a regression — change the `kind === "done"` branch to insert before the `if (!insertResult.data)` check — and re-run; confirm the persist_failed test now reports `insertCalls.length` mismatch.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Risk #2 Tests — Continue-Analysis Context Composition

### Overview

Integration tests that capture the `opts` object passed to a stubbed `runAiAnalysis` and assert continue-analysis composes the provider payload verbatim at depth 1 and depth 2. Includes the happy-path "done frame + INSERT" smoke that ties Phases 1–4 together.

### Changes Required

#### 1. Context-composition integration test

**File**: `tests/integration/api/ai/run.context.test.ts` (new)

**Intent**: Four `it` blocks exercising depth-1, depth-1+extra_context, depth-2, and "no parent" (control) composition.

**Contract**:

- File-top `vi.mock` declarations identical to Phase 4 (use the same harness helpers).
- **Test 1 — depth-1 child without extra_context**: Supabase stub returns `{ output: "PARENT_OUT_1" }` for the parent fetch; request body has `parent_analysis_id: "p1"`, `prompt_body: "P2"`, `input: "I2"`, no `extra_context`. Assert captured `opts.prompt === "P2"`, `opts.input === "I2"`, `opts.context === "PARENT_OUT_1"`. Assert `opts.prompt` does NOT contain a sentinel "P1_NEVER_PASSED" and `opts.input` does NOT contain "I1_NEVER_PASSED" (these sentinels are configured in the test setup so absence is meaningful).
- **Test 2 — depth-1 child with extra_context**: Same as Test 1 but request includes `extra_context: "EXTRA"`. Assert `opts.context === "PARENT_OUT_1\n\nEXTRA"` (exact string equality — research.md §D line 125).
- **Test 3 — depth-2 grandchild**: Supabase stub returns `{ output: "CHILD_OUT" }` when `parent_analysis_id` filter equals `"child-id"`. Request body has `parent_analysis_id: "child-id"`. Assert `opts.context === "CHILD_OUT"` — the route does not traverse to the grandparent; this proves no recursive lookup.
- **Test 4 — no parent (control)**: Request body has no `parent_analysis_id`, has `extra_context: "ONLY_EXTRA"`. Assert `opts.context === "ONLY_EXTRA"`. Asserts the default-branch path at run.ts L110.

#### 2. Happy-path smoke

**File**: `tests/integration/api/ai/run.happy.test.ts` (new)

**Intent**: One `it` that drives the full success path end-to-end and asserts the `done` frame shape + the INSERT was called exactly once with the expected snapshot fields.

**Contract**:

- Configure stubs for a valid no-parent run. `runAiAnalysis` stub yields one `text` event then one `done` event with synthetic `output`, `sources`, `usage`, `model`, `provider`.
- Assert parsed frames are `[{event:"delta", ...}, {event:"done", data:{analysis_id, sources, usage, model, provider}}]` — in that order.
- Assert `supabaseStub.insertCalls.length === 1`; assert the captured row's `prompt_body_snapshot`, `prompt_name_snapshot`, `input`, `output`, `provider`, `model` fields match the request and the done event.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with 4 context tests + 1 happy-path test passing (5 new tests on top of Phase 4's 17).
- `npm run lint` exits 0.
- `npx astro sync && npx tsc --noEmit` succeeds.

#### Manual Verification

- Read the test report; confirm the depth-2 test specifically asserts `CHILD_OUT` and not `PARENT_OUT_1` (the grandparent's hypothetical output) — this is the assertion that proves the no-recursive-lookup invariant.
- Sanity-check the happy-path test's captured snapshot fields against `AnalysisInsert` in `src/types.ts`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Cookbook + Plan Close-out

### Overview

Fill in `context/foundation/test-plan.md` §6.1, §6.2, §6.6 with concrete commands and the reference test paths Phase 1 of the rollout produced. Update §3 status to `complete`. Update `change.md`.

### Changes Required

#### 1. Cookbook §6.1 — Bootstrapping the test runner

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 1" placeholder with the actual commands and config-file references.

**Contract**: §6.1 paragraph lists: `npm test`, `npm run test:watch`, the location of `vitest.config.ts`, the `_harness/` directory, the chosen approach (bare Vitest + direct POST invocation in Node), and the known divergence note (workerd-specific crypto/runtime is not exercised; revisit if a future test legitimately needs it).

#### 2. Cookbook §6.2 — Adding an integration test for an API route

**File**: `context/foundation/test-plan.md`

**Intent**: Replace "TBD" with a copy-paste recipe pointing at `tests/integration/api/ai/run.errors.test.ts` as the canonical pattern.

**Contract**: §6.2 paragraph lists: where to put the file, the three `vi.mock(...)` declarations needed, how to use `buildApiContext` + `parseSseFrames` + `createSupabaseStub` + `mockRunAiAnalysis`, and the recommendation to prefer table-driven `it.each` for error-class coverage.

#### 3. Cookbook §6.6 — Per-rollout-phase notes

**File**: `context/foundation/test-plan.md`

**Intent**: Add a 2–3 line note for Phase 1 capturing what was surprising or load-bearing.

**Contract**: One paragraph noting: chose bare-Vitest + direct POST invocation over the workers pool because crypto is stubbed at the decryption boundary in Phase 1; reference test for future integration tests is `tests/integration/api/ai/run.errors.test.ts`; production code received one rename diff (the three `service_unavailable` splits) — Phase 1 of the rollout's only production-code change.

#### 4. Phase status update

**File**: `context/foundation/test-plan.md`

**Intent**: Update §3 row 1 status from `change opened` to `complete`.

**Contract**: One cell edit in the §3 table.

#### 5. Change identity update

**File**: `context/changes/testing-runner-and-ai-run-path/change.md`

**Intent**: Status update only.

**Contract**: `status: complete`; `updated: <today>`.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 (no regression from Phase 5).
- `npm run lint` exits 0.
- `npm run format` produces no diff (markdown is prettier-formatted).
- `grep -c "TBD — see §3 Phase 1" context/foundation/test-plan.md` returns 0.
- `grep -c "TBD — see §3 Phase 2" context/foundation/test-plan.md` returns ≥ 1 (Phase 2 of rollout still TBD).

#### Manual Verification

- Read `context/foundation/test-plan.md` §6 end-to-end; confirm a future contributor reading it cold could add a new integration test from §6.2 without first reading any code.
- Confirm §3 table renders correctly in a Markdown preview with the updated status.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests

- `cn` smoke (Phase 1) — proves the runner.
- `toSafeAiError` mapping (Phase 4) — locks error-scrubbing branches.

### Integration Tests

- Error-class table over 14 scenarios (Phase 4) — Risk #1 + Risk #6.
- Context composition: depth-1, depth-1+extra, depth-2, no-parent (Phase 5) — Risk #2.
- Happy-path SSE + INSERT (Phase 5) — wedge end-to-end.

### Manual Testing Steps

1. After Phase 3, hit `/api/ai/run` for each of the three rewritten failure paths and confirm the new code text appears in the SSE error frame (use the in-browser `fetch` snippet above).
2. After Phase 5, run `npm test -- --reporter=verbose` and read every test name out loud against the Risk Response Guidance for #1, #2, #6 in `context/foundation/test-plan.md` §2 — every "What would prove protection" sentence must map to a test.
3. After Phase 6, re-read `context/foundation/test-plan.md` §6.1 and §6.2 cold; confirm a contributor could add a new integration test without reading the implementation.

## Performance Considerations

- Vitest in Node runs the full suite in well under a second at this scale; no concern.
- No `setupFiles` heavy work; per-test `beforeEach` resets are O(1).
- Coverage is opt-in (`npm test -- --coverage`); not on every run.

## Migration Notes

- The three error-code renames in Phase 3 are technically a public-API change for the SSE error message field. No existing frontend code pattern-matches on `"service_unavailable"` (verified: the front-end surfaces these as generic error text via `MarkdownOutput.tsx` and `NewAnalysisForm.tsx` — no string-equality branches). If a downstream consumer reads the error code, it will see the new code; this is acceptable per the test plan's Risk #6 wording.

## References

- Research: `context/changes/testing-runner-and-ai-run-path/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (Risk Map), §3 (Phased Rollout row 1), §4 (Stack), §6 (Cookbook)
- Lessons: `context/foundation/lessons.md` — manual verification format, archive SHA handling
- Route under test: [src/pages/api/ai/run.ts](src/pages/api/ai/run.ts)
- Stub boundary: [src/lib/services/ai/index.ts](src/lib/services/ai/index.ts)
- Error scrubbing: [src/lib/services/ai/errors.ts](src/lib/services/ai/errors.ts)
- Existing two-user DB pattern (Phase 2 of rollout, not this plan): [supabase/tests/rls_smoke.sql](supabase/tests/rls_smoke.sql)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap Vitest

#### Automated

- [x] 1.1 Vitest installs cleanly: `npm install` exits 0 — 95a676d
- [x] 1.2 `npm test` exits 0 with one passing test — 95a676d
- [x] 1.3 `npm run lint` exits 0 (or, if a rules override was needed, the override is scoped to test paths only) — 95a676d
- [x] 1.4 `npx astro sync && npx tsc --noEmit` succeeds — 95a676d

#### Manual

- [x] 1.5 Running `npm run test:watch` starts the watcher and re-runs on file save — 95a676d

### Phase 2: Test Harness Helpers

#### Automated

- [x] 2.1 Each helper compiles under `npx astro sync && npx tsc --noEmit` — 1b82700
- [x] 2.2 `npm run lint` exits 0 across `tests/integration/_harness/**` — 1b82700
- [x] 2.3 `npm test` still passes (Phase 1 smoke test unaffected) — 1b82700

#### Manual

- [x] 2.4 A throwaway scratch test using all four helpers can be authored and run successfully — confirmed by writing one ad-hoc spec, running it, then deleting it — 1b82700

### Phase 3: Split Shared `service_unavailable` Error Codes

#### Automated

- [x] 3.1 `npx astro sync && npx tsc --noEmit` succeeds — b0d8508
- [x] 3.2 `npm run lint` exits 0 — b0d8508
- [x] 3.3 `npm test` still passes (no test depends on the old strings yet) — b0d8508
- [x] 3.4 `npm run build` succeeds — b0d8508
- [x] 3.5 `grep -n "service_unavailable" src/pages/api/ai/run.ts` returns no matches — b0d8508

#### Manual

- [x] 3.6 Trigger `supabase_unavailable`, `settings_unavailable`, `invalid_model` (sanity) via in-browser `fetch` and observe the new error codes in the SSE error frame — b0d8508

### Phase 4: Risk #1 + Risk #6 Tests — Error-Class Table

#### Automated

- [x] 4.1 `npm test` exits 0 with 14 + 3 new tests passing (table cases + errors-module unit) — 06f035f
- [x] 4.2 Every distinct error code in the route is asserted by exactly one row (manual code-grep at review) — 06f035f
- [x] 4.3 `npm run lint` exits 0 — 06f035f
- [x] 4.4 `npx astro sync && npx tsc --noEmit` succeeds — 06f035f

#### Manual

- [x] 4.5 Read the test report; confirm each Risk #1 scenario name matches a row in research.md §C — 06f035f
- [x] 4.6 Intentionally regress the persist_failed branch; confirm the test catches it; revert — 06f035f

### Phase 5: Risk #2 Tests — Continue-Analysis Context Composition

#### Automated

- [x] 5.1 `npm test` exits 0 with 4 context tests + 1 happy-path test passing (5 new tests on top of Phase 4's 17) — 4acce23
- [x] 5.2 `npm run lint` exits 0 — 4acce23
- [x] 5.3 `npx astro sync && npx tsc --noEmit` succeeds — 4acce23

#### Manual

- [x] 5.4 Read the test report; confirm the depth-2 test specifically asserts `CHILD_OUT` and not the hypothetical grandparent's output — 4acce23
- [x] 5.5 Sanity-check the happy-path test's captured snapshot fields against `AnalysisInsert` in `src/types.ts` — 4acce23

### Phase 6: Cookbook + Plan Close-out

#### Automated

- [x] 6.1 `npm test` exits 0 (no regression from Phase 5) — d5c33c0
- [x] 6.2 `npm run lint` exits 0 — d5c33c0
- [x] 6.3 `npm run format` produces no diff — d5c33c0
- [x] 6.4 `grep -c "TBD — see §3 Phase 1" context/foundation/test-plan.md` returns 0 — d5c33c0
- [x] 6.5 `grep -c "TBD — see §3 Phase 2" context/foundation/test-plan.md` returns ≥ 1 — d5c33c0

#### Manual

- [x] 6.6 Read `context/foundation/test-plan.md` §6 end-to-end; confirm a contributor could add a new integration test from §6.2 without first reading any code — d5c33c0
- [x] 6.7 Confirm §3 table renders correctly in Markdown preview with the updated status — d5c33c0

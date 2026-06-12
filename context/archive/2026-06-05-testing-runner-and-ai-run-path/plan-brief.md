# Test Runner + Critical AI Run Path — Plan Brief

> Full plan: `context/changes/testing-runner-and-ai-run-path/plan.md`
> Research: `context/changes/testing-runner-and-ai-run-path/research.md`

## What & Why

Bootstrap Vitest with a bare-Node harness and write the first integration tests for `POST /api/ai/run`, covering the three highest-impact risks tied to the wedge: SSE persistence atomicity (no half-saved row on error), continue-analysis context composition (parent's output goes through verbatim, parent's prompt/input never leak), and error-class disambiguation (every distinct failure carries a distinct, user-distinguishable code). This is Phase 1 of the four-phase rollout in `context/foundation/test-plan.md`.

## Starting Point

There is no test runner installed today. The wedge route `src/pages/api/ai/run.ts` has 13 documented error codes, three of which share the literal string `service_unavailable` for structurally different failures. The single INSERT lives only in the `kind === "done"` branch (run.ts L165); every other error path returns early — making "no row on error" a clean, testable invariant. `runAiAnalysis` (a 6-field async generator in `src/lib/services/ai/index.ts:33`) is the natural module-boundary stub for capturing the exact provider payload.

## Desired End State

`npm test` runs Vitest and exercises ~22 tests: the full error-class table (14 scenarios, each asserting both the SSE error code and that no `analyses` row was inserted), continue-analysis composition at depth 1 + depth 2 with and without `extra_context`, and the happy-path "done frame + INSERT" smoke. The AI run route emits distinct codes for all 13 failure classes. The test-plan cookbook §6.1 and §6.2 carry concrete commands so the next phase can add tests without reading harness code.

## Key Decisions Made

| Decision                    | Choice                                                                                                                     | Why (1 sentence)                                                                                                                                                                  | Source |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Test runner                 | Vitest (bare, Node env)                                                                                                    | Vite is already pinned via `overrides`; smallest setup that fits Astro 6 + the import-explicit style of the codebase.                                                             | Plan   |
| Route-handler harness       | Direct `POST` invocation in Node (no workers pool)                                                                         | Node 22 WebCrypto is spec-equivalent for the crypto paths exercised; the workers pool's complexity isn't justified when Phase 1's tests stub at the decryption and DB boundaries. | Plan   |
| Supabase strategy (Phase 1) | Stub at module boundary                                                                                                    | Zero infra dependency; Risk #1's "no row" becomes "insert was never called" — functionally equivalent, and the real-DB validation lands in Phase 2 of the rollout.                | Plan   |
| Test file layout            | Colocated `*.test.ts` for units; `tests/integration/**/*.test.ts` for integration                                          | Matches the unit + integration split in test-plan §3; small units stay close to code, route tests describe a flow.                                                                | Plan   |
| Error-code disambiguation   | Split the three `service_unavailable` collisions into `supabase_unavailable`, `settings_unavailable`, `models_unavailable` | Risk #6's "user-distinguishable per failure class" becomes literally true; isolated in its own phase so the diff is reviewable.                                                   | Plan   |
| CI / pre-commit wiring      | Script only (`"test": "vitest run"`); defer CI step + hook to Phase 4 of the rollout                                       | Honours the phase boundaries in test-plan §3; smaller, focused diff.                                                                                                              | Plan   |
| Key-leak assertions         | Strictly defer to Phase 2 of the rollout                                                                                   | Risk #4 is Phase 2's deliverable per test-plan §3; `toSafeAiError` already enforces the invariant structurally.                                                                   | Plan   |

## Scope

**In scope:**

- Vitest install + `vitest.config.ts` + `npm test` / `npm run test:watch`
- Reusable harness: APIContext shim, SSE parser, Supabase stub, `runAiAnalysis` + `decryptApiKey` stubs
- Production change: split the three `service_unavailable` codes
- Tests for Risks #1, #2, #6 against `src/pages/api/ai/run.ts`
- Cookbook updates in `context/foundation/test-plan.md` §6.1, §6.2, §6.6

**Out of scope:**

- CI workflow changes, pre-commit hook updates (Phase 4 of the rollout)
- `@cloudflare/vitest-pool-workers` setup
- Real local Supabase fixtures (Phase 2 of the rollout)
- Risks #3, #4, #5 (Phase 2 of the rollout)
- Risk #7 snapshot-on-save tests (Phase 3 of the rollout)
- Component / Astro page / auth tests (test-plan §7 negative-space)
- Coverage thresholds

## Architecture / Approach

Tests import `POST` directly from `src/pages/api/ai/run.ts` and invoke it with a minimal `APIContext` shim. Three `vi.mock(...)` declarations replace `@/lib/supabase`, `@/lib/services/ai`, and `@/lib/services/api-key-crypto` at the module boundary — per-test behaviour is configured through the helper objects in `tests/integration/_harness/`. The SSE response body is read to EOF and parsed into a `{event, data}[]` array; assertions then check both the emitted frames (Risk #2, #6) and the captured `supabaseStub.insertCalls` (Risk #1).

```
test → POST(buildApiContext({...}))
         │
         ├── createClient → SupabaseStub  (captures insertCalls)
         ├── decryptApiKey → "test-api-key" (or throws)
         └── runAiAnalysis → async generator (captures opts, yields events)
              │
              └── parseSseFrames(response.body) → assertions
```

## Phases at a Glance

| Phase                       | What it delivers                                                         | Key risk                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1. Bootstrap Vitest         | `vitest.config.ts`, `npm test`, smoke test                               | Vitest 3.x / Vite 7 compat mismatch — verify on install                                                   |
| 2. Test harness helpers     | `_harness/` with 4 stub factories + SSE parser + APIContext shim         | Supabase stub fidelity — must match the actual `.from().select().eq().single()` calls the route makes     |
| 3. Split shared error codes | Three string-literal renames in `run.ts`                                 | Hidden downstream consumer pattern-matching on `service_unavailable` (verified: none in current frontend) |
| 4. Risk #1 + #6 tests       | 14-row error-class table + `toSafeAiError` unit test                     | Async-generator stub idiom — must yield, not return a Promise                                             |
| 5. Risk #2 tests            | depth-1, depth-1+extra, depth-2, no-parent, happy path                   | Capturing `opts` synchronously on call entry (not after `await`)                                          |
| 6. Cookbook + close-out     | test-plan.md §6.1 / §6.2 / §6.6 filled; change & rollout marked complete | None — pure documentation                                                                                 |

**Prerequisites:** None beyond what's already in `package.json`; no schema changes; no env vars; no Docker; no Supabase.

**Estimated effort:** ~1–2 working sessions across 6 small phases. Phase 3 is a 10-minute production diff; Phases 4 and 5 are the bulk of the work.

## Open Risks & Assumptions

- **Assumption**: No production consumer pattern-matches on the literal string `"service_unavailable"`. Verified by code-grep of `src/components/`, `src/pages/`, but if a future Phase 2 test reveals a hidden caller, the Phase 3 rename may break it.
- **Assumption**: Node 22 WebCrypto is spec-equivalent to workerd for the HKDF + AES-GCM paths. Not exercised in Phase 1 (decryption is stubbed) but stated in `test-plan.md` §4 — flagged for re-verification when Phase 2 of the rollout writes the key-leak tests.
- **Risk**: Async-generator stubbing in Vitest has a known footgun (return vs yield, hoisting of `vi.mock`). Phase 2's `_harness/ai-stub.ts` is the single point this idiom is encoded — if the harness is wrong, every test using it fails the same way (easier to debug than scattered patterns).
- **Risk**: Direct `POST` invocation bypasses Astro's middleware. Middleware is responsible for populating `context.locals.user`; the harness's `buildApiContext` sets it directly. If middleware behaviour ever becomes load-bearing for `/api/ai/run`, the harness needs to evolve.

## Success Criteria (Summary)

- `npm test` exits 0 with ~22 tests passing — covering every Risk #1 scenario, every distinct error code (Risk #6), and continue-analysis composition at depth 1 + depth 2 + happy path (Risk #2).
- The AI run route's SSE error frames carry a distinct, user-distinguishable code for every documented failure class.
- A contributor reading `context/foundation/test-plan.md` §6.1 + §6.2 cold can add a new integration test without first reading the harness source.

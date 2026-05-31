# API Keys and AI Provider Client (F-02) — Plan Brief

> Full plan: `context/changes/api-keys-and-ai-provider-client/plan.md`

## What & Why

F-02 stands up the AI execution layer for Investment Assistant: per-user encrypted API keys (Anthropic + OpenAI), a database-backed model registry that survives provider release cadence without a Worker deploy, and a thin server-side `runAiAnalysis()` that streams from both providers. Every downstream slice (S-01 first analysis, S-02 continue-analysis, S-06 company-bound runs) calls into this layer; getting the encryption choice right here is irreversible — migrating later is per-key key-rotation, not a schema migration.

## Starting Point

F-01 has shipped the multi-tenant data schema with RLS — `user_settings.api_keys jsonb` exists as an empty, RLS-isolated container with no encryption shape committed. There's no `src/lib/services/` yet, no AI SDKs, and no validation library. The Astro `astro:env/server` env shape and the SSR Supabase client are in place; F-01 also left a known follow-up (F3: auto-create `user_settings` on signup) deferred to this slice.

## Desired End State

A user can sign up, open `/settings`, paste their Anthropic and/or OpenAI keys, pick a default model, and save — and from that point on, calling `POST /api/ai/run` streams a real Anthropic or OpenAI completion to the browser via SSE, persists the result as an immutable `analyses` row on completion (with verbatim sources and token usage), and returns a typed-error frame on any failure without ever leaking the key into logs or error messages. New models can be added by inserting a row in `ai_models` — no deploy.

## Key Decisions Made

| Decision                       | Choice                                                            | Why (1 sentence)                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Encryption-at-rest mechanism   | Worker SubtleCrypto AES-GCM + versioned envelope                  | Only candidate with a real rotation story; native to workerd; zero Supabase coupling — Vault forbids API roles, pgcrypto leaks the passphrase to logs. |
| Per-user subkey                | HKDF-SHA256(masterKey, salt=userId, info='f02-api-keys-v1')        | ~10 LOC of defense-in-depth; converts a master-key leak into "leak with per-user derivation" — cheap option-value.            |
| Settings UI re-disclosure rule | Status only ("configured" / "not configured")                      | Strict reading of FR-028 "API keys are never disclosed back to the user-facing product surface"; nothing to leak via DOM.    |
| Model registry shape           | DB table `ai_models` with read-only RLS, seeded                    | FR-030 explicitly forbids redeploys for new models; `wrangler secret put` JSON is awful UX; checked-in TS file hides under deploy cadence. |
| Slice scope                    | Ships a minimal `/settings` page end-to-end                        | Makes F-02 manually verifiable on its own (encrypt-on-save round-trip is observable); S-01 inherits a finished surface.       |
| AI SDK choice                  | Official `@anthropic-ai/sdk@^0.100.1` + `openai@^6.39.1`           | Both list Cloudflare Workers; both expose `AsyncIterable` streams; ~70 kB combined — well under the 3 MB ceiling.            |
| `runAiAnalysis()` return shape | `AsyncIterable<StreamEvent>`                                       | NFR requires "continuous visible progress > 2s"; SDKs natively expose AsyncIterable so it's a thin pass-through.             |
| Wire format                    | Server-Sent Events (`text/event-stream`)                            | Workers `ReadableStream` pass-through is "already optimal" per Cloudflare docs; matches both SDKs' upstream protocol.        |
| Persistence ordering           | Single `INSERT` after stream completes                             | FR-020 immutability — no partial-then-update path can exist; failed runs leave no rows.                                       |
| Validation library             | Hand-rolled checks, no library                                     | CLAUDE.md asks me to propose; v1 input shapes are 2–3 fields; introducing zod sets a project-wide precedent without justification. |
| Failure-mode UX                | Typed scrubbed error, no row                                       | FR-028 "never in logs/errors"; FR "failed analysis does not corrupt data"; SSE `error` frame carries `{status, code, safeMessage}` only. |
| F-01 follow-up F3              | Trigger lands in F-02's migration                                  | The follow-up doc routes it here; a Postgres `AFTER INSERT ON auth.users` trigger eliminates a class of unique_violation errors. |
| Verification                   | Manual smoke + a SQL probe + roundtrip script                      | CLAUDE.md forbids inventing a test framework as a side-effect; matches F-01's posture; each invariant observable in <1 min.  |

## Scope

**In scope:**

- New migration: `ai_models` table + RLS + seed; `auth.users → user_settings` auto-create trigger + back-fill (closes F-01 F3).
- `src/lib/services/api-key-crypto.ts` — encrypt/decrypt module using HKDF-derived per-user AES-GCM via Web Crypto.
- `ENCRYPTION_KEY` Wrangler secret + Astro env declaration + pre-commit deny-list extension.
- `/settings` Astro page + React island; three API routes (`POST` / `DELETE /api/settings/api-keys`, `POST /api/settings/default-model`).
- `src/lib/services/ai/{anthropic,openai,index,errors}.ts` — provider streaming clients + `runAiAnalysis()` facade + scrubber.
- `POST /api/ai/run` SSE endpoint that decrypts keys, streams deltas, persists the analysis row on completion.
- Types: `AiModel`, `StreamEvent`, `StoredSources` re-exported through `src/types.ts`.
- Manual smoke artifacts: `scripts/encrypt-roundtrip.mjs`; runbook update.

**Out of scope:**

- New-analysis UI / result rendering (S-01).
- Continue-analysis context composition (S-02 prepends parent output before calling).
- Watchlist-injected prompt composition (S-06).
- Admin UI for the model registry; cost-display work beyond storing what providers return.
- Retry / circuit-breaker / Worker-layer rate limiting; multi-provider fan-out.
- Anthropic extended-thinking; raw web_search_tool_result block storage.
- A test framework — CLAUDE.md forbids inventing one.

## Architecture / Approach

```
Browser ─POST /api/settings/api-keys (form)─▶ Settings route ─encryptApiKey()─▶ user_settings (jsonb ciphertext envelope)
Browser ─POST /api/ai/run ──────────────────▶ Run route ──┬─ load user_settings, decryptApiKey()
                                                          ├─ runAiAnalysis() (provider dispatch)
                                                          ├─ stream delta SSE frames ◀── Anthropic/OpenAI SDK AsyncIterable
                                                          └─ on done: INSERT analyses row, emit done frame with id
```

Encryption module is pure (no Supabase). AI client modules are pure (no Supabase, no encryption — `apiKey` is a parameter). Routes own all the orchestration. RLS owns isolation; the route never reads another user's row. Errors scrubbed at every catch.

## Phases at a Glance

| Phase                                              | What it delivers                                                                                                       | Key risk                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Schema (`ai_models` + auto-create trigger)      | Migration with RLS-protected `ai_models` table seeded with v1 roster + signup trigger; types regenerated               | A `SECURITY DEFINER` trigger function — must hard-code `search_path = public` to be safe.       |
| 2. Encryption module + `ENCRYPTION_KEY` plumbing   | `api-key-crypto.ts` with HKDF-per-user AES-GCM; env declaration; secret-check extension; roundtrip script              | IV reuse is catastrophic for AES-GCM — every encrypt MUST `crypto.getRandomValues` a fresh IV. |
| 3. Settings UI + 3 endpoints                       | `/settings` page, save/remove API-key routes, default-model route; status-only re-disclosure                            | Plaintext on the wire only on save; route never returns it back. UI must never see ciphertext. |
| 4. AI provider client + streaming run endpoint     | `runAiAnalysis()` + `POST /api/ai/run` SSE route; persists immutable `analyses` row on completion; scrubs every error  | Error scrubbing is non-negotiable — `console.error(err)` raw can carry the auth header.        |

**Prerequisites:** F-01 shipped (✓ — per `roadmap.md` baseline). Local Supabase via `npx supabase start`. Anthropic and OpenAI API keys to test with.
**Estimated effort:** ~3-4 sessions across the four phases (one session per phase, longest is Phase 4).

## Open Risks & Assumptions

- **Master-key loss is unrecoverable for users.** Losing `ENCRYPTION_KEY` means every stored ciphertext is garbage; users must re-paste keys. Mitigation: back up the master key out-of-band when first generated. Documented in the runbook.
- **The `web_search` tool is used by default for both providers.** This adds provider cost and complexity that F-02 doesn't strictly need (S-01 could ship without sources). Decision: kept in v1 because FR-032 is must-have and citations are exactly what the wedge needs to feel like research, not chat. If costs surprise, the registry's `supports_web_search` boolean lets us turn it off per-model without a code change.
- **`AnalysisInsert` shape includes `prompt_*_snapshot` fields the route receives from the caller, not from `prompts`.** This keeps F-02 stateless w.r.t. the prompts table; S-01 will read the prompt row before invoking. The assumption is that S-01 (or any future caller) will faithfully snapshot — but the schema's NOT NULL constraints catch this at insert time anyway.
- **No CI gate on encryption roundtrip.** Same posture as F-01's RLS smoke; promotion is deferred until a CI Postgres exists.

## Success Criteria (Summary)

- A user saves an API key in `/settings`; in Supabase Studio the row contains a versioned ciphertext envelope (no plaintext anywhere); the same plaintext for a second user produces different ciphertext (HKDF works).
- `POST /api/ai/run` streams real provider deltas via SSE and persists exactly one immutable `analyses` row on completion, with sources stored verbatim.
- A failed run (invalid key / corrupted ciphertext / invalid model) returns one SSE `error` frame, writes no row, and produces no log line containing the key prefix or prompt body.

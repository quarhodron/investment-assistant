# API Keys and AI Provider Client (F-02) — Implementation Plan

## Overview

Stand up the AI execution layer. Three concerns ship together because they're inseparable: (1) per-user encrypted storage of Anthropic + OpenAI API keys in `user_settings.api_keys`, using HKDF-derived per-user AES-GCM via Web Crypto in the Worker; (2) a database-backed `ai_models` registry that lets new model variants be added without a Worker deploy or schema migration (FR-030); (3) a thin server-side `runAiAnalysis()` function that streams from Anthropic / OpenAI as `AsyncIterable<StreamEvent>`, and an SSE `POST /api/ai/run` route that consumes the iterator, persists the analysis as one immutable `INSERT` on completion, and scrubs every error so keys never leak to logs.

The slice ships a minimal `/settings` page (FR-028 + FR-029 + FR-030) end-to-end so the encrypt-on-save / never-redisclose / model-pick invariants are manually verifiable on F-02 alone — S-01 inherits a finished settings surface and uses the AI run endpoint without retrofitting either.

The slice also closes the F-01 deferred follow-up F3: an `AFTER INSERT ON auth.users` trigger creates the `user_settings` row at signup, eliminating the PK-race on first write.

## Current State Analysis

- **F-01 baseline is clean.** `user_settings (user_id PK, api_keys jsonb DEFAULT '{}', default_model text)` exists with per-operation per-role RLS — the column is RLS-isolated and shapeless (we own the ciphertext envelope). Schema lives at `supabase/migrations/20260529120000_data_schema_and_rls.sql:92-117`. Database types are generated at `src/db/database.types.ts:147-169` and re-exported through `src/types.ts:14-16` (`UserSettings`, `UserSettingsInsert`, `UserSettingsUpdate`).
- **No `src/lib/services/` exists yet.** CLAUDE.md prescribes it for "extracted business logic" — F-02 is the first slice to need it.
- **No validation library is installed.** CLAUDE.md says "propose rather than assume zod"; we hand-roll for v1's tiny input shapes.
- **No AI provider SDKs are installed.** `package.json` carries Supabase + Astro/React + Tailwind only. Adding `@anthropic-ai/sdk` and `openai` is the only dependency-surface change in this slice.
- **No encryption library is needed.** Web Crypto (SubtleCrypto) is native to workerd; AES-GCM and HKDF are first-class. `nodejs_compat` is enabled in `wrangler.jsonc:6` but unused for crypto.
- **Astro env pattern is single-shape**: `astro:env/server` declared in `astro.config.mjs:17-23`, consumed via named imports (`import { SUPABASE_URL } from "astro:env/server"` — `src/lib/supabase.ts:3`). Two existing secrets (`SUPABASE_URL`, `SUPABASE_KEY`) are `optional: true` so the SSR client returns `null` at boot when env is absent (`src/lib/supabase.ts:7-9`); F-02 follows the same shape — `ENCRYPTION_KEY` is `optional: true` and the encryption module's exported functions reject when it's missing (callers must handle, matching the existing `null`-Supabase contract).
- **Pre-commit secret hygiene** (`scripts/check-wrangler-secrets.mjs:1-27`) already greps `wrangler.jsonc` for JWT-shaped strings and known secret keys; we extend the deny-list with the new env name.
- **F-01 follow-up F3** queued at `context/changes/data-schema-and-rls/follow-ups/review-fixes.md`: `user_settings` has no auto-create trigger — concurrent first-write requests can race the PK. Resolved here.
- **PRD invariants this slice must enforce structurally / at the route layer**:
  - **FR-028**: per-user keys, encrypted at rest, never disclosed back to the user surface, never in logs / errors / analytics. Belongs to: storage shape (encryption module) + API route shape (status-only readback) + error scrubbing.
  - **FR-029**: default model from Settings; per-run override (FR-012) is S-01's job.
  - **FR-030**: model variants registry — modifiable without Worker redeploy.
  - **FR-032**: provider-returned sources stored verbatim. Schema column already `analyses.sources jsonb NOT NULL DEFAULT '[]'`.
  - **NFR streaming**: "during any wait longer than two seconds the user sees continuous visible progress" — `runAiAnalysis()` returns `AsyncIterable<StreamEvent>`; route emits SSE deltas.
  - **NFR data integrity**: "failed analysis does not corrupt or delete the user's prompt, watchlist, or any prior analysis" — single-INSERT-on-completion preserves this (a failed run leaves no rows).

### Key Discoveries

- **`@anthropic-ai/sdk@^0.100.1`** (released 2026-05-29) and **`openai@^6.39.1`** (released 2026-05-28) both list Cloudflare Workers as supported. Both expose `messages.stream()` / `responses.create({stream:true})` as `AsyncIterable`. Citation shapes differ:
  - Anthropic web search → `text` block's `citations: [{type:'web_search_result_location', url, title, cited_text, encrypted_index}]`. Includes a 150-char snippet.
  - OpenAI Responses with `web_search` tool → `url_citation` annotations: `{type:'url_citation', url, title, start_index, end_index}`. No snippet.
  - Storing **both arrays verbatim** in a discriminated-union envelope (`{provider, items}`) preserves the FR-032 verbatim guarantee and lets the renderer derive a common view-model at render time.
- **Vault was rejected.** Supabase forbids the `vault` schema to API roles; using it requires `SECURITY DEFINER` wrappers that re-implement isolation outside RLS, defeating F-01's centralization. pgsodium is also pending deprecation per Supabase docs.
- **pgcrypto was rejected.** The passphrase-handoff problem leaks the secret into `pg_stat_statements` / `pg_settings` regardless of variant chosen.
- **Workers SubtleCrypto AES-GCM** is the only mechanism with a real rotation story: store `{v:1, ...}` in the ciphertext envelope; on read, decrypt with `v_n`, re-encrypt with `v_n+1`, write back.
- **HKDF per-user subkey** costs ~10 LOC and converts a master-key leak from "global plaintext" into "global plaintext but with per-user derivation" — non-trivial defense-in-depth at trivial cost.
- **Both SDKs ship as Web-Standards-only**: native `fetch` + `ReadableStream` + `AsyncIterable`, no Node `http` polyfills required. Bundle size ~70 kB combined, well under the 3 MB Workers ceiling.
- **`F-01` Phase 2 generated types depend on `npx supabase gen types typescript --local`**, run by hand against the live local stack. F-02 phase 1 mutates `user_settings` (no — it adds a new table `ai_models`); we re-run gen-types after the migration so both new tables and any schema additions flow through to `src/db/database.types.ts`.

## Desired End State

After this plan ships:

1. A user can sign up, navigate to `/settings`, paste an Anthropic and/or OpenAI API key, pick a default model from a provider-grouped dropdown, and save. The Settings page never reads the keys back — it shows "Anthropic key configured" with a "Replace" / "Remove" affordance.
2. `select api_keys::text from user_settings` returns ciphertext-only JSONB; no plaintext anywhere on disk.
3. A direct call (curl or test page) to `POST /api/ai/run` with `{provider, model, prompt, contextOptional}` streams SSE deltas back, ends in a `done` frame containing the new `analyses.id`, sources (verbatim per-provider envelope), and usage.
4. Failed runs leave no rows; failed runs return SSE `error` frames whose payload contains `{status, code, message}` only — never the prompt body, never the API key, never the upstream Error stack.
5. Adding a new model is a one-shot `INSERT INTO ai_models (...)` — no migration, no Worker deploy.
6. New auth users get a `user_settings` row at signup automatically; existing dev users back-filled by the same migration.

### Verification

- `npx supabase db reset` applies cleanly. Migration ordering: `ai_models` table + RLS + seed → `auth.users → user_settings` trigger + back-fill.
- `npm run lint` and `npm run build` pass.
- `node scripts/encrypt-roundtrip.mjs` (one-shot) asserts `decrypt(encrypt(plaintext, userId), userId) === plaintext` against `.dev.vars`'s ENCRYPTION_KEY for a synthetic user id.
- Manual smoke against `npm run dev`: sign up two users, save distinct keys, confirm via Studio that ciphertext envelopes differ across users (HKDF correctly diversifies); confirm cross-user reads are blocked by RLS.
- Manual smoke against the run endpoint: a curl to `/api/ai/run` with a real key streams; with an invalid key sends an `error` frame.

## What We're NOT Doing

- **No new-analysis UI.** S-01 owns the analysis form, result rendering, and the empty-state chain. This slice ships only `/settings` UI plus `/api/ai/run` reachable via curl or a temporary test page.
- **No watchlist-injected prompt composition (Business Logic #3).** S-06 owns prepending the company block. The `runAiAnalysis()` `prompt` parameter is a string the caller already composed — F-02's contract is "we don't modify prompt bodies."
- **No continue-analysis context composition.** Business Logic #2's verbatim-parent-output rule is solved at the call site by S-02, which prepends the parent output to its `context` argument. F-02's `context?` parameter is just a string passed through.
- **No admin UI for the model registry.** Adding a model is a SQL paste in Supabase Studio (or a `supabase/snippets/add-<model-id>.sql` file). The PRD never asks for an admin UI; v1 has no admin role.
- **No FR-033 cost-display work beyond storing what providers return.** We persist `input_tokens`, `output_tokens`, and (when present) `cost_usd` into the existing `analyses` columns. Display is S-01's job.
- **No retry / circuit-breaker / rate-limit handling beyond what the SDKs do natively.** A failed run is a failed run — user re-runs.
- **No multi-provider fan-out.** A run targets exactly one provider/model.
- **No client-side encryption.** Plaintext travels over TLS to the Worker, which encrypts. The PRD threat model is database-at-rest plus log/error leaks; over-the-wire is HTTPS's job.
- **No model-pricing table or live pricing fetch.** Cost columns receive only what the provider returns; we don't compute it.
- **No test framework.** CLAUDE.md forbids inventing one. Verification is manual smoke + the encrypt-roundtrip script.
- **No prompt-input rate limiting at the Worker layer.** v1 scale is single-digit users; the providers' own rate limits are the gate.
- **No Anthropic "extended thinking" mode.** Stream-shape gets messier with `thinking` blocks; not asked for; trivial to enable later.
- **No raw `web_search_tool_result` block storage.** Only the `text` block's `citations` array (Anthropic) / `url_citation` annotations (OpenAI) are stored. Raw search-tool result blocks contain opaque `encrypted_content` round-trip tokens that are useful only on multi-turn flows we don't have.

## Implementation Approach

Four phases, ordered by dependency:

1. **Schema** lands first because everything else needs `ai_models` (the model dropdown source) and the auto-create trigger (every Settings page load expects a `user_settings` row).
2. **Encryption module** lands second so the Settings phase can call `encrypt()` without scaffolding it inline.
3. **Settings UI + endpoints** lands third, providing a complete user-facing surface for the F-02 invariants.
4. **AI provider client + run endpoint** lands last because it's the only phase that depends on the Settings page being able to seed encrypted keys for manual smoke.

Each phase ends with manual verification: F-02 is one of the slices the PRD's "API keys never appear in logs" guardrail makes hardest to test, and the manual SQL probe is the only meaningful check for "ciphertext-on-disk."

The cumulative bundle add is ~70 kB (combined SDKs); CI's existing `npm run build` keeps the 3 MB ceiling visible.

## Critical Implementation Details

- **Versioned ciphertext envelope is the rotation enabler.** Every encrypted blob persists `{v:1, alg:'aes-256-gcm', iv:<b64>, ct:<b64>}`. Without `v` we cannot rotate the master key without simultaneously re-encrypting every row, and we cannot detect a partially-rotated table. With `v`, rotation is "decrypt under v_n, re-encrypt under v_n+1, write back" — idempotent and resumable.
- **HKDF salt is the user UUID's bytes, info string is `'f02-api-keys-v1'`.** Hard-coding the info string couples it to the version field; if we ever change the derivation, bump `v` and the info string together so old envelopes decrypt under the old derivation only.
- **AES-GCM IV reuse is catastrophic.** Always `crypto.getRandomValues(new Uint8Array(12))` per encryption — never reuse an IV under the same key. The HKDF-per-user subkey reduces blast radius further (a within-user IV collision affects only that user's two messages).
- **The route never returns plaintext after save.** The Settings page reads only `{anthropic: {configured: boolean}, openai: {configured: boolean}, default_model: string|null}`. There is no `GET /api/settings/api-keys`. Plaintext flows server→provider only via `runAiAnalysis()`.
- **Error scrubbing is non-negotiable.** Every catch in `/api/ai/run` and the Settings endpoints maps SDK errors to `{status, code, safeMessage}` before logging or surfacing. Never `console.error(err)` raw — the SDK error's `cause` and `request` fields can carry the auth header.
- **SSE done-frame includes the new `analyses.id`.** S-01's UI navigates to `/analyses/:id` after the stream ends; without the id in the final frame, it can't.
- **`runAiAnalysis()` decryption happens inside the route, not inside the AI client module.** Keeps the AI client pure (`apiKey` is a parameter) and lets the route own the "fetch user_settings → decrypt → call client → persist row" sequence as one transactional flow.
- **Auto-create trigger uses `ON CONFLICT DO NOTHING`** so the back-fill INSERT is idempotent against rows the trigger may already have created during migration replay.

---

## Phase 1: Schema — `ai_models` registry, auto-create trigger, type regeneration

### Overview

Single forward-only migration adding the `ai_models` table with read-only RLS and seeded model roster, the `auth.users → user_settings` auto-create trigger with back-fill, and re-generated TypeScript types. Closes F-01 follow-up F3.

### Changes Required

#### 1. New migration file

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_ai_models_and_user_settings_autocreate.sql` (timestamp adjusted to actual run time, kebab-prefixed by `YYYYMMDDHHmmss` per CLAUDE.md convention).

**Intent**: Add the model registry and the user-settings auto-create flow in one atomic migration. RLS-first per CLAUDE.md: every CREATE TABLE is followed by `ENABLE ROW LEVEL SECURITY` and per-operation per-role policies before the next statement.

**Contract**:

- **`ai_models`**: `id text PRIMARY KEY` (e.g., `'claude-opus-4-8'`), `provider text NOT NULL CHECK (provider IN ('anthropic','openai'))`, `display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200)`, `supports_web_search boolean NOT NULL DEFAULT false`, `is_default boolean NOT NULL DEFAULT false`, `sort_order integer NOT NULL DEFAULT 100`, `enabled boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`. Partial unique index `(provider) WHERE is_default = true` so at most one model per provider can be marked default. RLS enabled with one policy: `SELECT TO authenticated USING (enabled)`. `REVOKE ALL FROM anon; GRANT SELECT ON ai_models TO authenticated;` — read-only by RLS, no INSERT/UPDATE/DELETE policy means writes via API roles are denied (admin operates via the SQL editor or service-role).
- **Seed `ai_models` rows**: small v1 roster. Anthropic: `claude-opus-4-8` (display "Claude Opus 4.8", default), `claude-sonnet-4-6` (display "Claude Sonnet 4.6"). OpenAI: `gpt-5.1` (display "GPT-5.1", default), `gpt-5.1-mini` (display "GPT-5.1 mini"). All `supports_web_search=true`, `enabled=true`, `sort_order` ascending so Opus 4.8 / GPT-5.1 sort first.
- **Auto-create trigger function** `handle_new_user_settings()` `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`: `INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING; RETURN NEW;`. The `SECURITY DEFINER` is required because `auth.users` triggers run in the auth-service execution context where the firing role doesn't have INSERT on `public.user_settings`. The explicit `SET search_path = public` neutralizes the [search-path hijack class](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY) of bug.
- **Trigger**: `AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user_settings()`.
- **Back-fill**: `INSERT INTO public.user_settings (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;` — idempotent against any rows the trigger may have created if migration replays.

#### 2. Regenerate database types

**File**: `src/db/database.types.ts`

**Intent**: Re-run `npx supabase gen types typescript --local > src/db/database.types.ts` against the live local stack so the new `ai_models` row/insert/update types flow into the codebase. This is the same workflow F-01 Phase 2 established.

**Contract**: The generated file gains an `ai_models` entry under `Database['public']['Tables']`. No manual edits.

#### 3. Re-export new entity types

**File**: `src/types.ts`

**Intent**: Add `AiModel`, `AiModelInsert`, `AiModelUpdate` exports per CLAUDE.md convention, mirroring the existing `Prompt`/`Analysis`/`WatchedCompany`/`UserSettings` exports.

**Contract**: Three new named exports of `Database['public']['Tables']['ai_models']['Row' | 'Insert' | 'Update']`.

### Success Criteria

#### Automated Verification

- Migration applies cleanly from empty: `npx supabase db reset` exits 0
- After reset, `select count(*) from public.ai_models` returns the seeded roster count (4 rows)
- Lint passes: `npm run lint`
- Build passes: `npm run build` (also runs `astro check` against the new types)

#### Manual Verification

- In Supabase Studio, the `ai_models` table appears with the seeded rows; the partial unique index `(provider) WHERE is_default = true` is visible
- Signing up a new user via `/auth/signup` produces exactly one matching row in `user_settings` (verify via SQL editor)
- A second signup is also handled correctly (no PK conflict surfaced anywhere)
- Hovering over a `.from('ai_models').select('*')` call in the editor shows the row type as `AiModel`, not `any`

**Implementation Note**: After Phase 1's automated verification passes, pause for manual confirmation that the Supabase Studio inspections succeeded before starting Phase 2.

---

## Phase 2: Encryption module + ENCRYPTION_KEY plumbing

### Overview

The crypto module that the Settings and run endpoints will both depend on, plus the env / Wrangler-secret plumbing for the master key.

### Changes Required

#### 1. Astro env schema declaration

**File**: `astro.config.mjs`

**Intent**: Add `ENCRYPTION_KEY` to the `astro:env/server` schema so it's strongly typed for callers and validated at boot. Mark it `optional: true` to mirror the existing `SUPABASE_URL` / `SUPABASE_KEY` shape — the encryption module exports throw a clear typed error when the env is absent, the same way `src/lib/supabase.ts` returns `null`.

**Contract**: New entry `ENCRYPTION_KEY: envField.string({ context: "server", access: "secret", optional: true })` next to the two existing entries.

#### 2. Encryption module

**File**: `src/lib/services/api-key-crypto.ts` (creates the `services/` subdirectory)

**Intent**: Owner of every byte that touches a user's plaintext API key. Derives a per-user AES-GCM subkey via HKDF and encrypts/decrypts the persisted blob. Pure module, no Supabase dependency.

**Contract**:

- Exported types: `EncryptedBlob = { v: 1, alg: 'aes-256-gcm', iv: string, ct: string }`. The `v` is the version discriminator that enables future rotation.
- Exported function `encryptApiKey(plaintext: string, userId: string): Promise<EncryptedBlob>`. Throws `Error('encryption_key_missing')` when the env is absent.
- Exported function `decryptApiKey(blob: EncryptedBlob, userId: string): Promise<string>`. Throws `Error('encryption_key_missing')` for the same reason; throws `Error('decrypt_failed')` on AES-GCM authentication failure (covers tampered ciphertext, wrong subkey, etc.).
- Exported function `isEncryptionConfigured(): boolean` — convenience for `/settings`'s server-side load to render a "configure ENCRYPTION_KEY" banner gracefully if it isn't set, instead of crashing.
- Internal: `getMasterKey()` imports the base64 master key once per call as an HKDF base key; `deriveUserKey(userId)` runs `crypto.subtle.deriveKey` with `{name:'HKDF', hash:'SHA-256', salt: <userId-bytes>, info: 'f02-api-keys-v1'}` to produce an AES-GCM key. IV is `crypto.getRandomValues(new Uint8Array(12))` per encryption.

#### 3. Pre-commit secret-check extension

**File**: `scripts/check-wrangler-secrets.mjs`

**Intent**: The existing pre-commit hook scans `wrangler.jsonc` for known secret names. Add `ENCRYPTION_KEY` to the same deny-list so a copy-paste accident never lands plaintext in version control.

**Contract**: Append `ENCRYPTION_KEY` to whatever literal-key list the script already maintains.

#### 4. Roundtrip smoke script

**File**: `scripts/encrypt-roundtrip.mjs`

**Intent**: A one-shot manual probe that proves the module is wired correctly. Reads `.dev.vars`'s `ENCRYPTION_KEY`, imports the compiled module (or directly re-implements the algorithm against the documented contract — whichever is cheaper from a Node script), encrypts a known plaintext, decrypts it, and asserts equality. Fails loud on mismatch.

**Contract**: `node scripts/encrypt-roundtrip.mjs` exits 0 on round-trip success, exits 1 with a clear error otherwise. Reads `ENCRYPTION_KEY` from `.dev.vars` (parse-by-hand — minimal `KEY=value` reader, no dotenv dep). The script lives at the same level as `check-wrangler-secrets.mjs` and is not run in CI.

#### 5. Documentation update

**File**: `context/deployment/runbook.md`

**Intent**: Add the master-key generation + Wrangler-secret-put steps to the runbook so the operator knows how to (a) generate the key, (b) install it locally, (c) install it in prod, (d) rotate it (placeholder pointing at the version-bump pattern).

**Contract**: One additional section "Encryption key (F-02)" with three commands: `openssl rand -base64 32` to generate; `echo "$VALUE" >> .dev.vars` for local; `echo "$VALUE" | npx wrangler secret put ENCRYPTION_KEY` for prod. Plus a "Rotation" subsection describing the bump-`v`-and-re-encrypt-on-next-touch pattern as the v1 strategy.

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Roundtrip script succeeds: `node scripts/encrypt-roundtrip.mjs` exits 0
- Pre-commit secret check still passes (and would now flag a literal `ENCRYPTION_KEY` in `wrangler.jsonc`): `node scripts/check-wrangler-secrets.mjs` exits 0; manually inserting `"ENCRYPTION_KEY": "test"` into `wrangler.jsonc` causes the script to exit non-zero (revert before commit)

#### Manual Verification

- `.dev.vars` contains `ENCRYPTION_KEY=<base64>` (32 random bytes, base64-encoded)
- Hovering over a call site of `encryptApiKey` shows the typed `Promise<EncryptedBlob>` return
- Re-running the roundtrip script with a different `ENCRYPTION_KEY` value (temporary edit of `.dev.vars`) produces different ciphertext for the same plaintext (proves the master key is actually consumed)
- Re-running the roundtrip with the same key but two different `userId`s produces different ciphertext for the same plaintext (proves HKDF-per-user is actually deriving distinct subkeys)

**Implementation Note**: After Phase 2's automated verification passes, pause for manual confirmation before starting Phase 3.

---

## Phase 3: Settings page + API-key save / remove / default-model endpoints

### Overview

A `/settings` Astro page rendering React cards for Anthropic and OpenAI API keys (status-only, with Replace/Remove buttons) and a default-model selector. Three new API routes wire form submissions to encrypted storage in `user_settings`. Closes FR-028 user-facing surface, FR-029, and the read side of FR-030.

### Changes Required

#### 1. Settings page

**File**: `src/pages/settings.astro`

**Intent**: Server-rendered page that loads the current user's `user_settings` row and the `ai_models` registry, then renders a single-form React island for editing. Adds `/settings` to `PROTECTED_ROUTES` in `src/middleware.ts:1` so unauthenticated access redirects to signin.

**Contract**: Astro frontmatter:
- Loads `context.locals.user` (set by middleware).
- Calls `supabase.from('user_settings').select('default_model, api_keys').eq('user_id', user.id).single()` — RLS makes the predicate redundant but explicit; the auto-create trigger from Phase 1 means the row always exists.
- Calls `supabase.from('ai_models').select('id, provider, display_name, is_default, sort_order').eq('enabled', true).order('sort_order')`.
- Maps `api_keys` jsonb to a typed `{anthropic: {configured: boolean}, openai: {configured: boolean}}` so the form never receives ciphertext — `configured = api_keys?.[provider] !== undefined`.
- Renders the Astro layout shell + a React `<SettingsForm>` island with `client:load`, passing the configured-summary, models grouped by provider, and the current default model id.
- Includes a one-time error banner if `?error=...` is in the URL (matches the existing auth-route pattern at `src/pages/api/auth/signin.ts:18`).

#### 2. SettingsForm React island

**File**: `src/components/SettingsForm.tsx`

**Intent**: Client component with three input groups (Anthropic key, OpenAI key, default-model selector). Each provider section shows either a "key configured" status with Replace/Remove buttons, or a paste-input + Save. Default-model is a `<select>` grouped by provider (use the `optgroup` element).

**Contract**:
- Props: `{ status: { anthropic: { configured: boolean }, openai: { configured: boolean } }, models: AiModel[], defaultModelId: string | null }`.
- Submit handlers POST to `/api/settings/api-keys` (provider, key plaintext) for save, DELETE to `/api/settings/api-keys?provider=...` for remove, POST to `/api/settings/default-model` (model_id) for the selector.
- Each submit redirects via the form action's response (server returns a redirect with `?ok=1` or `?error=...` query param). Pure progressive-enhancement form-submit; no fetch / SWR.
- shadcn/ui `Button`, `Input`, `Card` components; uses `cn()` from `@/lib/utils`. Pull missing components via `npx shadcn@latest add input card label select`.

#### 3. API-key save / remove route

**File**: `src/pages/api/settings/api-keys.ts`

**Intent**: Server endpoint owning every encrypt-on-save / remove flow. Handles `POST` (save) and `DELETE` (remove). Auth-checked via `context.locals.user`; null user → 401. Uses the SSR Supabase client (RLS predicate is `(SELECT auth.uid()) = user_id`).

**Contract**:
- `POST` body (form-encoded): `provider in {'anthropic','openai'}`, `api_key string` (1..256 chars). Validation by hand-rolled `validateApiKeyInput()` in a new `src/lib/validation.ts` (returns `{ok, value} | {ok:false, error}`).
- On valid input: encrypt the plaintext via `encryptApiKey(plaintext, user.id)`, then `update user_settings set api_keys = jsonb_set(api_keys, '{<provider>}', <blob>::jsonb, true) where user_id = ...` (or fetch-then-merge in JS — simpler if jsonb_set is awkward through supabase-js).
- On invalid input or DB error: redirect to `/settings?error=<urlencoded message>`. Error message NEVER includes the api_key value.
- On success: redirect to `/settings?ok=1`.
- `DELETE` body: `provider in {'anthropic','openai'}`. Removes the provider key from the jsonb (`jsonb - '<provider>'`). Same redirect pattern.
- Catches `Anthropic.APIError`/`OpenAI.APIError`/generic errors and scrubs to `{status?, code?, message: 'save_failed' | 'remove_failed'}` before logging; error redirects use a generic user-facing message.

#### 4. Default-model save route

**File**: `src/pages/api/settings/default-model.ts`

**Intent**: Server endpoint that updates `user_settings.default_model` to one of the configured `ai_models.id`. Auth-checked.

**Contract**:
- `POST` body: `model_id string` matching an enabled row in `ai_models`. Validation is "exists in registry" check via a `select id from ai_models where id = $1 and enabled = true` round-trip.
- On valid input: `update user_settings set default_model = $1 where user_id = ...`. Redirect to `/settings?ok=1`.
- On invalid input: redirect with `?error=invalid_model`.
- Empty `model_id` → set `default_model = null` (user cleared the choice).

#### 5. Validation helper

**File**: `src/lib/validation.ts`

**Intent**: Shared hand-rolled validators per CLAUDE.md "propose rather than assume zod". Tiny, with explicit return shapes.

**Contract**: Named exports `validateApiKeyInput(provider, key): {ok:true, value} | {ok:false, error: string}` (provider in fixed set; key length 1..256; no leading/trailing whitespace per `key.trim() === key`); `validateRunInput({provider, model_id, prompt, context?, prompt_id?, ...}): ...`. The signatures are designed for Phase 4's run endpoint to reuse.

#### 6. Middleware update

**File**: `src/middleware.ts`

**Intent**: Add `/settings` to the protected-routes list so unauthenticated traffic redirects to signin.

**Contract**: Append `'/settings'` to whatever PROTECTED_ROUTES constant the middleware already defines.

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build` — type-checks the new island, the routes, and the middleware change
- The new shadcn/ui components are committed (input, card, label, select)

#### Manual Verification

- Sign up a fresh user, navigate to `/settings`, see two empty cards (Anthropic, OpenAI) and a default-model selector populated from `ai_models`
- Paste an Anthropic key and submit; page reload shows "Anthropic key configured" with Replace and Remove buttons
- In Supabase Studio, the user's `user_settings.api_keys` jsonb has shape `{"anthropic": {"v":1, "alg":"aes-256-gcm", "iv":"...", "ct":"..."}}` — no plaintext anywhere
- Click Remove → row updates to `{}` (the OpenAI section can never have leaked anything either)
- Save an OpenAI key — same encryption shape under `"openai"`; the Anthropic blob stays unchanged
- Save the same plaintext key for two different users (sign up a second account) — confirm the ciphertexts differ (HKDF-per-user diversification visible in the data)
- Pick a default model from the dropdown, save; reload shows the model still selected; `user_settings.default_model` matches the row id in Studio
- Try `POST /api/settings/api-keys` with `provider=garbage` via curl → 302 to `/settings?error=...` with no key in the redirect url
- Visit `/settings` while signed out → redirect to `/auth/signin`

**Implementation Note**: After Phase 3's automated verification passes, pause for manual confirmation before starting Phase 4.

---

## Phase 4: AI provider client + streaming `POST /api/ai/run` endpoint

### Overview

The provider-facing AI client modules, the public `runAiAnalysis()` factory, and the SSE-streaming run endpoint that consumes it, persists the immutable analysis row on completion, and scrubs every error.

### Changes Required

#### 1. Install AI provider SDKs

**File**: `package.json`

**Intent**: Add `@anthropic-ai/sdk@^0.100.1` and `openai@^6.39.1` to dependencies. Both are Web-Standards-only and Workers-supported per their README.

**Contract**: Two new `dependencies` entries. `npm install` rewrites `package-lock.json`. CI's `npm run build` will catch any version-mismatch.

#### 2. Anthropic streaming client

**File**: `src/lib/services/ai/anthropic.ts`

**Intent**: Per-provider streaming wrapper that yields a uniform `StreamEvent` shape regardless of upstream SDK quirks. Uses `messages.stream()` so we get both AsyncIterable deltas and `finalMessage()` for the post-stream summary.

**Contract**:
- Default export `streamAnthropic(opts: { apiKey: string, model: string, prompt: string, context?: string }): AsyncGenerator<StreamEvent>`.
- Builds `Anthropic` client with `{apiKey}` only; never logs `opts`.
- Constructs the messages array: when `context` is present, sends a single user message whose body is `<context>\n\n<prompt>` — F-02's pass-through contract is "we don't modify prompt bodies"; concatenation of two strings is the call-site composition rule.
- Uses `client.messages.stream({ model, max_tokens: 4096, messages, tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }] })`. The web_search tool is enabled so FR-032 sources can flow back; v1 caps `max_uses` at 5 to bound provider cost.
- Iterates the stream; for `content_block_delta` of type `text_delta`, yields `{kind:'text', delta: <text>}`. Other event types are ignored on the streaming path.
- After the stream ends, calls `await stream.finalMessage()`, extracts `usage.input_tokens` / `usage.output_tokens`, harvests every `text` block's `citations` into the storage envelope `{provider:'anthropic', items: [...]}`, joins all `text` block content into the final output string, and yields one final `{kind:'done', output, sources, usage:{input_tokens, output_tokens, cost_usd: undefined}, model: final.model, provider:'anthropic'}`.

#### 3. OpenAI streaming client

**File**: `src/lib/services/ai/openai.ts`

**Intent**: Per-provider streaming wrapper, parallel to the Anthropic module. Uses the Responses API.

**Contract**:
- Default export `streamOpenAI(opts: { apiKey: string, model: string, prompt: string, context?: string }): AsyncGenerator<StreamEvent>`.
- Builds `OpenAI` client with `{apiKey}`; never logs `opts`.
- Concatenates `context` and `prompt` the same way Anthropic does.
- Calls `client.responses.create({ model, input: <combined>, tools: [{type: 'web_search'}], stream: true })`.
- Iterates the stream; for `response.output_text.delta` events yields `{kind:'text', delta: event.delta}`; for `response.output_text.annotation.added` events with `annotation.type === 'url_citation'`, accumulates the annotation into a local `sources` array (envelope shape `{provider:'openai', items: [...]}`); for `response.completed`, captures `event.response.usage`.
- Also accumulates the full output string by joining every yielded `delta`.
- After the stream ends, yields one final `{kind:'done', output, sources, usage:{input_tokens, output_tokens, cost_usd: undefined}, model, provider:'openai'}`.

#### 4. AI client facade

**File**: `src/lib/services/ai/index.ts`

**Intent**: The public `runAiAnalysis()` entrypoint. Dispatches by provider, uniformizes the StreamEvent shape, and is the only thing the route imports.

**Contract**:
- Named export type `StreamEvent = | { kind: 'text', delta: string } | { kind: 'done', output: string, sources: StoredSources, usage: { input_tokens: number | null, output_tokens: number | null, cost_usd: number | null }, model: string, provider: 'anthropic' | 'openai' }`.
- Named export type `StoredSources = | { provider: 'anthropic', items: AnthropicCitation[] } | { provider: 'openai', items: OpenAIUrlCitation[] }`. Citation interfaces inlined per the discriminated-union shape from research.
- Named export `runAiAnalysis(opts: RunAiAnalysisInput): AsyncGenerator<StreamEvent>` — an async generator that delegates to `streamAnthropic` or `streamOpenAI` based on `opts.provider`. Hands back exactly the per-provider stream's events without re-wrapping (the per-provider modules already produce the uniform shape).
- Named export `RunAiAnalysisInput = { provider: 'anthropic' | 'openai', model: string, prompt: string, context?: string, apiKey: string }`.
- The facade does NOT touch Supabase, NOT touch encryption — pure passthrough.

#### 5. Shared types update

**File**: `src/types.ts`

**Intent**: Re-export `StreamEvent` and `StoredSources` so the route, future S-01 client, and any future renderer all share one canonical shape.

**Contract**: Add two `export type` re-exports from `@/lib/services/ai`.

#### 6. Streaming run endpoint

**File**: `src/pages/api/ai/run.ts`

**Intent**: The route that S-01 (and curl-driven smoke) calls. Decrypts the user's API key, calls `runAiAnalysis`, pipes deltas to the browser as SSE, and on stream completion INSERTs a single immutable `analyses` row.

**Contract**:
- `POST` body (JSON): `{ provider: 'anthropic' | 'openai', model_id: string, prompt_id?: string, prompt_body: string, prompt_name: string, prompt_description?: string, input: string, extra_context?: string, analysis_type: 'other' | 'company', subject?: string, parent_analysis_id?: string, company_id?: string, title: string }`. Note: F-02 receives the prompt-snapshot fields from the caller (S-01 will read them from the chosen `prompts` row before invoking) — F-02 doesn't reach back into `prompts` itself, keeping the route stateless w.r.t. prompt versioning.
- Auth: 401 if `context.locals.user` is null. RLS makes the persistence safe regardless, but a missing user means no `user_settings` to decrypt and no `user_id` to attribute the insert to.
- Validates the body via `validateRunInput()` (Phase 3); on failure, returns a single SSE `event: error` frame with `{message: 'invalid_input', detail: <validation message>}` and closes.
- Loads `user_settings.api_keys` for the user via the SSR client. If the requested provider isn't configured, returns SSE `event: error` with `{message: 'api_key_not_configured', provider}`.
- Decrypts the matching ciphertext envelope via `decryptApiKey`. On `decrypt_failed`, returns SSE error `{message: 'api_key_corrupted'}`. The plaintext lives in a single local variable for the lifetime of one request.
- Validates `model_id` against `ai_models` (selectable + provider-matches `body.provider`). On mismatch, SSE error `{message: 'invalid_model'}`.
- Returns a `Response` with `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. The body is a `ReadableStream` whose controller iterates `runAiAnalysis(...)` and enqueues one SSE frame per `StreamEvent`.
- For each `{kind:'text', delta}` yields `event: delta\ndata: <json-stringified delta>\n\n`.
- On `{kind:'done', ...}`: builds the `AnalysisInsert` row (`user_id` = current user, `analysis_type`, `parent_analysis_id`, `company_id`, `title`, `prompt_id`, `prompt_*_snapshot`, `input`, `extra_context`, `subject`, `model`, `provider`, `output`, `sources`, `input_tokens`, `output_tokens`, `cost_usd: null`), INSERTs it via the SSR client, returns the new id. Then enqueues a final `event: done\ndata: <json>\n\n` frame containing `{analysis_id, sources, usage, model, provider}`. Then closes the stream.
- On any thrown error from the stream iterator: catch, scrub via `toSafeError()`, enqueue `event: error\ndata: <safe payload>\n\n`, close. The route does NOT INSERT a partial row on error.
- `toSafeError()` (private helper inside the route file): maps `Anthropic.APIError` and `OpenAI.APIError` instances to `{status, code, message: <generic>}`. Never includes `err.message`'s upstream payload, never `err.cause`, never the request body.
- The route never `console.error`'s the raw error — it logs only the scrubbed payload via `console.error('ai_run_failed', safe)`.

#### 7. Error scrubbing helper

**File**: `src/lib/services/ai/errors.ts`

**Intent**: One canonical error scrubber so the same logic is reusable from any future caller (S-01's UI, S-02 continue-analysis, S-06 watchlist-injected runs).

**Contract**: `toSafeAiError(err: unknown): { status: number | null, code: string | null, message: string }`. Recognizes `Anthropic.APIError`, `OpenAI.APIError`, and falls through to `{status: null, code: null, message: 'unexpected_error'}`. Never reads `err.cause`, never accesses `err.config` / `err.request` / `err.response.config` (those carry headers and bodies). Tested manually by feeding it a synthetic `new Anthropic.AuthenticationError(...)` and confirming the output shape.

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build` — confirms both SDK type imports work under workerd build
- Bundle size budget: `npx wrangler deploy --dry-run --outdir dist-dryrun` reports a worker bundle under 2.5 MB compressed (early-warning headroom under the 3 MB ceiling)
- The new dependencies are pinned in `package.json` and `package-lock.json` reflects the install

#### Manual Verification

- With both API keys saved (Phase 3) and `npm run dev` running, a curl to `POST /api/ai/run` with a real Anthropic prompt streams `event: delta\ndata: ...` frames in real time, ends with one `event: done` frame containing the new `analysis_id`
- The same curl with `provider:'openai'` streams equivalent deltas and a `done` frame
- Open the new analysis row in Supabase Studio: `output` is the full output, `sources` is the envelope shape `{provider:..., items:[...]}` with verbatim provider citations, `input_tokens` and `output_tokens` are populated, `provider` and `model` match the request, `parent_analysis_id` is null (no continue), `company_id` is null (analysis_type='other')
- Curl with an invalid model_id returns one `event: error` frame and writes no row
- Curl with provider=anthropic but the Anthropic key removed in Settings → `event: error\ndata: {"message":"api_key_not_configured","provider":"anthropic"}`
- Curl with a deliberately corrupted ciphertext (manually edit the `ct` field in Studio) → `event: error\ndata: {"message":"api_key_corrupted"}`
- Inspect server logs (`wrangler tail` or terminal): no key prefix (`sk-ant-`, `sk-`) appears anywhere; no prompt body appears in any error log
- Curl with the user signed out → 401, no row written
- Two independent runs in parallel for the same user complete with two distinct `analysis_id`s; no row corruption

**Implementation Note**: After Phase 4's automated verification passes, pause for manual confirmation that all the manual probes succeeded before considering F-02 complete.

---

## Testing Strategy

### Unit Tests

No unit-test framework is configured. CLAUDE.md: "No test framework is configured. There is no `npm test` script — do not invent one." Adding one as a side-effect of F-02 is out of scope.

### Integration / Smoke Tests

- `scripts/encrypt-roundtrip.mjs` (Phase 2) — proves encrypt/decrypt round-trip locally.
- Manual curl smokes against `npm run dev` (Phase 4) — prove the streaming + persistence + error-scrubbing path.

### Manual Testing Steps

1. Fresh checkout: `npx supabase start && npx supabase db reset` — verify migration applies, `ai_models` rows present.
2. `openssl rand -base64 32 >> .dev.vars` (prepended with `ENCRYPTION_KEY=`).
3. `node scripts/encrypt-roundtrip.mjs` — verify round-trip.
4. `npm run dev`, sign up two users, save distinct keys, confirm cross-user RLS isolation in Studio.
5. Run a curl against `/api/ai/run` with each provider; inspect persisted row.
6. Re-run with an invalid provider key; confirm error frame and no row.
7. `wrangler tail` (against a deployed preview, post-`wrangler deploy --env preview`): re-run a deliberate failure and confirm logs contain no plaintext key, no prompt body.

## Performance Considerations

- **Per-request crypto cost.** One HKDF derive + one AES-GCM encrypt or decrypt per request. Both are constant-time at v1 sizes (each API key ≤ 256 chars). Negligible against the dominant network call.
- **`ai_models` cache.** A 5-minute in-isolate cache on the registry read avoids one Supabase round-trip per Settings page load. Warm-cold-cold isolate behavior on Workers means the cache is per-isolate; this is fine — the table changes by hand, infrequently.
- **SSE pass-through.** Cloudflare's docs note that pure `ReadableStream` pass-through "is already optimal." We don't transform deltas server-side; they go straight from the SDK's stream to the browser's stream.
- **No CPU-time concern at v1 scale.** The Workers free-tier 10 ms CPU per request limit is irrelevant during `fetch` awaits (CPU time decouples from wall-clock). The only in-Worker CPU work is AES-GCM + JSON.stringify of the final row insert payload — bounded.
- **Bundle ceiling.** `wrangler deploy --dry-run` after Phase 4 should report a compressed worker bundle well under 2.5 MB; combined SDKs are ~70 kB minified+gzip.

## Migration Notes

- Forward-only migration; no down-migration. Aligned with F-01's posture.
- `db reset` is the canonical replay; the back-fill is `ON CONFLICT DO NOTHING`-idempotent.
- The `ai_models` seed is inside the migration. Adding a model later is a one-shot `INSERT INTO ai_models ...` via Studio or a `supabase/snippets/add-<model-id>.sql` script — neither requires a migration nor a deploy.
- **Key rotation runbook (placeholder; not exercised in v1):** generate a new master key, set `ENCRYPTION_KEY_V2`, deploy a code change that bumps `v` to `2` for new writes and keeps decrypting `v:1` blobs with the old key, then run a one-shot `scripts/rotate-keys.mjs` that pages through `user_settings`, decrypts under v1, re-encrypts under v2, writes back. Then drop `ENCRYPTION_KEY_V1` from secrets. The version field makes this routine; no version field would make it impossible.

## References

- Roadmap: `context/foundation/roadmap.md` § F-02
- Roadmap risk register quote (encryption irreversibility): `context/foundation/roadmap.md` lines 92–93
- F-01 plan: `context/changes/data-schema-and-rls/plan.md`
- F-01 follow-up F3: `context/changes/data-schema-and-rls/follow-ups/review-fixes.md`
- F-01 migration: `supabase/migrations/20260529120000_data_schema_and_rls.sql`
- PRD: `context/foundation/prd.md` (FR-028, FR-029, FR-030, FR-032, NFR streaming + isolation + log-hygiene)
- Project conventions: `CLAUDE.md` (path aliases, Supabase migration naming, RLS convention, services/lib location, no-test-framework rule, "propose validation library")
- Existing Supabase client: `src/lib/supabase.ts:1-25`
- Existing middleware + protected routes: `src/middleware.ts`
- Existing env shape: `astro.config.mjs:17-23`
- Existing pre-commit secret check: `scripts/check-wrangler-secrets.mjs`
- Anthropic SDK: `@anthropic-ai/sdk@^0.100.1`
- OpenAI SDK: `openai@^6.39.1`
- Anthropic web search docs: `platform.claude.com/docs/en/docs/agents-and-tools/tool-use/web-search-tool`
- OpenAI web search guide: `developers.openai.com/api/docs/guides/tools-web-search`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema — `ai_models` registry, auto-create trigger, type regeneration

#### Automated

- [x] 1.1 Migration applies cleanly from empty: `npx supabase db reset` exits 0
- [x] 1.2 After reset, `select count(*) from public.ai_models` returns the seeded roster count (4 rows)
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Build passes: `npm run build` (also runs `astro check` against the new types)

#### Manual

- [x] 1.5 In Supabase Studio, the `ai_models` table appears with the seeded rows; the partial unique index `(provider) WHERE is_default = true` is visible
- [x] 1.6 Signing up a new user via `/auth/signup` produces exactly one matching row in `user_settings`
- [x] 1.7 A second signup is also handled correctly (no PK conflict surfaced anywhere)
- [x] 1.8 Hovering over a `.from('ai_models').select('*')` call shows the row type as `AiModel`, not `any`

### Phase 2: Encryption module + ENCRYPTION_KEY plumbing

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Build passes: `npm run build`
- [ ] 2.3 Roundtrip script succeeds: `node scripts/encrypt-roundtrip.mjs` exits 0
- [ ] 2.4 Pre-commit secret check still passes; flags a literal `ENCRYPTION_KEY` in `wrangler.jsonc`

#### Manual

- [ ] 2.5 `.dev.vars` contains `ENCRYPTION_KEY=<base64>` (32 random bytes, base64-encoded)
- [ ] 2.6 Hovering over a call site of `encryptApiKey` shows the typed `Promise<EncryptedBlob>` return
- [ ] 2.7 Different `ENCRYPTION_KEY` values produce different ciphertext for the same plaintext
- [ ] 2.8 Same key but different `userId`s produce different ciphertext for the same plaintext

### Phase 3: Settings page + API-key save / remove / default-model endpoints

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Build passes: `npm run build`
- [ ] 3.3 The new shadcn/ui components are committed (input, card, label, select)

#### Manual

- [ ] 3.4 Sign up, navigate to `/settings`, see two empty cards and a default-model selector populated from `ai_models`
- [ ] 3.5 Paste an Anthropic key and submit; reload shows "Anthropic key configured" with Replace and Remove buttons
- [ ] 3.6 In Supabase Studio, the user's `user_settings.api_keys` is the encrypted envelope; no plaintext anywhere
- [ ] 3.7 Click Remove; row updates to `{}`
- [ ] 3.8 Save an OpenAI key; the Anthropic blob stays unchanged
- [ ] 3.9 Save the same plaintext key for two different users; ciphertexts differ (HKDF-per-user diversification)
- [ ] 3.10 Pick a default model, save, reload — selection persists; `default_model` matches the row id
- [ ] 3.11 `POST /api/settings/api-keys` with `provider=garbage` redirects with no key in the URL
- [ ] 3.12 Visiting `/settings` while signed out redirects to `/auth/signin`

### Phase 4: AI provider client + streaming `POST /api/ai/run` endpoint

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Build passes: `npm run build`
- [ ] 4.3 Bundle size budget: `wrangler deploy --dry-run --outdir dist-dryrun` reports compressed bundle under 2.5 MB
- [ ] 4.4 New SDK dependencies pinned in `package.json` + `package-lock.json`

#### Manual

- [ ] 4.5 Curl `POST /api/ai/run` with provider=anthropic streams `event: delta` frames and ends with one `event: done` frame
- [ ] 4.6 Same curl with provider=openai streams equivalent deltas and a `done` frame
- [ ] 4.7 New analysis row in Studio: `output`, `sources` envelope, `input_tokens`/`output_tokens` populated; `provider`/`model` match
- [ ] 4.8 Curl with an invalid model_id returns one `event: error` frame, writes no row
- [ ] 4.9 Curl with provider=anthropic but Anthropic key removed → `event: error` payload `{message:"api_key_not_configured",provider:"anthropic"}`
- [ ] 4.10 Corrupted ciphertext (edit `ct` in Studio) → `event: error` payload `{message:"api_key_corrupted"}`
- [ ] 4.11 Inspect logs: no `sk-ant-`/`sk-` prefix appears anywhere; no prompt body in error logs
- [ ] 4.12 Curl while signed out → 401; no row written
- [ ] 4.13 Two parallel runs for the same user complete with two distinct `analysis_id`s; no corruption

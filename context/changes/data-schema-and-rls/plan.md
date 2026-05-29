# Data Schema and RLS — Implementation Plan

## Overview

Stand up the multi-tenant Postgres schema for Investment Assistant: four tables (`prompts`, `analyses`, `watched_companies`, `user_settings`), per-operation per-role RLS on every table, structural enforcement of FR-020 analysis immutability, and the indexes downstream slices need. Generate TypeScript types and wire them through `src/lib/supabase.ts` and `src/types.ts` so every later slice gets compiler-level isolation guarantees for free.

## Current State Analysis

- **Migrations directory is empty.** `supabase/` exists with `config.toml` and `.gitignore` but no `migrations/` directory on disk. This is a true greenfield slice — no data to migrate, no schema to alter.
- **Supabase SSR client is wired** (`src/lib/supabase.ts:5-24`) and returns `null` if env is absent. All callers must already handle null. The client is currently untyped (`createServerClient<…>` has no `Database` generic).
- **Auth identity is `auth.users.id`** via Supabase Auth (`src/middleware.ts` reads `context.locals.user`, typed in `src/env.d.ts:1-5`). Every application table FKs against this.
- **No `src/types.ts` exists yet.** CLAUDE.md prescribes shared entity/DTO types in `src/types.ts`; this slice is the first to need it.
- **PRD invariants this schema must enforce structurally** (not at the route layer):
  - **Per-user isolation** across every table (Access Control §Isolation, NFRs §isolation, guardrail).
  - **Analysis immutability** (FR-020) — no UPDATE on saved analyses.
  - **Snapshot-on-save** (Business Logic #1) — prompt text captured at run time, surviving prompt edits/deletes (FR-008/FR-009).
  - **Source-verbatim** (FR-032, guardrail) — provider-returned source payloads stored unchanged.
  - **Continue-analysis chain** (FR-018, Business Logic #2) — `analyses.parent_analysis_id` self-reference.
  - **Dual-link** (FR-026) — analyses simultaneously linked to a `watched_company` and a parent analysis.
  - **Preserve-on-company-delete** (FR-027) — deleting a watched company keeps its analyses.

### Key Discoveries

- `src/lib/supabase.ts:9` calls `createServerClient` without a `Database` generic — Phase 2 introduces it.
- `auth.uid()` is the canonical RLS predicate against `auth.users(id)`. CLAUDE.md confirms the convention: "Always enable RLS on new tables with per-operation, per-role policies."
- `wrangler.jsonc` ships with `nodejs_compat`; nothing in this slice depends on Node-only APIs, so no adapter risk.
- Ticker is ambiguous without an exchange (`BMW` on XETRA vs USA's pink-sheet `BMWYY`; `RIO` on LSE vs ASX). Schema must couple them.
- FR-033 cost/token columns are `nice-to-have`, but the guardrail "if the provider returns it, show it" means we should capture what we get from S-01 onward — adding nullable columns now avoids a later migration on an immutable table.

## Desired End State

After this plan ships:

- `npx supabase db reset` applies cleanly from empty. The four tables exist with all constraints, indexes, RLS policies, and the immutability trigger.
- Connecting as `authenticated` role with `auth.uid() = X` returns/modifies only rows where `user_id = X`. Connecting as a different user is invisible to user X.
- Any UPDATE on `analyses` (any column, any owner, any role short of explicit superuser bypass) raises `cannot_modify_immutable_analysis`.
- `npm run lint` and `npm run build` pass with the typed `Database` generic flowing through `createClient`.
- A repeatable RLS smoke script (`supabase/tests/rls_smoke.sql`) demonstrates user A is invisible to user B on every table.

### Verification

- Migration apply: `npx supabase db reset` (idempotent, exits 0).
- Smoke: `psql "$SUPABASE_DB_URL" -f supabase/tests/rls_smoke.sql` returns `OK` for every assertion.
- Types: `npm run build` (Astro check) passes with the `Database` type live.
- Manual: open Supabase Studio at `http://127.0.0.1:54323`, sign up two users via the existing `/auth/signup`, and confirm via the SQL editor that RLS-applied queries return only the authenticated user's rows.

## What We're NOT Doing

- **No encryption mechanism for `user_settings.api_keys`.** F-02 picks pgsodium / Worker-derived AES / other. F-01 only stipulates the column shape (`jsonb`, opaque ciphertext per provider). The roadmap explicitly assigns the encryption choice to F-02.
- **No AI provider model registry.** F-02 / S-01 own model variant lists (file vs DB vs env-driven). `user_settings.default_model` is just `text` here.
- **No prompt versioning / history table.** Snapshot is denormalized onto `analyses` rows; prompt edits do not retro-affect saved analyses by construction. PRD never asks the user to see prompt history.
- **No company-name fuzzy matching, no auto-promotion from analysis text to watchlist row.** S-07 is a separate slice.
- **No realtime subscriptions, no broadcast channels.** PRD non-goal; v1 is pull-only.
- **No password-reset auth changes.** That is S-09's job and is independent.
- **No data-seed for development.** Empty database after `db reset` is the desired state.
- **No application-layer business logic, no API routes, no UI changes.** Foundation only.

## Implementation Approach

One forward-only migration creates the schema, constraints, indexes, RLS policies, and immutability trigger together. Order inside the migration matters: extensions → tables (in FK order: `prompts`, `watched_companies`, `user_settings`, `analyses`) → triggers → policies → indexes. Then a separate code change generates and wires the TypeScript types. Then a separate verification artifact lives outside `migrations/` (so it isn't replayed on `db reset`).

Greenfield + RLS-first means we never have to write per-route auth filters in any downstream slice. Every `select * from prompts` from a Supabase SSR client is automatically scoped to the signed-in user.

## Critical Implementation Details

- **RLS policies must use `(SELECT auth.uid())` rather than `auth.uid()` directly.** Postgres caches the subquery once per statement; the bare-call form re-invokes per row and turns a constant-time policy into an O(n) one. This is a Supabase performance lesson — relevant the moment a user has hundreds of analyses.
- **The immutability trigger must be `BEFORE UPDATE` and raise** rather than `AFTER UPDATE` and rollback — the latter still runs the update plan, the former rejects it before any row touches.
- **`user_settings` PK must equal `user_id`.** This makes the row 1:1 with `auth.users` and the RLS predicate trivial (`auth.uid() = user_id`). Don't add a separate `id uuid` surrogate.
- **`analyses.parent_analysis_id` `ON DELETE SET NULL`** — parent deletion (which the user can do) must not cascade-delete every descendant in the chain. The chain becomes "orphaned at the root" but every child remains readable.

---

## Phase 1: Schema, constraints, RLS, immutability trigger

### Overview

Single forward-only migration creating extensions, the four tables with all constraints, the immutability trigger on `analyses`, per-operation per-role RLS policies on every table, and read-path indexes for downstream slices.

### Changes Required

#### 1. Initial migration file

**File**: `supabase/migrations/20260529120000_data_schema_and_rls.sql` (timestamp adjusted to actual run time, kebab-prefixed by `YYYYMMDDHHmmss` per CLAUDE.md convention).

**Intent**: Create the multi-tenant data layer in one atomic migration. RLS-first: every CREATE TABLE is followed by `ENABLE ROW LEVEL SECURITY` and four per-operation per-role policies before the next statement. Constraints model PRD invariants structurally (immutability trigger, snapshot columns, dual-link FK, preserve-on-delete).

**Contract**:

- **Extensions**: `pgcrypto` (for `gen_random_uuid()`).
- **`prompts`**: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200)`, `description text`, `body text NOT NULL CHECK (length(body) BETWEEN 1 AND 50000)`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`. Trigger to bump `updated_at` on UPDATE.
- **`watched_companies`**: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200)`, `ticker text`, `exchange text`, `industry text`, `note text`, `created_at`, `updated_at`. `CHECK ((ticker IS NULL) = (exchange IS NULL))` so ticker and exchange travel together. Partial unique index `(user_id, exchange, ticker) WHERE ticker IS NOT NULL`. Trigger to bump `updated_at`.
- **`user_settings`**: `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `api_keys jsonb NOT NULL DEFAULT '{}'::jsonb`, `default_model text`, `created_at`, `updated_at`. F-02 will define the `api_keys` ciphertext shape; F-01 commits only that the column exists, is JSONB, defaults to empty object, and is RLS-isolated.
- **`analyses`**: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `parent_analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL`, `company_id uuid REFERENCES watched_companies(id) ON DELETE SET NULL`, `analysis_type text NOT NULL CHECK (analysis_type IN ('other','company'))`, `title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300)`, `prompt_id uuid REFERENCES prompts(id) ON DELETE SET NULL`, `prompt_name_snapshot text NOT NULL`, `prompt_body_snapshot text NOT NULL`, `prompt_description_snapshot text`, `input text NOT NULL`, `extra_context text`, `subject text` (free-text topic for `other`, free-text ticker/name for unwatched-company per FR-014), `model text NOT NULL`, `provider text NOT NULL`, `output text NOT NULL`, `sources jsonb NOT NULL DEFAULT '[]'::jsonb`, `input_tokens integer`, `output_tokens integer`, `cost_usd numeric(10,6)`, `created_at timestamptz NOT NULL DEFAULT now()`. Note: no `updated_at` — the row is immutable. CHECK consistency between `analysis_type` and the company linkage: `CHECK (analysis_type = 'company' OR (analysis_type = 'other' AND company_id IS NULL))`.
- **Immutability trigger**: a `BEFORE UPDATE ON analyses` trigger that always raises `cannot_modify_immutable_analysis (FR-020)`. No allow-list for v1.
- **`updated_at` triggers**: `BEFORE UPDATE` on `prompts`, `watched_companies`, `user_settings` setting `NEW.updated_at = now()`.
- **RLS policies** (per table, four policies each, role `authenticated`):
  - `SELECT`: `USING ((SELECT auth.uid()) = user_id)`
  - `INSERT`: `WITH CHECK ((SELECT auth.uid()) = user_id)`
  - `UPDATE`: `USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id)`. On `analyses`, the trigger raises before the policy matters — both layers reject.
  - `DELETE`: `USING ((SELECT auth.uid()) = user_id)`
  - Also revoke any `anon` access on every application table.
- **Indexes** (in addition to PK and the unique partial index already named):
  - `analyses (user_id, created_at desc)` — S-03 list, S-08 dashboard recent.
  - `analyses (user_id, analysis_type, created_at desc)` — S-03 type filter.
  - `analyses (user_id, company_id, created_at desc) WHERE company_id IS NOT NULL` — S-06 company-bound view, S-03 company filter.
  - `analyses (user_id, parent_analysis_id) WHERE parent_analysis_id IS NOT NULL` — S-02 chain traversal.
  - `prompts (user_id, name)` — S-04 list ordering.
  - `watched_companies (user_id, name)` — S-05 list ordering.

The migration is one file because it's atomic on `db reset` and there's no partial state worth landing separately. The PRD's NFR §isolation guardrail is structurally satisfied the moment the migration commits.

### Success Criteria

#### Automated Verification

- Migration applies cleanly from empty: `npx supabase db reset` exits 0
- No SQL warnings about missing RLS: `psql -c "select tablename from pg_tables where schemaname='public' and rowsecurity=false"` returns 0 rows
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- In Supabase Studio (`http://127.0.0.1:54323`), the four tables appear with the expected columns
- Inserting a row as user A and querying as user B returns no rows (per table)
- Attempting `UPDATE analyses SET title = '…' WHERE id = …` from the SQL editor signed in as the row's owner raises the immutability error
- `INSERT INTO analyses (analysis_type, company_id, …) VALUES ('other', '…uuid…', …)` is rejected by the type/company CHECK
- A `watched_companies` row with `ticker = 'AAPL'` and `exchange = NULL` is rejected
- Two `watched_companies` rows with `(ticker='RIO', exchange='LSE')` and `(ticker='RIO', exchange='ASX')` for the same user are both accepted (different listings)

**Implementation Note**: After Phase 1's automated verification passes, pause for manual confirmation that the Supabase Studio inspections succeeded before starting Phase 2.

---

## Phase 2: Generated TypeScript types and typed Supabase client

### Overview

Generate the `Database` type from the live local schema, commit it, expose the entity row types via `src/types.ts` per CLAUDE.md, and tighten `createClient` so every Supabase call downstream is typed.

### Changes Required

#### 1. Generated types file

**File**: `src/db/database.types.ts`

**Intent**: Single source of truth for the Postgres schema as TypeScript. Generated, not hand-written; regenerated whenever a future migration changes the schema.

**Contract**: Output of `npx supabase gen types typescript --local > src/db/database.types.ts`. The file exports a `Database` type covering `public.prompts`, `public.analyses`, `public.watched_companies`, `public.user_settings`. No manual edits.

#### 2. Shared entity types

**File**: `src/types.ts` (new)

**Intent**: CLAUDE.md says "Shared types (entities, DTOs) live in `src/types.ts`". This is the first slice that has any. Re-export the row/insert/update types of each entity so callers don't reach into `database.types.ts` directly.

**Contract**: Named exports `Prompt`, `PromptInsert`, `PromptUpdate`, `Analysis`, `AnalysisInsert`, `WatchedCompany`, `WatchedCompanyInsert`, `WatchedCompanyUpdate`, `UserSettings`, `UserSettingsInsert`, `UserSettingsUpdate`. No `AnalysisUpdate` type is exported — the table is immutable, so exposing an Update type invites mistakes. Each is `Database['public']['Tables'][…]['Row' | 'Insert' | 'Update']`.

#### 3. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Add the `Database` generic so `.from('analyses').select('*')` returns `Analysis[]` rather than `any`. Preserve the null-on-missing-env contract that callers already handle.

**Contract**: `createServerClient<Database>(…)` instead of `createServerClient(…)`. Return type changes from `SupabaseClient | null` to `SupabaseClient<Database> | null`. No behavior change.

### Success Criteria

#### Automated Verification

- Generated file exists: `test -f src/db/database.types.ts`
- Lint passes: `npm run lint`
- Build passes: `npm run build` (this also runs `astro check`)
- Type-check finds no `any` regressions in `src/lib/supabase.ts`

#### Manual Verification

- In an editor, hover over a `.from('prompts').select('*').single()` call and confirm the row type is `Prompt`, not `any`
- Confirm `src/db/database.types.ts` is committed (not gitignored)

**Implementation Note**: After Phase 2's automated verification passes, pause for manual confirmation before starting Phase 3.

---

## Phase 3: RLS verification harness

### Overview

A repeatable, runnable SQL script that creates two synthetic users, inserts data as each, and asserts cross-user invisibility on every table plus immutability rejection on `analyses`. Lives outside `migrations/` so `db reset` does not replay it.

### Changes Required

#### 1. RLS smoke script

**File**: `supabase/tests/rls_smoke.sql`

**Intent**: Documentation-as-test. Anyone can run this against a fresh local stack and see RLS hold. Not a CI gate (CI doesn't have a Postgres in the loop yet) — a runbook artifact and a sanity net for future schema changes.

**Contract**: A `psql -f`-runnable script that:

1. Creates two test users in `auth.users` via `auth.admin_create_user` or direct insert (test-only).
2. As user A: inserts one row into each of `prompts`, `watched_companies`, `user_settings`, `analyses`.
3. As user B: asserts SELECT returns zero rows from each table for user A's data; UPDATE returns zero rows affected; DELETE returns zero rows affected.
4. As user A: asserts UPDATE on `analyses` raises `cannot_modify_immutable_analysis`.
5. Tears down the two users at the end.

The script uses `SET LOCAL role authenticated` and `SET LOCAL request.jwt.claim.sub = '<user-id>'` to simulate the SSR client's RLS context. Each assertion is a `DO $$ … RAISE EXCEPTION 'FAIL: …' $$` block on contradiction; success is silent.

#### 2. Wire it into the runbook

**File**: `context/deployment/runbook.md`

**Intent**: Add a one-liner under the local-dev section pointing operators at the smoke script. The runbook already covers Wrangler / Supabase basics; this slots into the same audience.

**Contract**: One additional bullet referencing `psql "$SUPABASE_DB_URL" -f supabase/tests/rls_smoke.sql` and what success looks like.

### Success Criteria

#### Automated Verification

- Script is valid SQL: `psql --set ON_ERROR_STOP=on "$SUPABASE_DB_URL" -f supabase/tests/rls_smoke.sql` exits 0
- Migration still applies from empty after the script runs and tears down: `npx supabase db reset` exits 0
- Lint passes: `npm run lint`

#### Manual Verification

- Run the script against a freshly reset local stack — output is silent (every `DO` block succeeded)
- Comment out a single RLS policy in the migration, re-run reset + script — script raises a `FAIL:` exception (proves the assertions actually catch a regression)

**Implementation Note**: After Phase 3's automated verification passes, pause for manual confirmation before considering F-01 complete.

---

## Testing Strategy

### Unit Tests

No unit-test framework is configured (CLAUDE.md: "No test framework is configured. There is no `npm test` script — do not invent one"). Validation of this slice is via the migration's own constraints, the immutability trigger, RLS, and the smoke script.

### Integration / Smoke Tests

- `supabase/tests/rls_smoke.sql` is the integration surface (see Phase 3).

### Manual Testing Steps

1. Fresh checkout: `npx supabase start && npx supabase db reset` — verify migration applies.
2. Open Supabase Studio, sign up two users via `/auth/signup` (the SSR auth flow already works).
3. As user A in the SQL editor: `INSERT INTO prompts (user_id, name, body) VALUES ((SELECT auth.uid()), 'demo', 'do x')`.
4. As user B: `SELECT * FROM prompts` — returns zero rows.
5. As user A: `UPDATE analyses SET title = 'oops' WHERE …` — raises immutability error.
6. As user A: `INSERT INTO watched_companies (user_id, name, ticker, exchange) VALUES ((SELECT auth.uid()), 'BMW AG', 'BMW', 'XETRA')` — accepted.
7. As user A: `INSERT INTO watched_companies (user_id, name, ticker) VALUES ((SELECT auth.uid()), 'Lone', 'LONE')` — rejected by `(ticker IS NULL) = (exchange IS NULL)`.

## Performance Considerations

- Per-table read indexes are tuned to the four downstream slices (S-02 chain, S-03 filter, S-06 company-bound, S-08 recent). No speculative indexes beyond those.
- `(SELECT auth.uid())` policy form is cached per statement — avoids the O(n) re-invocation footgun.
- No row-count concerns at v1 scale (PRD `target_scale: small`); the index plan is forward-looking, not load-bearing today.

## Migration Notes

Greenfield slice. Empty `supabase/migrations/` on disk. No data migration. No backfill. `npx supabase db reset` is the canonical replay. No down-migration is required for v1; if the schema needs to change before any user data exists, recreate the migration file.

## References

- Roadmap: `context/foundation/roadmap.md` § F-01
- PRD: `context/foundation/prd.md` (Access Control §Isolation, NFRs §isolation, FR-008/009/014/018/020/026/027/032)
- Tech-stack: `context/foundation/tech-stack.md`
- Infrastructure: `context/foundation/infrastructure.md`
- Project conventions: `CLAUDE.md` (path aliases, Supabase migration naming, RLS policy convention, shared types location)
- Existing client: `src/lib/supabase.ts:5-24`
- Auth identity wiring: `src/middleware.ts`, `src/env.d.ts:1-5`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, constraints, RLS, immutability trigger

#### Automated

- [x] 1.1 Migration applies cleanly from empty: `npx supabase db reset` exits 0 — 9b66c93
- [x] 1.2 No SQL warnings about missing RLS: `psql -c "select tablename from pg_tables where schemaname='public' and rowsecurity=false"` returns 0 rows — 9b66c93
- [x] 1.3 Lint passes: `npm run lint` — 9b66c93
- [x] 1.4 Build passes: `npm run build` — 9b66c93

#### Manual

- [x] 1.5 In Supabase Studio, the four tables appear with the expected columns
- [x] 1.6 Inserting a row as user A and querying as user B returns no rows (per table)
- [x] 1.7 Attempting UPDATE on `analyses` from the SQL editor signed in as the row's owner raises the immutability error
- [x] 1.8 Inserting an `analyses` row with `analysis_type='other'` and a non-null `company_id` is rejected by the CHECK
- [x] 1.9 A `watched_companies` row with ticker set and exchange null is rejected
- [x] 1.10 Two `watched_companies` rows with same ticker on different exchanges for the same user are both accepted

### Phase 2: Generated TypeScript types and typed Supabase client

#### Automated

- [x] 2.1 Generated file exists: `test -f src/db/database.types.ts` — 3483e2c
- [x] 2.2 Lint passes: `npm run lint` — 3483e2c
- [x] 2.3 Build passes: `npm run build` (also runs `astro check`) — 3483e2c
- [x] 2.4 Type-check finds no `any` regressions in `src/lib/supabase.ts` — 3483e2c

#### Manual

- [x] 2.5 Hovering over a `.from('prompts').select('*').single()` call shows row type `Prompt`, not `any`
- [x] 2.6 `src/db/database.types.ts` is committed (not gitignored)

### Phase 3: RLS verification harness

#### Automated

- [x] 3.1 Script is valid SQL: `psql --set ON_ERROR_STOP=on "$SUPABASE_DB_URL" -f supabase/tests/rls_smoke.sql` exits 0 — 7a9bcb8
- [x] 3.2 Migration still applies from empty after the script runs and tears down: `npx supabase db reset` exits 0 — 7a9bcb8
- [x] 3.3 Lint passes: `npm run lint` — 7a9bcb8

#### Manual

- [x] 3.4 Running the script against a freshly reset local stack produces silent success — 7a9bcb8
- [x] 3.5 Commenting out one RLS policy and re-running causes the script to raise a `FAIL:` exception — 7a9bcb8

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npx astro sync` — generate types for virtual modules (e.g., `astro:env/server`). Run this on a fresh checkout before `npm run lint`, otherwise type-checked rules fail. CI runs it before lint for the same reason.

No test framework is configured. There is no `npm test` script — do not invent one.

Pre-commit: husky + lint-staged — see the `lint-staged` block in @package.json for the exact globs and commands.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in `astro.config.mjs`). All pages and API routes are server-rendered by default — no `prerender` exports needed.

### Auth flow

- `src/lib/supabase.ts` — `createClient(requestHeaders, cookies)` returns a Supabase SSR client or **null** if env vars are absent. All callers must handle the null case.
- `src/middleware.ts` — resolves the current user on every request, attaches to `context.locals.user` (typed in `src/env.d.ts`). Add protected routes to `PROTECTED_ROUTES` to trigger redirect to `/auth/signin`.
- Auth API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts` — on error, redirect with `?error=<urlencoded-message>` query param.
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge). Never concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: export uppercase `GET`, `POST`, etc. No validation library is currently installed — if you add input validation, propose the library choice rather than assuming zod.
- **Supabase migrations**: `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with per-operation, per-role policies.
- **React hooks**: extract to `src/components/hooks/`. No Next.js directives (`"use client"` etc.).
- **Services/helpers**: `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs): `src/types.ts`.

### Environment

- Node.js — see @.nvmrc
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` — declared as `astro:env/server` secrets in `astro.config.mjs`. Copy `.env.example` → `.env` for Node, or `.dev.vars` for Cloudflare local dev (gitignored).
- Local Supabase: `npx supabase start` (requires Docker)
- Deploy: `npx wrangler deploy`

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint + build on every push/PR to master. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.

## Manual testing

If you want me to do any manual testing for AI analysis run, ask only for OpenAI models. Because I have only OpenAI API key and not Anthropic API key. So if you are giving me any command/curl example fpor some analysis, by default it should be OpenAI platform and `gpt-4o-mini` model.

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->

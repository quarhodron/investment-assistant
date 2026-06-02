---
project: "Investment Assistant"
version: 1
status: draft
created: 2026-05-23
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# Investment Assistant — Product Requirements Document

## Vision & Problem Statement

Retail amateur investors with day jobs and no financial-analyst training want to put money in long-term investments, but they don't know which sectors or companies to research now and lack the financial skill to analyze them unaided. Today they paste one-off prompts into general-purpose AI chat tools, receive an answer, lose it in chat history, and start over the next time. Past prompts, past analyses, and the companies that surfaced from them are effectively unreachable — there is no continuity between sessions and no way to compare analyses across companies or sectors.

The insight: the friction is not "I need a chat with an AI"; it is "I need a research workspace where my prompts, my analyses, and the companies I am watching are linked as a domain — investment research — and where the same analysis can be continued with a different prompt or a different model without starting from a blank page." Generic AI chat products provide containers for conversations but do not model the domain; they do not link an analysis to a watched company, do not chain "continue analysis" across prompts and models, and do not give the user a workspace they can build over months.

## User & Persona

**Primary persona — Retail amateur investor.**

- Has a day job; researches investments after hours.
- No formal financial-analyst training; cannot do fundamental analysis unaided.
- Goal: place money in long-term investments and build a personal research practice over time.
- Reaches for the product when looking for sectors or companies worth investing in _now_ and when revisiting earlier research to extend it.
- Multi-tenant from v1: every user has isolated prompts, analyses, watchlists, API keys, and model preferences.

(No secondary persona for v1.)

## Success Criteria

### Primary

- A user, starting from an empty account, can sign up, create at least one prompt, add an API key in Settings, run an analysis on a sector or company using a chosen prompt and model, and see a usable AI-generated result rendered on screen with any sources the model returned.
- A user can open a prior analysis and run a "continue analysis" against it, picking a different prompt and/or a different model than the original; the new analysis is saved as a child of the original and the chain is preserved.
- A user can add a company to their watchlist (manually, or from the result of an analysis) and run a saved prompt against that company without retyping the company's identifying details.

### Secondary

- A user can edit prompts; the new version applies on the next run, and prior analyses keep the prompt text they were originally run with (analyses are immutable — see guardrails).

### Guardrails

- A user never sees another user's prompts, analyses, watchlist, API keys, or settings — through any interface the product exposes.
- API keys, once saved, are never disclosed back to the user-facing product surface, never appear in logs, error messages, or analytics output, and cannot be recovered through any product interface.
- A failed analysis (provider error, rate limit, network timeout) does not corrupt or destroy the user's prompt, watchlist, or any prior analysis.
- The product never frames an AI result as an investment recommendation — every analysis view makes clear the result is research material, not advice.
- API cost or token usage of an analysis is visible to the user when the provider returns it, so the user knows roughly what an analysis cost.
- Analyses are immutable once saved. Editing or appending notes to a saved analysis is not possible; the only way to extend it is "continue analysis", which creates a new linked analysis.
- Source links returned by the model are preserved verbatim and shown to the user as the model returned them — not silently rewritten, filtered, or de-duplicated.

## User Stories

### US-01: User runs first analysis on a macro or sector topic

- **Given** a verified user with no prompts, no analyses, and no API key configured
- **When** they navigate to "New analysis", they see an empty-state CTA pointing them to Prompts
- **And when** they create a prompt, configure an API key in Settings, and return to "New analysis"
- **And** they leave the watched-company picker empty, pick their saved prompt and the default model, and enter the topic "global, May 2026"
- **And** they run the analysis
- **Then** the AI-generated result is rendered on screen with sources (if returned)
- **And** they can save the result as a stored analysis
- **And** the saved analysis appears on the Analyses list and on the Dashboard

#### Acceptance Criteria

- The model used for the run is the one shown in the model selector at run time (default from Settings, overridable for the single run).
- If the API key is missing or invalid, the user sees a clear error and is told to configure it in Settings — the analysis is not silently dropped.
- A failed run does not delete or corrupt the prompt, the Topic, the additional context, or any other data.
- The saved analysis preserves the exact prompt text used at the time of the run, even if the prompt is later edited.

## Functional Requirements

### Authentication & accounts

- FR-001: User can sign up with email and password. Priority: must-have
  > Socrates: Standard auth plumbing; no domain-level counter-argument. Stands as written.
- FR-002: User must verify their email before they can sign in. Priority: must-have
  > Socrates: Standard auth plumbing; no domain-level counter-argument. Stands as written.
- FR-003: User can sign in with email and password. Priority: must-have
  > Socrates: Standard auth plumbing; no domain-level counter-argument. Stands as written.
- FR-004: User can sign out. Priority: must-have
  > Socrates: Standard auth plumbing; no domain-level counter-argument. Stands as written.
- FR-005: User can request a password reset link via email and set a new password. Priority: must-have
  > Socrates: Standard auth plumbing; no domain-level counter-argument. Stands as written.

### Prompts

- FR-006: User can create a new prompt with a name, description (purpose), and prompt body. Priority: must-have
  > Socrates: Prompt CRUD is the entry point of the workspace; no counter-argument. Stands as written.
- FR-007: User can list all of their prompts on the Prompts page. Priority: must-have
  > Socrates: Standard list surface; no counter-argument. Stands as written.
- FR-008: User can edit any of their saved prompts (name, description, body). Priority: must-have
  > Socrates: Edits apply on the next run only; prior analyses preserve the prompt text used at run time (FR-020 immutability). No counter-argument. Stands as written.
- FR-009: User can delete any of their saved prompts. Priority: must-have
  > Socrates: Deleting a prompt does not retroactively affect analyses run with it (immutability of analyses, FR-020). No counter-argument. Stands as written.

### Running analyses

- FR-010: User can start a new analysis by optionally picking a watched company from a structured picker, choosing a saved prompt, choosing an AI model, and providing a free-text Topic. When a watched company is picked, the Topic field auto-populates with the company's `name (ticker)` and remains editable — the user can override it (e.g., "Apple's quantum strategy") while the company link is preserved. When no watched company is picked, the Topic is whatever the user types (sector, macro, news event, geopolitical question, free-text ticker/name for an unwatched company, or any other subject). Priority: must-have
  > Socrates: Counter-argument considered: "two paths is friction; a smart prompt could infer everything from input." Resolution: kept the picker as the structural axis. The single discriminator is "is this tied to a tracked company?" — modeled as `company_id` on the analysis row, not as an enum type. Removing the explicit type axis collapses the unwatched-free-text carve-out (any analysis can later be promoted to a watched company via FR-019; any analysis can be linked to an existing watched company via FR-019b). Industry / sector / exchange / user note survive as watchlist-row fields but do not flow to the AI — only the Topic does (Business Logic #3).
- FR-011: User can also enter optional additional context for an analysis. Priority: must-have
  > Socrates: Counter-argument considered: "extra context could be stuffed into the Topic field — one fewer control." Resolution: kept. Extra context is structurally distinct from the Topic (it's "supporting material to factor in" — a news snippet, "pretend it's May 2026", a recent earnings number) and merging it with the Topic loses that structure for the model and for the user re-reading the analysis later.
- FR-012: The new-analysis screen pre-fills the model with the user's default from Settings; user can override the model for that single run. Priority: must-have
  > Socrates: Counter-argument considered: "default model from Settings is enough; per-run override is friction." Resolution: kept. Per-run override is one of the differentiating capabilities of the product — A/B-ing the same prompt across Anthropic and OpenAI is a core "research workspace" behavior; locking the user to a single default model would make it as constrained as ChatGPT or Claude Projects.
- FR-013: User can run the analysis and see the AI-generated result rendered on screen. Priority: must-have
  > Socrates: Core path of the product; no counter-argument. Stands as written.
- FR-014: User can save the result as a stored analysis (with title, watched-company link if any, prompt used, Topic, additional context, AI output, sources, model, timestamp). The watched-company link (`company_id`) is null when the user did not pick a watched company at run time. The user can later associate the analysis with a watched company via FR-019 (promote a new company from the analysis) or FR-019b (link to an existing watched company). Priority: must-have
  > Socrates: Save-as-snapshot preserves the prompt text, Topic, additional context, model, and sources at the moment of the run — required by FR-020 immutability. The watched-company link is the one mutable field — adding a link after the fact does not alter what the AI saw, only how the analysis is filed. Stands as written.

### Analyses (history & detail)

- FR-015: User can list all of their saved analyses on the Analyses page. Priority: must-have
  > Socrates: Standard list surface for the work-history workspace; no counter-argument. Stands as written.
- FR-016: User can open a saved analysis and view it in read-only mode (full result + prompt used + Topic + additional context + sources + model + watched-company link if any). Priority: must-have
  > Socrates: Read-only view follows directly from FR-020 immutability. Stands as written.
- FR-018: From an analysis detail view, user can run "Continue analysis" — which starts a new analysis with the current analysis's result as context, lets the user pick a different prompt and/or a different model, and saves the resulting analysis as a child of the parent. Priority: must-have
  > Socrates: Counter-argument considered: "continue-analysis is exotic; user could just start a new analysis and paste the prior result manually." Resolution: kept. Continue-analysis is the core differentiator vs ChatGPT/Claude Projects — without it the product is just a CRUD list of one-shot prompts. The chain (parent linkage, prompt/model swap mid-chain) is what makes it a research workspace.
- FR-019: From an analysis detail view, user can manually add any company surfaced in the result to their watchlist. The act of promoting a company from an analysis links that originating analysis to the new watchlist row (sets `company_id` on the analysis). Available on every analysis regardless of how it was originally run. Priority: must-have
  > Socrates: Counter-argument considered: "users can add companies manually from the watchlist page; FR-019 is convenience scope." Resolution: kept. The conversion path "I found a company in this analysis → I want to track it" is the natural flow at the moment of insight; forcing the user back to the Watchlist page to retype the company adds friction at exactly the wrong moment. With the type axis removed, FR-019 is no longer gated on type=`company` — every analysis can be promoted, even those that were originally a free-text topic where a company surfaced in the AI output.
- FR-019b: From an analysis detail view, user can link the analysis to an existing watched company (sets `company_id` to a row already in the user's watchlist). The link can be set on any analysis whose `company_id` is currently null, and can be cleared back to null. Available regardless of how the analysis was originally run. Priority: must-have
  > Socrates: Counter-argument considered: "FR-019 already handles the company-from-analysis path; this is duplicate scope." Resolution: kept. FR-019 covers the "company doesn't exist yet → create it and back-link" path; FR-019b covers the dual "company already exists → file this analysis under it" path. Without FR-019b, only the originating analysis ever gets back-linked to a watchlist row, and any historical research the user did before adding the company stays orphaned. The link is a filing affordance — it does not alter the AI output, the prompt, or any other immutable field; FR-020 immutability is unaffected.
- FR-020: Saved analyses are immutable in their content — user cannot edit the title, prompt, Topic, additional context, output, sources, or notes of a saved analysis. The watched-company link (`company_id`) is the one exception: it can be set, changed to a different watched company, or cleared via FR-019 / FR-019b, because it is filing metadata rather than analytical content (the AI did not see the watchlist row at run time — Business Logic #3). Priority: must-have
  > Socrates: Counter-argument considered: "user might want to fix a typo in the title or annotate the result." Resolution: kept content-immutability. The escape hatch for content is FR-018 continue-analysis. The carve-out for `company_id` reflects that filing is structurally separate from analytical content — re-filing an analysis does not change what the AI said, just where it appears in the user's workspace.

### Watchlist (companies)

- FR-021: User can add a company to their watchlist with at least: name, ticker, exchange/market (optional), industry/sector, free-text user note. The user note, industry, exchange, and ticker are user-facing filing metadata only — they do not reach the AI on any analysis run (Business Logic #3). Priority: must-have
  > Socrates: Counter-argument considered: "if industry / exchange / note never reach the AI, why store them at all?" Resolution: kept. They are how the user organizes the watchlist view, scopes mental context when revisiting a company, and decides which prompt to run; the application's job is to file them faithfully, not to second-guess that the user might want them re-rendered into prompt bodies. The user can always copy them into the prompt or Topic manually if a particular run benefits.
- FR-022: User can list all of their watched companies on the Watchlist page. Priority: must-have
  > Socrates: Standard list surface; no counter-argument. Stands as written.
- FR-023: User can open a watched company's detail view, see its data, edit it, add/edit a note, and see all analyses tied to that company. Priority: must-have
  > Socrates: Standard detail view; binds the company to its analysis history. No counter-argument. Stands as written.
- FR-024: From a watched company's detail view, user can run a saved prompt against that company without retyping the company's name or ticker — the new-analysis flow opens with the watched company pre-selected and the Topic field auto-populated with `name (ticker)` (per FR-010, the user can edit the Topic before running). Priority: must-have
  > Socrates: Counter-argument considered: "user could go to New-analysis and pick the company from the watchlist picker — same outcome." Resolution: kept. Running an analysis from the company's own detail view is the natural flow when the user is already reviewing that company; making them navigate away to start an analysis is friction at the wrong moment.
- FR-025: From a watched company's detail view, user can pick a prior analysis of that company and run "Continue analysis" against it (different prompt and/or different model). Priority: must-have
  > Socrates: Same as FR-024 — continue-analysis from the company view rather than the analysis view shortens the path when the user is browsing a company's research history. Stands as written.
- FR-026: Continued analyses inherit the parent analysis's watched-company link unchanged. The continue-analysis flow does not let the user pick a different watched company or clear the link — `company_id` is frozen for the duration of a chain. The child analysis is therefore linked to both the parent (`parent_analysis_id`) and, if the parent had one, the same watched company (`company_id`). Priority: must-have
  > Socrates: Counter-argument considered: "dual-linking is over-engineered; pick one." Resolution: kept dual-linking. Without it either the chain (parent analysis) or the company-grouping is lost — the chain answers "how did I get to this conclusion?", the company-grouping answers "what have I learned about Apple?". Counter-argument considered: "let the user re-pick or unset the company on continue." Resolution: rejected for v1 — a continue-analysis chain that drifts across companies mid-stream loses the "what have I learned about Apple?" invariant. The user can still re-file individual chain members via FR-019b after the fact if the chain genuinely changed subject.
- FR-027: User can delete a company from their watchlist; analyses tied to the company are preserved. Priority: must-have
  > Socrates: Counter-argument considered: "user might want to cascade-delete the analyses too." Resolution: kept preserve as the safe default. Offering a preserve / cascade choice at delete time is a v1.1 polish; v1 should never silently destroy research the user has run.

### Settings (per-user configuration)

- FR-028: User can configure API keys per supported AI provider in Settings. Each user has their own keys. Priority: must-have
  > Socrates: Counter-argument considered: "the app could ship with a built-in shared key and meter usage." Resolution: kept per-user keys. Bring-your-own-key is the multi-tenant baseline that makes the product viable without the builder taking on per-user cost or rate-limit risk.
- FR-029: User can choose a default AI model used to pre-fill the model selection when starting a new analysis. Priority: must-have
  > Socrates: Default is a _suggestion_ — overridable per run via FR-012. No counter-argument. Stands as written.
- FR-030: User can see the list of available model variants offered by the application, grouped by provider. Priority: must-have
  > Socrates: Counter-argument considered: "hardcode the variant list in code." Resolution: kept as application configuration. Provider model rosters change frequently (new GPT, new Claude); requiring a redeploy each time the user wants a newly-released model would freeze them out of the latest capabilities.

### Dashboard (start page)

- FR-031: Dashboard shows the user's most recent analyses and watched companies as a quick navigation surface. Priority: must-have
  > Socrates: Lightweight start-page; no counter-argument. Stands as written.

### Sources & cost

- FR-032: When the model returns sources, the analysis stores and displays them verbatim. Priority: must-have
  > Socrates: Verbatim per the source-preservation guardrail. No counter-argument. Stands as written.
- FR-033: When the provider returns token usage and/or cost data, the analysis displays this information to the user. Priority: nice-to-have
  > Socrates: Counter-argument considered: "could be must-have given the API-cost-visibility guardrail." Resolution: kept nice-to-have at the FR level — the guardrail is "if the provider returns it, show it"; the FR's must-have step is the provider returning the data, which we do not control. Display is best-effort.

## Non-Functional Requirements

- A user's analysis returns a result, or a clear error, within the provider's stated SLA bounds; during any wait longer than two seconds the user sees continuous visible progress, not silence.
- API keys and any provider-issued credential are never returned to any user-facing product view after they have been saved, and never appear in logs, error messages, or analytics events.
- A user never sees, queries, or modifies another user's prompts, analyses, watched companies, API keys, or settings — through any interface the product exposes.
- A failed analysis does not corrupt or delete the user's prompt, watchlist, or any prior analysis; the failure surface is bounded to the in-flight run.
- The product remains usable on the latest two major versions of the four mainstream desktop browsers.
- Every screen that displays an AI-generated result also displays a clear notice that the result is research material and not investment advice.
- Source links returned by a model are stored and displayed verbatim; the product does not silently rewrite, filter, or de-duplicate them.

## Business Logic

The application turns a user's saved prompts and watched-company data into AI-driven analyses, preserving each analysis as an immutable snapshot and chaining continued analyses across different prompts and models so that the user's research history is reproducible and traversable in two dimensions: by company and by chain-of-reasoning.

Three load-bearing decisions the application makes for the user:

1. **Snapshot-on-save.** When an analysis is saved, the prompt text used at run time, the Topic, the additional context (if any), the model used, the AI output, and any sources returned are captured together as an immutable record. Subsequent edits to the prompt do not propagate to the saved analysis. This is the basis of "the user's research history is reproducible".

2. **Continue-analysis context composition.** When the user continues an analysis, the next AI request receives the **parent analysis's full AI output verbatim** as context, followed by the user's new prompt, the new Topic, and any new additional context. The parent prompt, parent Topic, and parent additional context are not re-sent (the user can read them in the parent analysis if needed; the model receives only what it needs to keep reasoning forward). Token cost grows with chain depth — there is no auto-summarization in v1.

3. **Topic carries the only company information that reaches the AI.** When the user picks a watched company on the new-analysis screen, the Topic field auto-populates with the company's `name (ticker)` and remains editable. The AI request contains the user's prompt, the Topic, and any additional context — nothing else from the watchlist row reaches the model. Industry, exchange, the user's note, and the watched-company link itself are user-facing filing metadata; they are stored on the analysis (via `company_id`) but never sent to the AI. This keeps prompt composition predictable and lets the user steer the AI's lens via the editable Topic ("Apple's quantum strategy" vs. "Apple (AAPL)") without having to mentally diff what the application would have injected. The watchlist row remains the source of truth for filing — analyses linked to a watched company appear under FR-023's "all analyses tied to that company" view regardless of what was typed in the Topic.

The rest of the analytical reasoning is in the user's prompts. The application does not modify, augment, or interpret prompt bodies.

## Access Control

- **Authentication.** Email + password. Email verification is required on registration. Password reset is performed via an emailed reset link.
- **Roles.** Flat. Every authenticated user can do everything within their own data. There is no admin role for v1, no shared workspaces, no read-only viewers.
- **Onboarding.** Empty state on first login. A new user lands on the dashboard with no prompts, no analyses, and no watchlist; guided empty-state CTAs show how to add the first prompt and run the first analysis.
- **Protected features.** When an unauthenticated user tries to use a feature that requires sign-in, they are sent to the sign-in surface; after successful sign-in they land on the feature they originally tried to use, not on a generic landing page.
- **Isolation.** Every user's data is fully isolated. No user can read or modify another user's prompts, analyses, watchlist, API keys, or settings — through any interface the product exposes. Isolation applies across every entity the product manipulates.

## Non-Goals

### Functional non-goals (capabilities v1 will not provide)

- **No investment recommendations or advice.** AI output is rendered as raw research material. The product never frames a result as a buy / sell / hold instruction.
- **No sharing between users.** No public prompt library, no shared watchlists, no team workspaces, no read-only views of another user's data. Each user's workspace is fully isolated.
- **No market-data integration.** v1 does not connect to real-time price feeds, fundamentals databases, or news APIs. The user types tickers and topics by hand; the AI provides whatever its training and tools cover.
- **No portfolio tracking.** Watchlist is research-shaped, not position-shaped. v1 has no concept of holdings, buy/sell prices, P&L, allocations, or money amounts of any kind.

### Quality / operational non-goals

- **No alerts or notifications.** No push, email, or in-app alerts for price moves, news, or analysis-ready events. v1 is pull-only — the user opens the application when they want to research.
- **No AI providers beyond the v1 provider set.** v1 supports a small fixed set of AI providers; the specific list is documented in shape-notes' `## Forward: tech-stack` block and confirmed by the next chain step. Other providers are out of scope for v1.
- **No offline operation.** v1 requires network access to run analyses and to read prior analyses; no offline caching, no background sync.

## Open Questions

No open questions remain at PRD-draft time. All gray areas surfaced during shaping (see `shape-notes.md` `gray_areas_resolved` frontmatter — 19 entries) were resolved with explicit user decisions.

Forward-looking concerns deliberately deferred to downstream chain steps:

1. **Specific AI provider set for v1.** The shape phase locked the product on two specific provider families; the names are documented in `shape-notes.md` `## Forward: tech-stack` and confirmed by `/10x-tech-stack-selector`. Owner: tech-stack-selector.
2. **API key storage mechanism.** Encryption-at-rest, key-management approach, and isolation pattern for multi-tenant key storage are stack-shaped concerns. Owner: tech-stack-selector.
3. **Multi-tenant isolation pattern.** Row-level security or equivalent technique is a stack-shaped choice. Owner: tech-stack-selector.
4. **Continue-analysis token-cost trigger for v2.** At ≥ 10× the v1 user scale, full-verbatim parent-output context (Business Logic #2) becomes the first feature to revisit; auto-summarization or context-trimming would likely be needed. Owner: future v2 planning.

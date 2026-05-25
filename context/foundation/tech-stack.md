---
starter_id: 10x-astro-starter
package_manager: npm
project_name: investment-assistant
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo retail investor shipping an AI-driven investment-research workspace as a 3-week after-hours MVP needs a battle-tested, agent-friendly starter that handles auth + database + edge deploy out of the box. 10x-astro-starter (Astro 6 + React 19 + TypeScript + Tailwind 4 + Supabase + Cloudflare Pages/Workers) is the recommended default for `(web, js)` and clears all four agent-friendly gates: explicitly typed end-to-end, convention-based across UI/data/auth, popular in training data, and well-documented. Its bootstrapper confidence is first-class, so scaffolding will be smooth. Auth and AI feature flags are set per PRD FRs (FR-001..005, FR-010..014, FR-028..030); payments, realtime, and background jobs are out of scope per PRD non-goals. CI runs on GitHub Actions with auto-deploy-on-merge — what the starter ships with. Two gotchas to track during build: edge-runtime constraints on long-running tasks (mitigate with streaming for AI calls), and Supabase RLS must be configured early to enforce the multi-tenant isolation guardrail.

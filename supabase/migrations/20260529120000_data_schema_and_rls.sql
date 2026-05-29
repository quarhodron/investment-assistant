-- F-01: Multi-tenant data schema with per-user isolation
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger function (shared)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- prompts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE prompts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text,
  body        text        NOT NULL CHECK (length(body) BETWEEN 1 AND 50000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY prompts_select ON prompts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY prompts_insert ON prompts FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY prompts_update ON prompts FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY prompts_delete ON prompts FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON prompts FROM anon;

CREATE TRIGGER prompts_set_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- watched_companies
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE watched_companies (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  ticker     text,
  exchange   text,
  industry   text,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- ticker and exchange must both be set or both be null
  CONSTRAINT ticker_exchange_together CHECK ((ticker IS NULL) = (exchange IS NULL))
);

ALTER TABLE watched_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY watched_companies_select ON watched_companies FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY watched_companies_insert ON watched_companies FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY watched_companies_update ON watched_companies FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY watched_companies_delete ON watched_companies FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON watched_companies FROM anon;

CREATE TRIGGER watched_companies_set_updated_at
  BEFORE UPDATE ON watched_companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Partial unique index: same (user, exchange, ticker) combination is not allowed
CREATE UNIQUE INDEX watched_companies_user_exchange_ticker_uidx
  ON watched_companies (user_id, exchange, ticker)
  WHERE ticker IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- user_settings (PK = user_id → exactly one row per user)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE user_settings (
  user_id       uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_keys      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  default_model text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select ON user_settings FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY user_settings_insert ON user_settings FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY user_settings_update ON user_settings FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY user_settings_delete ON user_settings FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON user_settings FROM anon;

CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- analyses (immutable after insert — FR-020)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE analyses (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_analysis_id        uuid        REFERENCES analyses(id) ON DELETE SET NULL,
  company_id                uuid        REFERENCES watched_companies(id) ON DELETE SET NULL,
  analysis_type             text        NOT NULL CHECK (analysis_type IN ('other', 'company')),
  title                     text        NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  prompt_id                 uuid        REFERENCES prompts(id) ON DELETE SET NULL,
  prompt_name_snapshot      text        NOT NULL,
  prompt_body_snapshot      text        NOT NULL,
  prompt_description_snapshot text,
  input                     text        NOT NULL,
  extra_context             text,
  subject                   text,
  model                     text        NOT NULL,
  provider                  text        NOT NULL,
  output                    text        NOT NULL,
  sources                   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  input_tokens              integer,
  output_tokens             integer,
  cost_usd                  numeric(10,6),
  created_at                timestamptz NOT NULL DEFAULT now(),
  -- analysis_type='other' must not be linked to a watched company (FR-014)
  CONSTRAINT analyses_type_company_check
    CHECK (analysis_type = 'company' OR (analysis_type = 'other' AND company_id IS NULL))
);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Immutability trigger (BEFORE UPDATE so the update plan is rejected before row touch — FR-020)
CREATE OR REPLACE FUNCTION analyses_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'cannot_modify_immutable_analysis'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER analyses_immutability_guard
  BEFORE UPDATE ON analyses
  FOR EACH ROW EXECUTE FUNCTION analyses_immutable();

CREATE POLICY analyses_select ON analyses FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY analyses_insert ON analyses FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
-- UPDATE policy: trigger fires first and raises, but belt-and-suspenders
CREATE POLICY analyses_update ON analyses FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY analyses_delete ON analyses FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON analyses FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes for downstream slices
-- ─────────────────────────────────────────────────────────────────────────────

-- S-03 list, S-08 dashboard recent
CREATE INDEX analyses_user_created_idx
  ON analyses (user_id, created_at DESC);

-- S-03 type filter
CREATE INDEX analyses_user_type_created_idx
  ON analyses (user_id, analysis_type, created_at DESC);

-- S-06 company-bound view, S-03 company filter
CREATE INDEX analyses_user_company_created_idx
  ON analyses (user_id, company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

-- S-02 chain traversal
CREATE INDEX analyses_user_parent_idx
  ON analyses (user_id, parent_analysis_id)
  WHERE parent_analysis_id IS NOT NULL;

-- S-04 prompts list ordering
CREATE INDEX prompts_user_name_idx
  ON prompts (user_id, name);

-- S-05 watched_companies list ordering
CREATE INDEX watched_companies_user_name_idx
  ON watched_companies (user_id, name);

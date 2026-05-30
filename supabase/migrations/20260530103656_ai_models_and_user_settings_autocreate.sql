-- F-02: ai_models registry + auth.users → user_settings auto-create trigger
-- Closes F-01 follow-up F3 (user_settings auto-create on signup).

-- ─────────────────────────────────────────────────────────────────────────────
-- ai_models — read-only registry of selectable provider/model variants (FR-030).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ai_models (
  id                  text        PRIMARY KEY,
  provider            text        NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  display_name        text        NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  supports_web_search boolean     NOT NULL DEFAULT false,
  is_default          boolean     NOT NULL DEFAULT false,
  sort_order          integer     NOT NULL DEFAULT 100,
  enabled             boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read enabled rows. No INSERT/UPDATE/DELETE policy
-- means writes via API roles are denied; admin operates via SQL editor /
-- service-role.
CREATE POLICY ai_models_select ON ai_models FOR SELECT TO authenticated
  USING (enabled);

REVOKE ALL ON ai_models FROM anon;
GRANT SELECT ON ai_models TO authenticated;

-- At most one default model per provider.
CREATE UNIQUE INDEX ai_models_default_per_provider_uidx
  ON ai_models (provider)
  WHERE is_default = true;

-- v1 seed roster.
INSERT INTO ai_models (id, provider, display_name, supports_web_search, is_default, sort_order, enabled) VALUES
  ('claude-opus-4-8',   'anthropic', 'Claude Opus 4.8',   true, true,  10, true),
  ('claude-sonnet-4-6', 'anthropic', 'Claude Sonnet 4.6', true, false, 20, true),
  ('gpt-5.1',           'openai',    'GPT-5.1',           true, true,  10, true),
  ('gpt-5.1-mini',      'openai',    'GPT-5.1 mini',      true, false, 20, true);

-- ─────────────────────────────────────────────────────────────────────────────
-- user_settings auto-create on signup (closes F-01 F3).
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER is required: auth.users triggers run in the auth-service
-- execution context, where the firing role lacks INSERT on
-- public.user_settings. Hard-coding search_path neutralizes the search-path
-- hijack class of bug.
CREATE OR REPLACE FUNCTION handle_new_user_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_user_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_settings();

-- Back-fill any existing users (idempotent against rows the trigger may have
-- created on migration replay).
INSERT INTO public.user_settings (user_id)
  SELECT id FROM auth.users
  ON CONFLICT DO NOTHING;

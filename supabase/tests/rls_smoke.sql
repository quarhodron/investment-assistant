-- RLS smoke test — run against a freshly reset local stack:
--   psql --set ON_ERROR_STOP=on "$SUPABASE_DB_URL" -f supabase/tests/rls_smoke.sql
--
-- Success: silent output (every assertion holds).
-- Failure: RAISE EXCEPTION 'FAIL: …' from the assertion block that caught a violation.
--
-- This file lives outside migrations/ so db reset never replays it.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Synthetic test users
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, role
) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'user_a@rls-smoke.test',
    'x', now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, false, 'authenticated'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'user_b@rls-smoke.test',
    'x', now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, false, 'authenticated'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Insert data as user A
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

INSERT INTO prompts (id, user_id, name, body)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Test Prompt A',
  'Analyse the company and summarise findings.'
);

INSERT INTO watched_companies (id, user_id, name, ticker, exchange)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Acme Corp',
  'ACME',
  'NYSE'
);

INSERT INTO user_settings (user_id)
VALUES ('00000000-0000-0000-0000-000000000001');

INSERT INTO analyses (
  id, user_id, analysis_type, title,
  prompt_id,
  prompt_name_snapshot, prompt_body_snapshot,
  input, model, provider, output
) VALUES (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'other',
  'Smoke Test Analysis',
  '10000000-0000-0000-0000-000000000001',
  'Test Prompt A',
  'Analyse the company and summarise findings.',
  'Some input text',
  'gpt-4o',
  'openai',
  'Some output text'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cross-user visibility check: user B must see nothing
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM prompts;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B can see % prompts row(s) belonging to user A', cnt;
  END IF;
END;
$$;

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM watched_companies;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B can see % watched_companies row(s) belonging to user A', cnt;
  END IF;
END;
$$;

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM user_settings;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B can see % user_settings row(s) belonging to user A', cnt;
  END IF;
END;
$$;

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM analyses;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B can see % analyses row(s) belonging to user A', cnt;
  END IF;
END;
$$;

-- UPDATE as user B targeting user A's rows must affect 0 rows

DO $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE prompts SET name = 'hacked' WHERE id = '10000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  IF rows_affected <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B UPDATE affected % prompts row(s) owned by user A', rows_affected;
  END IF;
END;
$$;

DO $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE watched_companies SET name = 'hacked' WHERE id = '20000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  IF rows_affected <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B UPDATE affected % watched_companies row(s) owned by user A', rows_affected;
  END IF;
END;
$$;

DO $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE user_settings SET default_model = 'hacked'
    WHERE user_id = '00000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  IF rows_affected <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B UPDATE affected % user_settings row(s) owned by user A', rows_affected;
  END IF;
END;
$$;

DO $$
DECLARE
  rows_affected integer;
BEGIN
  DELETE FROM prompts WHERE id = '10000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  IF rows_affected <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B DELETE removed % prompts row(s) owned by user A', rows_affected;
  END IF;
END;
$$;

DO $$
DECLARE
  rows_affected integer;
BEGIN
  DELETE FROM watched_companies WHERE id = '20000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  IF rows_affected <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B DELETE removed % watched_companies row(s) owned by user A', rows_affected;
  END IF;
END;
$$;

DO $$
DECLARE
  rows_affected integer;
BEGIN
  DELETE FROM user_settings WHERE user_id = '00000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  IF rows_affected <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B DELETE removed % user_settings row(s) owned by user A', rows_affected;
  END IF;
END;
$$;

DO $$
DECLARE
  rows_affected integer;
BEGIN
  DELETE FROM analyses WHERE id = '30000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  IF rows_affected <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B DELETE removed % analyses row(s) owned by user A', rows_affected;
  END IF;
END;
$$;

-- INSERT spoof checks: as user B, try to write rows with user_id = userA.
-- The INSERT WITH CHECK policy must reject (raises insufficient_privilege).

DO $$
DECLARE
  raised boolean := false;
BEGIN
  BEGIN
    INSERT INTO prompts (user_id, name, body)
    VALUES ('00000000-0000-0000-0000-000000000001', 'spoof', 'spoof body');
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAIL: user B spoof INSERT into prompts with user_id = userA was accepted';
  END IF;
END;
$$;

DO $$
DECLARE
  raised boolean := false;
BEGIN
  BEGIN
    INSERT INTO watched_companies (user_id, name)
    VALUES ('00000000-0000-0000-0000-000000000001', 'spoof co');
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAIL: user B spoof INSERT into watched_companies with user_id = userA was accepted';
  END IF;
END;
$$;

DO $$
DECLARE
  raised boolean := false;
BEGIN
  BEGIN
    INSERT INTO user_settings (user_id)
    VALUES ('00000000-0000-0000-0000-000000000001');
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAIL: user B spoof INSERT into user_settings with user_id = userA was accepted';
  END IF;
END;
$$;

DO $$
DECLARE
  raised boolean := false;
BEGIN
  BEGIN
    INSERT INTO analyses (
      user_id, analysis_type, title,
      prompt_name_snapshot, prompt_body_snapshot,
      input, model, provider, output
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      'other', 'spoof',
      'spoof', 'spoof',
      'spoof', 'gpt-4o', 'openai', 'spoof'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAIL: user B spoof INSERT into analyses with user_id = userA was accepted';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tear down: roll back everything (test users, inserted rows)
-- ─────────────────────────────────────────────────────────────────────────────

ROLLBACK;

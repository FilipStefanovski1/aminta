-- ===========================================================================
-- Aminta: Complete Supabase schema setup
-- ===========================================================================
-- Safe to run on a fresh project OR on an existing one — all statements are
-- idempotent. Run the blocks IN ORDER, top to bottom, in the Supabase SQL editor.
--
-- What this file creates:
--   1. public.users         — one row per auth user; owns plan/billing
--   2. public.aminta_state  — one row per user; owns XP, streak, voice, etc.
--   3. RLS enabled on both tables
--   4. RLS policies (select/insert/update/delete — no orphaned gaps)
--   5. handle_new_user()    — auto-create public.users row on auth.users insert
--   6. set_updated_at()     — auto-stamp updated_at on every update
--   7. Indexes on hot paths
--
-- DO NOT run supabase-migration-dedup.sql from here — that is a separate,
-- manual step only if you have duplicate-email users to reconcile.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

-- public.users
-- One row per auth.users row. The trigger (step 5) creates this automatically
-- when a new user signs up. Billing/plan data is stored here.

CREATE TABLE IF NOT EXISTS public.users (
  id                     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                  text,
  plan                   text        NOT NULL DEFAULT 'free',
  paid_via               text,
  subscription_status    text,
  creem_customer_id      text,
  creem_subscription_id  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- A paid plan must always have a paid_via — enforced at the DB level so
  -- this can't drift even via a manual table-editor edit. See
  -- supabase-migration-plan-integrity.sql for the reasoning and the
  -- backfill needed if this is added to an existing project.
  CONSTRAINT users_plan_requires_paid_via CHECK (plan = 'free' OR paid_via IS NOT NULL)
);

-- public.aminta_state
-- One row per user. All XP, streak, missions, voice, DNA stored here.
-- The app upserts this on every sync; ON CONFLICT DO UPDATE is safe.

CREATE TABLE IF NOT EXISTS public.aminta_state (
  user_id           uuid        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  xp                integer     NOT NULL DEFAULT 0,
  generations_total integer     NOT NULL DEFAULT 0,
  earned_hashes     text[]      NOT NULL DEFAULT '{}',
  streak            integer     NOT NULL DEFAULT 0,
  streak_date       text        NOT NULL DEFAULT '',
  mission_date      text        NOT NULL DEFAULT '',
  mission_generates integer     NOT NULL DEFAULT 0,
  mission_published integer     NOT NULL DEFAULT 0,
  voice_profile     jsonb,
  style_profile     jsonb,
  style_profile_hash text       NOT NULL DEFAULT '',
  templates         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  tweet_dna         text[]      NOT NULL DEFAULT '{}',
  display_name      text        NOT NULL DEFAULT '',
  bio               text        NOT NULL DEFAULT '',
  interests         text        NOT NULL DEFAULT '',
  onboarding_done   boolean     NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY — enable
-- ---------------------------------------------------------------------------

ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aminta_state ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 3. RLS POLICIES — public.users
-- ---------------------------------------------------------------------------
-- Policies are created inside DO blocks so the script is safe to re-run.
-- Supabase Postgres (PG 15) has no CREATE POLICY IF NOT EXISTS.

DO $$ BEGIN

  -- SELECT: each user can read their own row
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'users_select_own'
  ) THEN
    CREATE POLICY users_select_own ON public.users
      FOR SELECT USING (auth.uid() = id);
  END IF;

  -- INSERT: blocked via RLS — inserts come only from the trigger (security definer)
  -- No INSERT policy intentionally: users cannot self-insert; the trigger handles it.

  -- UPDATE: each user can update their own row (e.g. display_name in future)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'users_update_own'
  ) THEN
    CREATE POLICY users_update_own ON public.users
      FOR UPDATE USING (auth.uid() = id);
  END IF;

  -- DELETE: blocked — users cannot delete their own auth row via this table
  -- (ON DELETE CASCADE from auth.users handles cleanup when Supabase deletes the auth row)

END $$;


-- ---------------------------------------------------------------------------
-- 4. RLS POLICIES — public.aminta_state
-- ---------------------------------------------------------------------------

DO $$ BEGIN

  -- SELECT: each user can read their own state
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'aminta_state'
      AND policyname = 'aminta_state_select_own'
  ) THEN
    CREATE POLICY aminta_state_select_own ON public.aminta_state
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  -- INSERT: required for upsert on first dashboard visit and first sync push
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'aminta_state'
      AND policyname = 'aminta_state_insert_own'
  ) THEN
    CREATE POLICY aminta_state_insert_own ON public.aminta_state
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  -- UPDATE: required for every sync push
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'aminta_state'
      AND policyname = 'aminta_state_update_own'
  ) THEN
    CREATE POLICY aminta_state_update_own ON public.aminta_state
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  -- DELETE: blocked — the app never deletes state rows directly
  -- (ON DELETE CASCADE from public.users handles cleanup)

END $$;


-- ---------------------------------------------------------------------------
-- 5. TRIGGER: handle_new_user — auto-create public.users row
-- ---------------------------------------------------------------------------
-- Fires AFTER INSERT on auth.users for every new sign-up (Google, email OTP, etc.)
-- Uses ON CONFLICT DO NOTHING so it is safe against duplicate triggers / manual inserts.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- Drop and recreate the trigger (CREATE TRIGGER has no IF NOT EXISTS in PG 15)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 6. TRIGGER: set_updated_at — auto-stamp updated_at on every UPDATE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS aminta_state_set_updated_at ON public.aminta_state;
CREATE TRIGGER aminta_state_set_updated_at
  BEFORE UPDATE ON public.aminta_state
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 7. INDEXES
-- ---------------------------------------------------------------------------
-- user_id / id are PKs — already indexed.
-- users.email is queried by the Creem webhook (.eq("email", email)).

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);

-- aminta_state.xp is not queried in filters today; skip until needed.
-- aminta_state.updated_at useful for future admin dashboards.
CREATE INDEX IF NOT EXISTS aminta_state_updated_at_idx ON public.aminta_state (updated_at DESC);


-- ---------------------------------------------------------------------------
-- 8. VERIFICATION — run these SELECTs to confirm everything was created
-- ---------------------------------------------------------------------------
-- Paste each block into the SQL editor separately and check the output.

-- Tables exist:
-- SELECT table_name, table_type
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
-- Expected: aminta_state, users

-- RLS is on:
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public';
-- Expected: both rows show rowsecurity = true

-- Policies exist:
-- SELECT policyname, tablename, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
-- Expected right after this section: users_select_own, users_update_own,
--           aminta_state_select_own, aminta_state_insert_own, aminta_state_update_own
-- (users_update_own is dropped later, in section 11.1 — see that section's
-- verification block for the final expected state of public.users policies.)

-- Triggers exist:
-- SELECT trigger_name, event_object_table, action_timing, event_manipulation
-- FROM information_schema.triggers
-- WHERE trigger_schema IN ('public', 'auth')
-- ORDER BY trigger_name;
-- Expected: on_auth_user_created (auth.users), users_set_updated_at,
--           aminta_state_set_updated_at

-- Indexes exist:
-- SELECT indexname, tablename
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- ORDER BY tablename, indexname;
-- Expected: users_pkey, users_email_idx,
--           aminta_state_pkey, aminta_state_updated_at_idx


-- ===========================================================================
-- 9. INCLUDED AI (Pro/Founder/Gifted server-side generation) — additive
-- ===========================================================================
-- Everything below exists ONLY to serve Included-AI traffic through
-- app/api/generate. BYOK (free users, and anyone without ai_included) never
-- reads or writes any of this — that request path stays entirely client-side,
-- straight from the extension to the user's own provider key.
--
-- 'gifted' below is never a real users.plan value — it's a synthetic key in
-- plan_limits, resolved in application code when ai_included_override=true.
-- Gifted access is modeled as plan='free' + ai_included_override=true so it
-- never touches the users_plan_requires_paid_via CHECK constraint (a gift
-- isn't a purchase, must never require paid_via).
-- ===========================================================================

-- 9.1 public.users — new entitlement columns
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ai_included_override     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_preference       text    NOT NULL DEFAULT 'gemini-2.0-flash',
  ADD COLUMN IF NOT EXISTS generation_limit_daily    integer,
  ADD COLUMN IF NOT EXISTS generation_limit_monthly  integer;

-- 9.2 public.plan_limits — plan-level defaults, editable without a redeploy
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan            text        PRIMARY KEY,
  ai_included     boolean     NOT NULL DEFAULT false,
  daily_limit     integer     NOT NULL,
  monthly_limit   integer     NOT NULL,
  max_concurrent  integer     NOT NULL DEFAULT 1,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plan_limits (plan, ai_included, daily_limit, monthly_limit, max_concurrent) VALUES
  ('free',     false, 0,  0,    1),
  ('pro',      true,  60, 1200, 2),
  ('lifetime', true,  60, 1200, 2),
  ('gifted',   true,  60, 1200, 2)
ON CONFLICT (plan) DO NOTHING;

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
-- Service-role only — no user-facing policies. Intentionally no INSERT/SELECT
-- policy for anon/authenticated; the app reads this exclusively via the
-- service client from within app/api/generate.

-- 9.3 public.ai_usage_log — audit log, spend tracking, and idempotency cache
-- (all three in one table deliberately, to avoid a second denormalized
-- counter that could drift from this one).
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            uuid        REFERENCES public.users(id) ON DELETE CASCADE,
  request_id         uuid        NOT NULL,
  generation_mode    text        NOT NULL,   -- 'tweet' | 'reply' | 'polish' | 'style_profile'
  model              text        NOT NULL DEFAULT 'gemini-2.0-flash',
  input_chars        integer     NOT NULL,
  image_count        integer     NOT NULL DEFAULT 0,
  output_tokens_est  integer,
  latency_ms         integer,
  status             text        NOT NULL,   -- 'pending' | 'success' | 'error'
  result_text        text,
  error_detail        text,
  estimated_cost_usd numeric(10,6) DEFAULT 0,
  client_ip          text,
  device_id          text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_log_request_id_idx
  ON public.ai_usage_log (request_id);
CREATE INDEX IF NOT EXISTS ai_usage_log_user_created_idx
  ON public.ai_usage_log (user_id, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
-- Service-role only — users never read this table directly; a future
-- "usage this month" UI would aggregate server-side via its own endpoint.

-- 9.4 public.ai_rate_limit_counters — fixed-window Postgres rate limiting
CREATE TABLE IF NOT EXISTS public.ai_rate_limit_counters (
  key          text        NOT NULL,   -- 'user:<uuid>:min' | 'ip:<ip>:min' | 'device:<id>:min' | '...:hour'
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS ai_rate_limit_counters_window_idx
  ON public.ai_rate_limit_counters (window_start);

ALTER TABLE public.ai_rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- Service-role only.

-- 9.5 public.ai_inflight_requests — concurrency limiting
CREATE TABLE IF NOT EXISTS public.ai_inflight_requests (
  id          uuid        PRIMARY KEY,   -- = request_id
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_inflight_user_idx ON public.ai_inflight_requests (user_id);
CREATE INDEX IF NOT EXISTS ai_inflight_expires_idx ON public.ai_inflight_requests (expires_at);

ALTER TABLE public.ai_inflight_requests ENABLE ROW LEVEL SECURITY;
-- Service-role only.

-- 9.6 public.ai_config — singleton kill switch + global spend caps
CREATE TABLE IF NOT EXISTS public.ai_config (
  id                            boolean PRIMARY KEY DEFAULT true CHECK (id),
  ai_included_enabled           boolean       NOT NULL DEFAULT false,
  global_daily_spend_cap_usd    numeric(10,2) NOT NULL DEFAULT 20.00,
  global_monthly_spend_cap_usd  numeric(10,2) NOT NULL DEFAULT 300.00,
  updated_at                    timestamptz   NOT NULL DEFAULT now()
);

INSERT INTO public.ai_config (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;
-- Service-role only. ai_included_enabled=false is the master kill switch —
-- flipping it is a single UPDATE, no deploy needed, and rejects every
-- /api/generate request before any other work runs.


-- ---------------------------------------------------------------------------
-- 9.7 VERIFICATION — Included AI tables
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
--   AND table_name IN ('plan_limits','ai_usage_log','ai_rate_limit_counters','ai_inflight_requests','ai_config');
-- Expected: all 5 rows present.
--
-- SELECT * FROM public.plan_limits ORDER BY plan;
-- Expected: free/pro/lifetime/gifted rows seeded.
--
-- SELECT * FROM public.ai_config;
-- Expected: 1 row, ai_included_enabled = false.


-- ===========================================================================
-- 10. INCLUDED AI — production-readiness hardening (pre-launch audit)
-- ===========================================================================
-- Fixes three gaps found auditing section 9 before enabling Included AI in
-- production:
--  (a) idempotency was scoped to request_id alone — a collision (or a client
--      bug generating non-random ids) could return one user's cached
--      generation to a different user. Rescoped to (user_id, request_id).
--  (b) concurrency ("delete expired -> count -> insert") and rate limiting
--      ("read count -> increment") were each two-or-more separate round
--      trips in lib/ai/rateLimit.ts — racy under concurrent requests from
--      the same user. Replaced with single atomic Postgres functions.
--  (c) ai_usage_log only ever stored an estimated output-token count from a
--      char-count heuristic, never real usage. Real input/output/total
--      token columns added; lib/ai/gemini.ts now reads them from Gemini's
--      usageMetadata when present, with the heuristic kept only as a
--      fallback for cost estimation.
-- ===========================================================================

-- 10.1 ai_usage_log — rescope idempotency to (user_id, request_id); add real
-- token-accounting columns (see (c) above).
DROP INDEX IF EXISTS public.ai_usage_log_request_id_idx;
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_log_user_request_idx
  ON public.ai_usage_log (user_id, request_id);

ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS input_tokens  integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS total_tokens  integer;

-- 10.2 claim_inflight_slot — atomic concurrency lease.
--
-- Replaces the "delete expired -> count -> insert" sequence that used to
-- live in lib/ai/rateLimit.ts's checkConcurrency()/markInflight() as three
-- separate round trips: two concurrent requests from the same user could
-- both pass the count check before either had inserted its row, letting
-- both through. pg_advisory_xact_lock(hashtext(p_user_id::text)) serializes
-- concurrent calls for the SAME user only — different users hash to
-- different lock keys and never contend — and the lock releases
-- automatically when the calling transaction (one Supabase RPC call) ends,
-- so there is no separate unlock step and no leak risk on error.
--
-- Not SECURITY DEFINER: this is only ever called via the service-role
-- client (see lib/supabase/server.ts's createServiceClient()), which
-- already bypasses RLS entirely. Running as SECURITY INVOKER means even a
-- mistaken call from an anon/authenticated context is still blocked by
-- ai_inflight_requests' RLS (service-role only, no user-facing policies) —
-- one less privilege-escalation surface to reason about.
CREATE OR REPLACE FUNCTION public.claim_inflight_slot(
  p_id uuid,
  p_user_id uuid,
  p_max_concurrent integer,
  p_ttl_seconds integer DEFAULT 70
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  DELETE FROM public.ai_inflight_requests WHERE expires_at < now();

  SELECT count(*) INTO v_count
  FROM public.ai_inflight_requests
  WHERE user_id = p_user_id;

  IF v_count >= p_max_concurrent THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_inflight_requests (id, user_id, expires_at)
  VALUES (p_id, p_user_id, now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (id) DO NOTHING;

  RETURN true;
END;
$$;

-- 10.3 increment_rate_limit — atomic counter increment + limit check.
--
-- The previous checkAndIncrementRateLimits() read each counter's current
-- count, then only incremented if every counter was under its limit — a
-- classic TOCTOU gap: two concurrent requests can both read a count under
-- the limit before either has incremented, letting a burst through right at
-- the boundary. This function increments FIRST, via a single
-- INSERT ... ON CONFLICT ... DO UPDATE (already atomic at the row level in
-- Postgres — no separate read), and returns whether the count *after* that
-- increment is within the limit. The count is always authoritative, never a
-- stale read. One accepted side effect: a request that gets rejected still
-- counts toward the window (previously it didn't) — this is strictly safer
-- for abuse protection, not a regression.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key text,
  p_window_start timestamptz,
  p_limit integer
) RETURNS TABLE(count integer, allowed boolean)
LANGUAGE sql
AS $$
  INSERT INTO public.ai_rate_limit_counters (key, window_start, count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.ai_rate_limit_counters.count + 1
  RETURNING public.ai_rate_limit_counters.count, public.ai_rate_limit_counters.count <= p_limit;
$$;

-- ---------------------------------------------------------------------------
-- 10.4 VERIFICATION
-- ---------------------------------------------------------------------------
-- SELECT proname FROM pg_proc WHERE proname IN ('claim_inflight_slot', 'increment_rate_limit');
-- Expected: both present.
--
-- SELECT indexname FROM pg_indexes WHERE tablename = 'ai_usage_log';
-- Expected: ai_usage_log_user_request_idx present, ai_usage_log_request_id_idx gone.


-- ===========================================================================
-- 11. FINAL SQL-LAYER AUDIT — RLS gap, missing index, explicit grants
-- ===========================================================================
-- Three issues found verifying the schema/RPC surface end-to-end against the
-- application code before enabling Included AI in production:
--
--  (a) CRITICAL — users_update_own (created in section 3, before Included AI
--      existed) is `FOR UPDATE USING (auth.uid() = id)` with no WITH CHECK
--      and no column-level GRANT restricting which columns can be touched.
--      No application code has ever exercised it (every write to
--      public.users goes through the service-role client — see
--      app/auth/callback, app/api/auth/ensure-profile,
--      app/api/webhooks/creem). Since NEXT_PUBLIC_SUPABASE_ANON_KEY is a
--      public key shipped in both the extension bundle and the web client,
--      this policy is directly reachable via
--      `PATCH /rest/v1/users?id=eq.<self>` using nothing but a user's own
--      session token — allowing self-modification of plan,
--      subscription_status, and (as of section 9)
--      ai_included_override/generation_limit_daily/generation_limit_monthly.
--      That means a user could self-grant Included AI, an unlimited quota,
--      or a paid plan, entirely bypassing Creem billing. The Included-AI
--      work didn't create this hole, but it materially widened it by adding
--      more self-giftable entitlement columns to the same exposed table.
--      Fix: drop the policy. Nothing depends on it.
--
--  (b) MEDIUM — no index supports the global spend-cap query.
--      lib/ai/config.ts's getCurrentSpend() runs on EVERY /api/generate
--      request (step 2, before auth even matters to the caller) and filters
--      `status = 'success' AND created_at >= <day/month start>` with NO
--      user_id predicate — the existing ai_usage_log_user_created_idx
--      (user_id, created_at DESC) doesn't help a query that doesn't filter
--      user_id at all. As ai_usage_log grows (90-day retention — see
--      app/api/internal/cleanup), this becomes a full-table scan on the
--      hottest read path in the whole endpoint.
--
--  (c) LOW/defense-in-depth — claim_inflight_slot/increment_rate_limit have
--      no explicit EXECUTE grant. They're only ever called via the
--      service-role client, and Postgres grants EXECUTE on new functions to
--      PUBLIC by default, so this works today — but that default can be
--      (and on hardened Supabase projects sometimes is) revoked at the
--      schema level. An explicit grant removes that environment-dependent
--      assumption entirely.
-- ===========================================================================

-- 11.1 (a) — remove the unused, over-permissive self-update policy.
DROP POLICY IF EXISTS users_update_own ON public.users;

-- 11.2 (b) — partial index on the exact predicate getCurrentSpend() uses.
CREATE INDEX IF NOT EXISTS ai_usage_log_status_created_idx
  ON public.ai_usage_log (created_at)
  WHERE status = 'success';

-- 11.3 (c) — explicit grants, independent of default PUBLIC execute.
GRANT EXECUTE ON FUNCTION public.claim_inflight_slot(uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 11.4 VERIFICATION
-- ---------------------------------------------------------------------------
-- SELECT policyname FROM pg_policies WHERE tablename = 'users';
-- Expected: users_select_own only — users_update_own gone.
--
-- SELECT indexname FROM pg_indexes WHERE tablename = 'ai_usage_log';
-- Expected: ai_usage_log_status_created_idx present alongside the others.
--
-- SELECT grantee, routine_name FROM information_schema.role_routine_grants
-- WHERE routine_name IN ('claim_inflight_slot', 'increment_rate_limit');
-- Expected: service_role listed for both.

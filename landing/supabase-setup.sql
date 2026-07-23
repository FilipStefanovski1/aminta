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
-- Expected: users_select_own, users_update_own,
--           aminta_state_select_own, aminta_state_insert_own, aminta_state_update_own

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

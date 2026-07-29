-- ===========================================================================
-- Aminta: X-first profile-creation migration
-- ===========================================================================
-- Additive, idempotent, safe to run on the existing production database.
-- Does NOT modify supabase-setup.sql or any prior migration file — this is a
-- new file that CREATE OR REPLACEs the same trigger function, exactly the
-- pattern already used by supabase-setup.sql's own sections 10/11 to layer
-- later fixes onto earlier objects. Not yet applied to any environment as of
-- this revision — safe to edit directly rather than layering a v2 file.
--
-- Ownership model (deliberately narrow):
--   - handle_new_user() (this trigger) guarantees EXISTENCE ONLY: a
--     public.users row and an aminta_state row, referential integrity, and
--     nothing else. No metadata parsing, no fallback logic, no business
--     rules of any kind live in Postgres. It only ever fires once per user
--     (AFTER INSERT, never AFTER UPDATE), so it can never touch a row again
--     after creating it.
--   - ensureProfile() (app-level TypeScript, lib/auth/ensureProfile.ts) is
--     the ONLY place that decides what a good display_name/avatar_url is,
--     and the only place that repairs/enriches either. It's idempotent and
--     never overwrites a value already set — see that file for exactly how.
--   - The database guarantees a row exists. The application guarantees the
--     row is correct. Neither one duplicates the other's job.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. public.users — add avatar_url (nullable, no default: NULL is the real
--    "not set" state, distinct from an empty string that would read as
--    "explicitly cleared" — see ensureProfile()'s enrichment step).
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;


-- ---------------------------------------------------------------------------
-- 2. handle_new_user() — existence only. No metadata parsing, no
--    display_name computation, no COALESCE fallback chain. That logic lives
--    exclusively in lib/auth/ensureProfile.ts now.
-- ---------------------------------------------------------------------------

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

  INSERT INTO public.aminta_state (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

-- Trigger itself is unchanged (still AFTER INSERT ON auth.users) —
-- recreated only because CREATE TRIGGER has no IF NOT EXISTS in PG 15 and
-- DROP+CREATE is the existing repo convention.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 3. DIAGNOSTIC — READ ONLY. Run this section first and review the output
--    before running section 4. Nothing here writes to the database.
-- ---------------------------------------------------------------------------

-- 3.1 How many auth.users rows have no matching public.users row?
SELECT count(*) AS missing_public_users
FROM auth.users u
LEFT JOIN public.users pu ON pu.id = u.id
WHERE pu.id IS NULL;

-- 3.2 How many public.users rows have no matching aminta_state row?
SELECT count(*) AS missing_aminta_state
FROM public.users pu
LEFT JOIN public.aminta_state s ON s.user_id = pu.id
WHERE s.user_id IS NULL;

-- 3.3 List the affected accounts (bounded to 200 for manual review).
-- email may legitimately be NULL here (X users with no email).
SELECT u.id, u.email, u.raw_app_meta_data->>'provider' AS provider, u.created_at,
       (pu.id IS NULL)                             AS missing_public_users_row,
       (pu.id IS NOT NULL AND s.user_id IS NULL)   AS missing_aminta_state_row
FROM auth.users u
LEFT JOIN public.users pu       ON pu.id = u.id
LEFT JOIN public.aminta_state s ON s.user_id = pu.id
WHERE pu.id IS NULL OR (pu.id IS NOT NULL AND s.user_id IS NULL)
ORDER BY u.created_at DESC
LIMIT 200;


-- ---------------------------------------------------------------------------
-- 4. REPAIR / BACKFILL — existence only, matching the trigger's own scope.
--    No display_name/avatar_url computation here either: any account
--    repaired by this section gets the same bare defaults a fresh trigger
--    run would produce, and self-heals its display_name/avatar_url the next
--    time that user actually logs in and ensureProfile() runs for them.
--    Additive only — every insert is guarded by ON CONFLICT DO NOTHING, so
--    re-running this is a no-op the second time.
-- ---------------------------------------------------------------------------

-- 4.1 Insert any missing public.users rows.
INSERT INTO public.users (id, email)
SELECT u.id, u.email
FROM auth.users u
LEFT JOIN public.users pu ON pu.id = u.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 4.2 Insert any missing aminta_state rows.
INSERT INTO public.aminta_state (user_id)
SELECT pu.id
FROM public.users pu
LEFT JOIN public.aminta_state s ON s.user_id = pu.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 5. VERIFICATION — re-run the section 3 diagnostics; both counts should
--    now be 0. Also confirm the new column exists.
-- ---------------------------------------------------------------------------
-- SELECT count(*) FROM auth.users u LEFT JOIN public.users pu ON pu.id = u.id WHERE pu.id IS NULL;
-- SELECT count(*) FROM public.users pu LEFT JOIN public.aminta_state s ON s.user_id = pu.id WHERE s.user_id IS NULL;
-- Expected: 0, 0.
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_url';
-- Expected: one row.

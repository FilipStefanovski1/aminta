-- ===========================================================================
-- Aminta: extension activation marker (Discord community gate)
-- ===========================================================================
-- DO NOT RUN AUTOMATICALLY. Review and run manually in the Supabase SQL
-- Editor when ready.
--
-- WHY: the dashboard's Discord CTA unlocks once the Chrome extension has
-- authenticated/synced with the account at least once — a product/onboarding
-- gate, not a security boundary. This is set once by app/api/sync/route.ts
-- (the extension's existing auth'd sync endpoint — see lib/sync.ts in
-- extension/) on the first successful GET or POST, and never cleared.
-- ===========================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS extension_connected_at timestamptz;

-- Syncs the Part-1 daily-goal redesign (post/reply/polish confirmed-publish
-- flags, see extension/lib/missions.ts) to the dashboard, replacing the
-- stale mission_generates/mission_published-based "Today" card.
ALTER TABLE public.aminta_state
  ADD COLUMN IF NOT EXISTS mission_modes jsonb NOT NULL DEFAULT '{"tweet":false,"reply":false,"polish":false}'::jsonb;

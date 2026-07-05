-- ===========================================================================
-- Aminta: Duplicate user detection & safe XP/profile merge
-- ===========================================================================
-- Context: the old extension flow called auth.admin.createUser() which creates
-- an EMAIL-provider user (UUID-B) distinct from the Google OAuth user (UUID-A)
-- that the website creates for the same email address. This leaves some users
-- with two auth.users rows and two aminta_state rows — XP split across both.
--
-- This script:
--   1. Identifies duplicate pairs (same email, different providers).
--   2. Shows what would be merged.
--   3. Copies higher XP + richer profile to the Google OAuth user row.
--   4. Does NOT delete anything — review, then decide.
--
-- Run in Supabase SQL editor or psql. Read all results before acting.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Step 1: Find duplicate email pairs
-- ---------------------------------------------------------------------------
-- Shows every email with both a 'google' and 'email' provider row.
-- Column meanings:
--   google_uid   — the UUID to KEEP (used by website)
--   email_uid    — the UUID to eventually deprecate (used by old extension)
--   google_xp    — XP stored under the google user
--   email_xp     — XP stored under the email user
--   winner       — which uid has the higher XP (that's what we'll merge to)

WITH google_users AS (
  SELECT id AS google_uid, email
  FROM auth.users
  WHERE raw_app_meta_data->>'provider' = 'google'
    AND email IS NOT NULL
),
email_users AS (
  SELECT id AS email_uid, email
  FROM auth.users
  WHERE raw_app_meta_data->>'provider' = 'email'
    AND email IS NOT NULL
),
pairs AS (
  SELECT
    g.google_uid,
    e.email_uid,
    g.email
  FROM google_users g
  JOIN email_users e ON g.email = e.email
)
SELECT
  p.email,
  p.google_uid,
  p.email_uid,
  COALESCE(gs.xp, 0)    AS google_xp,
  COALESCE(es.xp, 0)    AS email_xp,
  GREATEST(COALESCE(gs.xp, 0), COALESCE(es.xp, 0)) AS merged_xp,
  CASE
    WHEN COALESCE(gs.xp, 0) >= COALESCE(es.xp, 0) THEN 'google already ahead'
    ELSE 'email_uid has higher XP — needs merge'
  END AS status,
  COALESCE(gs.streak, 0)           AS google_streak,
  COALESCE(es.streak, 0)           AS email_streak,
  gs.voice_profile IS NOT NULL      AS google_has_voice,
  es.voice_profile IS NOT NULL      AS email_has_voice,
  COALESCE(array_length(gs.tweet_dna, 1), 0) AS google_dna_count,
  COALESCE(array_length(es.tweet_dna, 1), 0) AS email_dna_count
FROM pairs p
LEFT JOIN aminta_state gs ON gs.user_id = p.google_uid
LEFT JOIN aminta_state es ON es.user_id = p.email_uid
ORDER BY merged_xp DESC;


-- ---------------------------------------------------------------------------
-- Step 2: Preview the merge — what would change on the google_uid row
-- ---------------------------------------------------------------------------
-- Run this to see the exact values that would be written. No writes yet.

WITH google_users AS (
  SELECT id AS google_uid, email FROM auth.users
  WHERE raw_app_meta_data->>'provider' = 'google' AND email IS NOT NULL
),
email_users AS (
  SELECT id AS email_uid, email FROM auth.users
  WHERE raw_app_meta_data->>'provider' = 'email' AND email IS NOT NULL
),
pairs AS (
  SELECT g.google_uid, e.email_uid, g.email
  FROM google_users g JOIN email_users e ON g.email = e.email
)
SELECT
  p.google_uid AS target_user_id,
  p.email,
  -- XP: take the higher value
  GREATEST(COALESCE(gs.xp, 0), COALESCE(es.xp, 0))                         AS new_xp,
  -- generations: take the higher value
  GREATEST(COALESCE(gs.generations_total, 0), COALESCE(es.generations_total, 0)) AS new_generations_total,
  -- streak: take the higher value
  GREATEST(COALESCE(gs.streak, 0), COALESCE(es.streak, 0))                  AS new_streak,
  -- voice_profile: prefer google's if set, else take email's
  CASE WHEN gs.voice_profile IS NOT NULL THEN gs.voice_profile
       ELSE es.voice_profile END                                              AS new_voice_profile,
  -- tweet_dna: use whichever array is longer
  CASE WHEN COALESCE(array_length(gs.tweet_dna, 1), 0) >=
            COALESCE(array_length(es.tweet_dna, 1), 0)
       THEN gs.tweet_dna ELSE es.tweet_dna END                               AS new_tweet_dna,
  -- plan: google user's public.users row is source of truth
  pu.plan                                                                    AS plan_unchanged
FROM pairs p
LEFT JOIN aminta_state gs ON gs.user_id = p.google_uid
LEFT JOIN aminta_state es ON es.user_id = p.email_uid
LEFT JOIN public.users pu ON pu.id = p.google_uid;


-- ---------------------------------------------------------------------------
-- Step 3: MERGE — copy best values to google_uid row
-- ---------------------------------------------------------------------------
-- MANUAL CONFIRMATION REQUIRED BEFORE RUNNING THIS BLOCK.
-- Review Steps 1 and 2 output first. When satisfied, uncomment and run.
--
-- Safe to run multiple times (all updates are idempotent via GREATEST/COALESCE).
-- Does NOT delete the email_uid rows — that is a separate decision.

/*
WITH google_users AS (
  SELECT id AS google_uid, email FROM auth.users
  WHERE raw_app_meta_data->>'provider' = 'google' AND email IS NOT NULL
),
email_users AS (
  SELECT id AS email_uid, email FROM auth.users
  WHERE raw_app_meta_data->>'provider' = 'email' AND email IS NOT NULL
),
pairs AS (
  SELECT g.google_uid, e.email_uid
  FROM google_users g JOIN email_users e ON g.email = e.email
)
UPDATE aminta_state gs
SET
  xp               = GREATEST(gs.xp, COALESCE(es.xp, 0)),
  generations_total = GREATEST(gs.generations_total, COALESCE(es.generations_total, 0)),
  streak           = GREATEST(gs.streak, COALESCE(es.streak, 0)),
  voice_profile    = CASE WHEN gs.voice_profile IS NOT NULL THEN gs.voice_profile
                          ELSE es.voice_profile END,
  tweet_dna        = CASE
                       WHEN COALESCE(array_length(gs.tweet_dna, 1), 0) >=
                            COALESCE(array_length(es.tweet_dna, 1), 0)
                       THEN gs.tweet_dna
                       ELSE es.tweet_dna
                     END
FROM pairs p
JOIN aminta_state es ON es.user_id = p.email_uid
WHERE gs.user_id = p.google_uid;
*/


-- ---------------------------------------------------------------------------
-- Step 4: Verify after merge
-- ---------------------------------------------------------------------------
-- Re-run Step 1 after applying Step 3 to confirm all pairs now show
-- "google already ahead" and merged_xp matches expectations.


-- ---------------------------------------------------------------------------
-- NOTE: Deletion of orphaned email_uid rows
-- ---------------------------------------------------------------------------
-- DO NOT run any DELETE statements from this script.
-- Deletion of auth.users rows requires careful coordination:
--   - Only delete if the email_uid row has no active sessions / linked data
--   - Use supabase.auth.admin.deleteUser(email_uid) from a trusted server context
--   - Consider keeping orphaned rows indefinitely — they are inert once the
--     extension no longer writes to them
-- MANUAL CONFIRMATION REQUIRED BEFORE ANY DELETION.

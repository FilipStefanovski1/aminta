-- ─────────────────────────────────────────────────────────────────────────
-- Voice Refresh — weekly cooldown (replaces the 4-per-billing-period model)
--
-- Additive against supabase-migration-voice-refresh.sql: no new tables, no
-- dropped columns. reserve_voice_refresh(), refund_voice_refresh() AND
-- complete_voice_refresh() all get new bodies (the first two also need
-- DROP + CREATE, not CREATE OR REPLACE: reserve's parameter list changes,
-- and refund's RETURNS TABLE gains a column — Postgres refuses CREATE OR
-- REPLACE for either kind of change).
--
-- Product rule: ONE successful Voice Refresh every 168 hours (7*24), timed
-- from the user's own last successful refresh — not a billing period, not a
-- calendar week. 168 hours rather than "7 days" deliberately: Postgres
-- day-interval arithmetic on timestamptz is resolved in the session's
-- TimeZone and can shift by an hour across a DST boundary; an hour-interval
-- is a fixed elapsed duration regardless of timezone. The extension side
-- uses the identical 168*60*60*1000 constant so both layers agree exactly,
-- not "approximately".
--
-- What makes this a genuinely small migration: last_refresh_at already
-- exists and was already being written correctly by complete_voice_refresh
-- on every real success. The gate simply starts reading the column that was
-- already right, instead of the period-bucket machinery that was reading
-- something else. An existing production user's real last_refresh_at
-- becomes their cooldown anchor automatically — no backfill of that value
-- is needed or performed.
--
-- remaining is NOT redundant under this model despite eligibility now being
-- derived from last_refresh_at: last_refresh_at is only written at
-- COMPLETION (after the X fetch + Gemini call), so during that multi-second
-- window a second concurrent request would see last_refresh_at unchanged
-- and (wrongly) still look eligible if that were the only gate. remaining
-- is debited at RESERVATION time, before any of that I/O, which is what
-- still makes "10 simultaneous requests while eligible -> exactly one
-- succeeds" hold. The two columns now do two different jobs: remaining
-- guards concurrent access, last_refresh_at is the 7-day business rule.
--
-- remaining=0 left over from a PAST completed cycle looks identical, on the
-- row alone, to remaining=0 from an in-flight reservation THIS cycle — both
-- must be told apart before deciding whether a "lazy reset" of remaining to
-- 1 is due once the cooldown has elapsed. period_start is repurposed as
-- that disambiguator: complete_voice_refresh now stamps period_start to the
-- SAME instant as last_refresh_at on every genuine success, so
-- "period_start = last_refresh_at" is the signal "remaining=0 is the
-- correct resting state for the cycle that just ended, and is stale now
-- that the cooldown has elapsed" — reserve_voice_refresh resets it exactly
-- once, under the advisory lock, the first time that's true. A reservation
-- (successful or not) always re-stamps period_start to "now", which breaks
-- that equality until the NEXT completion re-establishes it — so a second
-- concurrent racer, or a legitimate future reservation still mid-flight,
-- never re-triggers the reset.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Normalize the existing row(s) to the new invariant ──────────────
-- remaining/allowance are vestiges of the 4-per-period model (an existing
-- production test account currently reads remaining=3, allowance=4). Reset
-- to the new model's resting state: remaining=1 means "nothing currently
-- reserved", which is true for every row today (no request is mid-flight).
-- This does NOT grant an early refresh — the very next reserve call still
-- gates on last_refresh_at first, before ever looking at remaining. See the
-- new reserve_voice_refresh body below.
UPDATE public.voice_refresh_balance SET remaining = 1, allowance = 1 WHERE remaining <> 1 OR allowance <> 1;

-- Safe now that every row satisfies it. Cheap defense against a future bug
-- ever writing remaining > 1.
ALTER TABLE public.voice_refresh_balance DROP CONSTRAINT IF EXISTS voice_refresh_balance_remaining_le_1;
ALTER TABLE public.voice_refresh_balance ADD CONSTRAINT voice_refresh_balance_remaining_le_1 CHECK (remaining <= 1);

-- ── 2. reserve_voice_refresh — new signature, cooldown-based gate ───────
-- period_kind/period_start/period_end parameters are dropped entirely: the
-- app layer no longer resolves a billing/monthly period for Voice Refresh
-- at all (lib/voiceRefresh/allowance.ts's periodKindFor/resolvePeriod call
-- is removed alongside this). The table's period_kind/period_start/
-- period_end COLUMNS are kept and still written (NOT NULL), now holding
-- "the current cooldown window" purely for operator/debugging visibility —
-- nothing reads them for gating decisions anymore.
DROP FUNCTION IF EXISTS public.reserve_voice_refresh(uuid, uuid, integer, text, timestamptz, timestamptz, text);

CREATE FUNCTION public.reserve_voice_refresh(
  p_user_id    uuid,
  p_request_id uuid,
  p_allowance  integer,  -- entitlement gate only: <=0 not entitled, >0 entitled (always 1 in practice)
  p_plan_key   text
)
RETURNS TABLE (out_ok boolean, out_remaining integer, out_reason text, out_next_eligible_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.voice_refresh_balance%ROWTYPE;
  v_now      timestamptz := now();
  v_cooldown constant interval := interval '168 hours';
BEGIN
  -- Serialize everything for this user — same lock as before, same reason:
  -- without it, two concurrent requests can both read remaining=1 and both
  -- debit, or both pass the cooldown check together.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Idempotent replay: this exact request already reserved.
  IF EXISTS (
    SELECT 1 FROM public.voice_refresh_ledger
    WHERE user_id = p_user_id AND request_id = p_request_id AND reason = 'reserve'
  ) THEN
    SELECT * INTO v_row FROM public.voice_refresh_balance WHERE user_id = p_user_id;
    RETURN QUERY SELECT true, COALESCE(v_row.remaining, 0), 'already_reserved'::text,
      CASE WHEN v_row.last_refresh_at IS NULL THEN NULL ELSE v_row.last_refresh_at + v_cooldown END;
    RETURN;
  END IF;

  IF p_allowance <= 0 THEN
    RETURN QUERY SELECT false, 0, 'not_entitled'::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Materialize a balance row for a brand-new user only. Never resets an
  -- EXISTING row's remaining/last_refresh_at/period_start here — there is
  -- no period rollover to lazily catch up to anymore, only the cooldown
  -- reset handled explicitly below.
  INSERT INTO public.voice_refresh_balance
    (user_id, remaining, allowance, period_kind, period_start, period_end, plan_key, last_refresh_at)
  VALUES (p_user_id, 1, 1, 'weekly', v_now, v_now + v_cooldown, p_plan_key, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.voice_refresh_balance WHERE user_id = p_user_id;

  -- The actual product rule. Fires before remaining is even consulted, so a
  -- stale/backfilled remaining value can never grant an early refresh.
  IF v_row.last_refresh_at IS NOT NULL AND v_now < v_row.last_refresh_at + v_cooldown THEN
    RETURN QUERY SELECT false, v_row.remaining, 'too_soon'::text, v_row.last_refresh_at + v_cooldown;
    RETURN;
  END IF;

  -- Cooldown has elapsed (or never applied). If remaining=0 is stale
  -- leftover from the cycle that just completed — see the header comment —
  -- this is the one place, under the lock, it gets reset to 1.
  IF v_row.remaining = 0
     AND v_row.last_refresh_at IS NOT NULL
     AND v_row.period_start = v_row.last_refresh_at THEN
    UPDATE public.voice_refresh_balance SET remaining = 1, updated_at = v_now WHERE user_id = p_user_id;
    v_row.remaining := 1;
  END IF;

  -- remaining=0 here means a reservation for this user is already in
  -- flight (reserved, not yet completed or refunded) — the concurrency
  -- guard. This is independent of the cooldown check above.
  IF v_row.remaining <= 0 THEN
    RETURN QUERY SELECT false, 0, 'already_in_progress'::text, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE public.voice_refresh_balance vb
     SET remaining = 0, allowance = 1, period_kind = 'weekly',
         period_start = v_now, period_end = v_now + v_cooldown,
         plan_key = p_plan_key, updated_at = v_now
   WHERE vb.user_id = p_user_id;

  INSERT INTO public.voice_refresh_ledger
    (user_id, request_id, reason, delta, period_start, plan_key)
  VALUES (p_user_id, p_request_id, 'reserve', -1, v_now, p_plan_key);

  RETURN QUERY SELECT true, 0, 'reserved'::text, NULL::timestamptz;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_voice_refresh(uuid, uuid, integer, text) TO service_role;

-- ── 3. refund_voice_refresh — same signature, +1 output column ─────────
-- The old period_start-equality guard on the UPDATE is dropped: it existed
-- to stop a refund from crediting the WRONG billing period after a rollover
-- mid-flight. Under this model there is only ever one outstanding
-- reservation per user at a time (enforced by the lock above — a second
-- concurrent reserve during the X/Gemini window sees remaining=0 and never
-- gets far enough to call refund at all), so that scenario can't arise; the
-- per-request_id idempotency check below remains the guard against a
-- duplicate/replayed refund call.
-- Postgres cannot change a function's OUT-parameter row type via CREATE OR
-- REPLACE (only reserve_voice_refresh's PARAMETER list changed above, which
-- is why that one needed DROP+CREATE; refund_voice_refresh's parameters are
-- unchanged but its RETURNS TABLE gained a column, which hits the same
-- restriction from the return-type side).
DROP FUNCTION IF EXISTS public.refund_voice_refresh(uuid, uuid);

CREATE FUNCTION public.refund_voice_refresh(
  p_user_id    uuid,
  p_request_id uuid
)
RETURNS TABLE (out_ok boolean, out_remaining integer, out_reason text, out_next_eligible_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserve  public.voice_refresh_ledger%ROWTYPE;
  v_row      public.voice_refresh_balance%ROWTYPE;
  v_cooldown constant interval := interval '168 hours';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_reserve FROM public.voice_refresh_ledger
   WHERE user_id = p_user_id AND request_id = p_request_id AND reason = 'reserve';

  IF v_reserve.id IS NULL THEN
    SELECT * INTO v_row FROM public.voice_refresh_balance WHERE user_id = p_user_id;
    RETURN QUERY SELECT false, COALESCE(v_row.remaining, 0), 'nothing_to_refund'::text,
      CASE WHEN v_row.last_refresh_at IS NULL THEN NULL ELSE v_row.last_refresh_at + v_cooldown END;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.voice_refresh_ledger
    WHERE user_id = p_user_id AND request_id = p_request_id AND reason = 'refund'
  ) THEN
    SELECT * INTO v_row FROM public.voice_refresh_balance WHERE user_id = p_user_id;
    RETURN QUERY SELECT true, COALESCE(v_row.remaining, 0), 'already_refunded'::text,
      CASE WHEN v_row.last_refresh_at IS NULL THEN NULL ELSE v_row.last_refresh_at + v_cooldown END;
    RETURN;
  END IF;

  -- last_refresh_at is deliberately untouched: refund only ever fires when
  -- complete_voice_refresh never ran for this attempt (X/Gemini failure
  -- before success), so there is nothing to undo there. Whatever
  -- eligibility existed before this reservation is restored exactly.
  UPDATE public.voice_refresh_balance vb
     SET remaining = LEAST(vb.remaining + 1, 1), updated_at = now()
   WHERE vb.user_id = p_user_id
   RETURNING vb.* INTO v_row;

  INSERT INTO public.voice_refresh_ledger
    (user_id, request_id, reason, delta, period_start, plan_key)
  VALUES (p_user_id, p_request_id, 'refund', 1, now(), v_reserve.plan_key);

  RETURN QUERY SELECT true, COALESCE(v_row.remaining, 0), 'refunded'::text,
    CASE WHEN v_row.last_refresh_at IS NULL THEN NULL ELSE v_row.last_refresh_at + v_cooldown END;
END;
$$;

-- DROP FUNCTION removes any GRANTs on the old signature/return type along
-- with it — must be re-issued, same as after reserve_voice_refresh's DROP+CREATE.
GRANT EXECUTE ON FUNCTION public.refund_voice_refresh(uuid, uuid) TO service_role;

-- ── 4. complete_voice_refresh — one line added ──────────────────────────
-- Already did exactly what this model needs on the last_refresh_at side:
-- set it to now() on the one genuine-success path, unconditionally by
-- user_id, nothing else. The one addition is period_start = now() in the
-- SAME UPDATE statement — two now() calls in one statement return the
-- identical (transaction-stable) timestamp, so this guarantees
-- period_start = last_refresh_at exactly on every real completion, which
-- is the signal reserve_voice_refresh's lazy-reset check above depends on.
-- Parameters and RETURNS void are unchanged, so CREATE OR REPLACE is fine
-- here — no DROP needed.
CREATE OR REPLACE FUNCTION public.complete_voice_refresh(
  p_user_id       uuid,
  p_request_id    uuid,
  p_posts_fetched integer,
  p_posts_used    integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.voice_refresh_ledger
     SET posts_fetched = p_posts_fetched, posts_used = p_posts_used
   WHERE user_id = p_user_id AND request_id = p_request_id AND reason = 'reserve';

  UPDATE public.voice_refresh_balance
     SET last_refresh_at = now(), period_start = now(), updated_at = now()
   WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.complete_voice_refresh(uuid, uuid, integer, integer) TO service_role;

-- ── 5. Verification ──────────────────────────────────────────────────────
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'reserve_voice_refresh'; -- expect 1 row, pronargs=4
-- SELECT user_id, remaining, allowance, last_refresh_at FROM public.voice_refresh_balance;
--   -- expect remaining=1, allowance=1 on every existing row; last_refresh_at UNCHANGED from before this migration
-- SELECT count(*) FROM public.voice_refresh_ledger;   -- expect UNCHANGED (no rows added/removed by this file)
-- SELECT count(*) FROM public.user_credits;            -- expect UNCHANGED
-- SELECT count(*) FROM public.credit_ledger;            -- expect UNCHANGED

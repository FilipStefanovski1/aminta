-- ===========================================================================
-- AMINTA CREDIT SYSTEM MIGRATION
-- ===========================================================================
-- Replaces the daily/monthly generation quota (plan_limits.daily_limit /
-- monthly_limit, enforced by a racy COUNT over ai_usage_log) with an
-- authoritative credit balance + append-only ledger.
--
-- SAFETY PROPERTIES
--   * Purely additive. No DROP, no DELETE, no data loss.
--   * ai_usage_log is untouched — all historical records survive, and the
--     15-min content scrub / 90-day record retention keep working exactly
--     as before.
--   * Idempotent: every statement is IF NOT EXISTS / ON CONFLICT, so
--     re-running is a no-op.
--   * plan_limits.daily_limit/monthly_limit are LEFT IN PLACE but stop
--     being read by the app. Keeping the columns (rather than dropping
--     them in the same pass) means a rollback is a code deploy, not a
--     schema restore. A follow-up migration can drop them once the credit
--     system has proven itself in production.
--
-- Run order: this file, then deploy the app. The app tolerates the tables
-- not existing yet only insofar as it fails closed (no credits => blocked),
-- so run this FIRST.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. users — billing period + gift expiry
-- ---------------------------------------------------------------------------
-- current_period_* mirror Creem's subscription.current_period_start_date /
-- current_period_end_date verbatim (see app/api/webhooks/creem/route.ts).
-- They are the source of truth for when a Pro user's credits renew.
--
-- gift_expires_at bounds ai_included_override. NULL = never expires, kept
-- only for permanent internal/team accounts; the grant helper below always
-- sets a real date so a gift can't silently become free Pro forever.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end   timestamptz,
  ADD COLUMN IF NOT EXISTS gift_expires_at      timestamptz;


-- ---------------------------------------------------------------------------
-- 2. public.user_credits — current balance + which period it belongs to
-- ---------------------------------------------------------------------------
-- One row per user. `period_start` is the identity of the current period:
-- when the app computes a different period_start than what's stored, the
-- period has rolled and the balance resets to `allowance`. That makes the
-- reset lazy (no cron can fail and strand someone at zero) and idempotent
-- (recomputing the same period is a no-op).
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id      uuid        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  balance      integer     NOT NULL,
  allowance    integer     NOT NULL,
  period_kind  text        NOT NULL,   -- 'day' | 'billing' | 'monthly'
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  plan_key     text        NOT NULL,   -- 'free' | 'pro' | 'lifetime' | 'gifted'
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_credits_balance_non_negative CHECK (balance >= 0)
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
-- Service-role only. The client never reads or writes this directly; the
-- balance reaches the extension through /api/sync's server-side read.


-- ---------------------------------------------------------------------------
-- 3. public.credit_ledger — append-only audit trail
-- ---------------------------------------------------------------------------
-- Every balance movement, forever (well, until the retention sweep below).
-- Exists so "why does this user have N credits" is always answerable, and
-- so reserve/refund can be made idempotent per (user, request, reason).
--
-- Contains NO generated content — only the request id, a delta, and a
-- reason. Safe to keep for the full 90-day operational window.
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id    uuid,       -- NULL for grants/resets that aren't tied to a generation
  delta         integer     NOT NULL,   -- negative = reserve, positive = refund/grant
  reason        text        NOT NULL,   -- 'reserve' | 'refund' | 'reset' | 'grant'
  balance_after integer     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- THE idempotency guarantee for charging. A second 'reserve' for the same
-- (user, request) can't be inserted, so a retried generation cannot be
-- charged twice — and neither can a duplicated refund double-credit.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_request_reason_idx
  ON public.credit_ledger (user_id, request_id, reason)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
  ON public.credit_ledger (user_id, created_at DESC);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 4. public.ai_config — Free-tier spend cap
-- ---------------------------------------------------------------------------
-- Free users gaining Included AI creates a brand-new cost centre. Without a
-- dedicated cap, free traffic could exhaust the GLOBAL cap and take Included
-- AI down for paying Pro/Founder users — the failure mode we most need to
-- avoid. These are checked in addition to (never instead of) the existing
-- global caps, which stay as the emergency failsafe.
--
-- Values here are the LOW, conservative defaults; see the migration report
-- for the sizing rationale. Editable at runtime with no redeploy.
ALTER TABLE public.ai_config
  ADD COLUMN IF NOT EXISTS free_daily_spend_cap_usd   numeric(10,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS free_monthly_spend_cap_usd numeric(10,2) NOT NULL DEFAULT 30.00;


-- ---------------------------------------------------------------------------
-- 4b. ai_usage_log.plan_key — attribute spend to the tier that incurred it
-- ---------------------------------------------------------------------------
-- The Free sub-cap needs "how much have FREE users spent today". Deriving
-- that by joining to users.plan would misattribute history the moment a user
-- upgrades (their past free-tier spend would suddenly count as Pro spend, and
-- vice versa). Recording the plan AT GENERATION TIME is the only stable
-- attribution.
--
-- Nullable with no default: pre-existing rows stay NULL and are simply not
-- counted toward the free cap, which is correct — they were all generated
-- under the old Pro-only model, so none of them was free-tier spend.
ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS plan_key text;

-- Partial index: the free-cap query only ever scans successful free rows in a
-- recent window, so indexing just those keeps it cheap as the table grows.
CREATE INDEX IF NOT EXISTS ai_usage_log_plan_created_idx
  ON public.ai_usage_log (plan_key, created_at DESC)
  WHERE status = 'success';


-- ---------------------------------------------------------------------------
-- 5. reserve_credit() — the atomic spend
-- ---------------------------------------------------------------------------
-- Everything that makes credits correct under concurrency happens here, in
-- ONE transaction, serialized per user by an advisory lock (same pattern as
-- claim_inflight_slot in supabase-setup.sql section 10.2):
--
--   1. lock the user
--   2. create the row on first use
--   3. roll the period + reset the balance if the period changed
--   4. return the existing reservation if this request already paid
--      (idempotent retry — never double-charge)
--   5. refuse if the balance is short
--   6. decrement + write the ledger row
--
-- Because 3-6 are inside the lock, two concurrent requests fighting over
-- the final credit cannot both win: the loser sees the decremented balance
-- and gets ok=false.
--
-- Reserve-then-refund (rather than charge-on-success) is deliberate: the
-- provider call can take up to 15s, and during that window the credit must
-- already be spoken for or the balance can be oversold by parallel requests.
CREATE OR REPLACE FUNCTION public.reserve_credit(
  p_user_id      uuid,
  p_request_id   uuid,
  p_cost         integer,
  p_allowance    integer,
  p_period_kind  text,
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_plan_key     text
)
RETURNS TABLE (out_ok boolean, out_balance integer, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       public.user_credits%ROWTYPE;
  v_existing  integer;
BEGIN
  -- Serialize everything below per user.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_row FROM public.user_credits WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance, allowance, period_kind, period_start, period_end, plan_key)
    VALUES (p_user_id, p_allowance, p_allowance, p_period_kind, p_period_start, p_period_end, p_plan_key)
    RETURNING * INTO v_row;

    INSERT INTO public.credit_ledger (user_id, request_id, delta, reason, balance_after)
    VALUES (p_user_id, NULL, p_allowance, 'reset', v_row.balance);

  ELSIF v_row.period_start IS DISTINCT FROM p_period_start
     OR v_row.plan_key     IS DISTINCT FROM p_plan_key
     OR v_row.allowance    IS DISTINCT FROM p_allowance THEN
    -- Period rolled, or the user's plan/allowance changed (upgrade,
    -- downgrade, gift expiry). Either way: fresh allowance, no rollover.
    UPDATE public.user_credits
       SET balance      = p_allowance,
           allowance    = p_allowance,
           period_kind  = p_period_kind,
           period_start = p_period_start,
           period_end   = p_period_end,
           plan_key     = p_plan_key,
           updated_at   = now()
     WHERE user_id = p_user_id
    RETURNING * INTO v_row;

    INSERT INTO public.credit_ledger (user_id, request_id, delta, reason, balance_after)
    VALUES (p_user_id, NULL, p_allowance, 'reset', v_row.balance);
  END IF;

  -- Free actions (cost 0) still return the live balance so callers can show
  -- it, but never touch the ledger.
  IF p_cost <= 0 THEN
    RETURN QUERY SELECT true, v_row.balance, 'free_action'::text;
    RETURN;
  END IF;

  -- Already charged for this exact request? Return success without charging
  -- again. This is what makes a retried generation cost exactly one credit.
  SELECT cl.balance_after INTO v_existing
    FROM public.credit_ledger cl
   WHERE cl.user_id = p_user_id AND cl.request_id = p_request_id AND cl.reason = 'reserve';

  IF FOUND THEN
    RETURN QUERY SELECT true, v_row.balance, 'already_reserved'::text;
    RETURN;
  END IF;

  IF v_row.balance < p_cost THEN
    RETURN QUERY SELECT false, v_row.balance, 'insufficient_credits'::text;
    RETURN;
  END IF;

  UPDATE public.user_credits uc
     SET balance = uc.balance - p_cost, updated_at = now()
   WHERE uc.user_id = p_user_id
  RETURNING uc.* INTO v_row;

  INSERT INTO public.credit_ledger (user_id, request_id, delta, reason, balance_after)
  VALUES (p_user_id, p_request_id, -p_cost, 'reserve', v_row.balance);

  RETURN QUERY SELECT true, v_row.balance, 'reserved'::text;
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. refund_credit() — give it back when the provider fails
-- ---------------------------------------------------------------------------
-- A failed generation must ultimately cost 0. Refund is idempotent via the
-- same unique ledger index, and refuses to refund a request that was never
-- reserved (so a bogus/duplicated refund can't mint credits).
--
-- Never refunds across a period boundary: if the period already rolled, the
-- reservation belonged to a period that no longer exists and the balance has
-- already been reset to full — adding to it would hand out free credits.
CREATE OR REPLACE FUNCTION public.refund_credit(
  p_user_id    uuid,
  p_request_id uuid
)
RETURNS TABLE (out_ok boolean, out_balance integer, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.user_credits%ROWTYPE;
  v_reserve public.credit_ledger%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_reserve
    FROM public.credit_ledger
   WHERE user_id = p_user_id AND request_id = p_request_id AND reason = 'reserve';

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.user_credits WHERE user_id = p_user_id;
    RETURN QUERY SELECT false, COALESCE(v_row.balance, 0), 'nothing_to_refund'::text;
    RETURN;
  END IF;

  -- Already refunded — idempotent no-op.
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
     WHERE user_id = p_user_id AND request_id = p_request_id AND reason = 'refund'
  ) THEN
    SELECT * INTO v_row FROM public.user_credits WHERE user_id = p_user_id;
    RETURN QUERY SELECT true, v_row.balance, 'already_refunded'::text;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.user_credits WHERE user_id = p_user_id;

  IF v_reserve.created_at < v_row.period_start THEN
    RETURN QUERY SELECT false, v_row.balance, 'period_rolled'::text;
    RETURN;
  END IF;

  UPDATE public.user_credits uc
     SET balance = LEAST(uc.balance + ABS(v_reserve.delta), uc.allowance), updated_at = now()
   WHERE uc.user_id = p_user_id
  RETURNING uc.* INTO v_row;

  INSERT INTO public.credit_ledger (user_id, request_id, delta, reason, balance_after)
  VALUES (p_user_id, p_request_id, ABS(v_reserve.delta), 'refund', v_row.balance);

  RETURN QUERY SELECT true, v_row.balance, 'refunded'::text;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7. grant_gift() — bounded gifted access
-- ---------------------------------------------------------------------------
-- The ONLY supported way to hand out gifted Included AI. Sets the override
-- AND an expiry together, so a gift can never be created without an end
-- date by accident. Usage:
--     SELECT public.grant_gift('user-uuid', 1);   -- 1 month
--     SELECT public.grant_gift('user-uuid', 3);   -- 3 months
--     SELECT public.grant_gift('user-uuid', 6);   -- 6 months
-- Extending an existing gift stacks from whichever is later (now vs the
-- current expiry), so re-granting never accidentally shortens a gift.
CREATE OR REPLACE FUNCTION public.grant_gift(p_user_id uuid, p_months integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires timestamptz;
BEGIN
  SELECT GREATEST(COALESCE(gift_expires_at, now()), now()) + (p_months || ' months')::interval
    INTO v_expires
    FROM public.users WHERE id = p_user_id;

  UPDATE public.users
     SET ai_included_override = true,
         gift_expires_at      = v_expires,
         updated_at           = now()
   WHERE id = p_user_id;

  RETURN v_expires;
END;
$$;


-- ---------------------------------------------------------------------------
-- 8. Grants — service_role only
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.reserve_credit(uuid, uuid, integer, integer, text, timestamptz, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_gift(uuid, integer) TO service_role;


-- ---------------------------------------------------------------------------
-- 9. BACKFILL — initialize existing accounts
-- ---------------------------------------------------------------------------
-- Deliberately does NOT look at historical ai_usage_log usage. Everyone
-- starts their first credit period at FULL allowance:
--   * ai_usage_log is currently empty, so there is no usage to honour.
--   * Charging someone for generations made under the old quota system
--     (which they were told was a different allowance) would be unfair and
--     could produce a confusing partial balance on day one.
-- No row can be negative — balance is seeded to allowance, and the CHECK
-- constraint enforces >= 0 from then on.
--
-- Live counts at time of writing: 8 free, 2 pro (both paid_via='manual'),
-- 0 lifetime, 0 gifted. Free rows get a UTC-day period; the 2 manual Pro
-- accounts have no Creem subscription and therefore no billing period, so
-- resolvePeriod() falls back to a monthly roll for them — handled here by
-- seeding a 30-day window from now.
INSERT INTO public.user_credits (user_id, balance, allowance, period_kind, period_start, period_end, plan_key)
SELECT
  u.id,
  p.allowance,
  p.allowance,
  p.period_kind,
  p.period_start,
  p.period_end,
  p.plan_key
FROM public.users u
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN u.ai_included_override THEN 'gifted' ELSE u.plan END AS plan_key,
    CASE
      WHEN u.ai_included_override THEN 1000
      WHEN u.plan = 'pro'         THEN 1000
      WHEN u.plan = 'lifetime'    THEN 1000
      ELSE 5
    END AS allowance,
    CASE
      WHEN u.ai_included_override OR u.plan IN ('pro','lifetime') THEN
        CASE WHEN u.plan = 'pro' AND u.current_period_start IS NOT NULL THEN 'billing' ELSE 'monthly' END
      ELSE 'day'
    END AS period_kind,
    CASE
      WHEN u.ai_included_override OR u.plan IN ('pro','lifetime')
        THEN COALESCE(u.current_period_start, date_trunc('day', now()))
      ELSE date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    END AS period_start,
    CASE
      WHEN u.ai_included_override OR u.plan IN ('pro','lifetime')
        THEN COALESCE(u.current_period_end, date_trunc('day', now()) + interval '30 days')
      ELSE (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') + interval '1 day'
    END AS period_end
) p
ON CONFLICT (user_id) DO NOTHING;   -- re-runnable; never clobbers a live balance


-- ---------------------------------------------------------------------------
-- 10. VERIFICATION
-- ---------------------------------------------------------------------------
-- SELECT plan_key, count(*), min(balance), max(balance)
--   FROM public.user_credits GROUP BY plan_key;
-- Expected today: free=8 (balance 5), pro=2 (balance 1000).
--
-- SELECT count(*) FROM public.user_credits WHERE balance < 0;
-- Expected: 0 (also enforced by the CHECK constraint).
--
-- SELECT count(*) FROM public.ai_usage_log;
-- Expected: unchanged by this migration.
--
-- SELECT free_daily_spend_cap_usd, free_monthly_spend_cap_usd,
--        global_daily_spend_cap_usd, global_monthly_spend_cap_usd
--   FROM public.ai_config;
-- Expected: 2.00 / 30.00 / 20.00 / 300.00

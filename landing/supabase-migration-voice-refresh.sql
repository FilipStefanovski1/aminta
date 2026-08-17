-- ─────────────────────────────────────────────────────────────────────────
-- Voice Refresh — X connection + per-period refresh allowance
--
-- Additive only. Touches nothing that exists: no changes to users,
-- user_credits, credit_ledger, ai_config, ai_usage_log, reserve_credit, or
-- refund_credit. Voice Refresh costs 0 Included AI credits and never calls
-- the credit functions.
--
-- Run order: this file, then deploy. The app fails closed without
-- reserve_voice_refresh() (no allowance => refresh blocked), so running it
-- first is safe and running it late is not.
--
-- Allowance model mirrors credit_ledger deliberately: append-only, a
-- partial-unique index for idempotency, and an advisory lock for
-- serialization. Two concurrent refreshes on the last remaining allowance
-- must consume at most one.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. OAuth state ───────────────────────────────────────────────────────
-- Short-lived, single-use. user_id here is the ONLY identity the callback
-- trusts — never a query parameter — which is what stops one signed-in
-- Aminta user from capturing another's authorization callback.
CREATE TABLE IF NOT EXISTS public.x_oauth_states (
  state         text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS x_oauth_states_expires_idx
  ON public.x_oauth_states (expires_at);

-- ── 2. Connection ────────────────────────────────────────────────────────
-- Tokens are AES-256-GCM ciphertext produced in the Node layer; the
-- encryption key lives in a Vercel env var and never reaches Postgres, so a
-- database dump yields ciphertext and nothing usable.
--
-- x_user_id is UNIQUE: one X account cannot be attached to two Aminta
-- accounts, which would let one user's refreshes be billed to another's
-- allowance.
CREATE TABLE IF NOT EXISTS public.x_connections (
  user_id              uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  x_user_id            text NOT NULL UNIQUE,
  x_username           text,
  access_token_cipher  text NOT NULL,
  refresh_token_cipher text,
  token_expires_at     timestamptz,
  connected_at         timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Allowance ledger ──────────────────────────────────────────────────
-- Append-only. Deliberately holds NO post text, post ids, or any X content:
-- only counts, so the raw corpus stays ephemeral by construction rather
-- than by discipline.
CREATE TABLE IF NOT EXISTS public.voice_refresh_ledger (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id    uuid NOT NULL,
  reason        text NOT NULL,          -- 'reserve' | 'refund' | 'reset'
  delta         integer NOT NULL,
  period_start  timestamptz NOT NULL,
  plan_key      text,
  posts_fetched integer,
  posts_used    integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: one reserve and one refund per (user, request). A retry of
-- the same refresh cannot consume a second allowance.
CREATE UNIQUE INDEX IF NOT EXISTS voice_refresh_request_reason_idx
  ON public.voice_refresh_ledger (user_id, request_id, reason);

CREATE INDEX IF NOT EXISTS voice_refresh_user_period_idx
  ON public.voice_refresh_ledger (user_id, period_start);

-- ── 4. Balance state ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voice_refresh_balance (
  user_id      uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  remaining    integer NOT NULL CHECK (remaining >= 0),
  allowance    integer NOT NULL,
  period_kind  text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  plan_key     text NOT NULL,
  last_refresh_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 5. reserve_voice_refresh ─────────────────────────────────────────────
-- Output columns are out_* on purpose: a RETURNS TABLE column named
-- `remaining` collides with voice_refresh_balance.remaining inside the
-- function body (Postgres 42702, "column reference is ambiguous"). The
-- credits migration hit exactly this and it only surfaced under real
-- Postgres, never under a mocked client.
CREATE OR REPLACE FUNCTION public.reserve_voice_refresh(
  p_user_id      uuid,
  p_request_id   uuid,
  p_allowance    integer,
  p_period_kind  text,
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_plan_key     text
)
RETURNS TABLE (out_ok boolean, out_remaining integer, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.voice_refresh_balance%ROWTYPE;
  v_existing integer;
BEGIN
  -- Serialize everything for this user. Without it, two requests can both
  -- read remaining=1 and both debit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Idempotent replay: this request already consumed an allowance.
  SELECT count(*) INTO v_existing
  FROM public.voice_refresh_ledger
  WHERE user_id = p_user_id AND request_id = p_request_id AND reason = 'reserve';

  IF v_existing > 0 THEN
    SELECT * INTO v_row FROM public.voice_refresh_balance WHERE user_id = p_user_id;
    RETURN QUERY SELECT true, COALESCE(v_row.remaining, 0), 'already_reserved'::text;
    RETURN;
  END IF;

  IF p_allowance <= 0 THEN
    RETURN QUERY SELECT false, 0, 'not_entitled'::text;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.voice_refresh_balance WHERE user_id = p_user_id;

  -- No row, a rolled period, a changed plan, or a changed allowance all mean
  -- "start this period fresh". period_start is the identity, so the reset is
  -- lazy and needs no cron.
  IF v_row.user_id IS NULL
     OR v_row.period_start <> p_period_start
     OR v_row.plan_key <> p_plan_key
     OR v_row.allowance <> p_allowance THEN
    INSERT INTO public.voice_refresh_balance
      (user_id, remaining, allowance, period_kind, period_start, period_end, plan_key)
    VALUES
      (p_user_id, p_allowance, p_allowance, p_period_kind, p_period_start, p_period_end, p_plan_key)
    ON CONFLICT (user_id) DO UPDATE SET
      remaining = p_allowance, allowance = p_allowance, period_kind = p_period_kind,
      period_start = p_period_start, period_end = p_period_end,
      plan_key = p_plan_key, updated_at = now();

    INSERT INTO public.voice_refresh_ledger
      (user_id, request_id, reason, delta, period_start, plan_key)
    VALUES (p_user_id, p_request_id, 'reset', p_allowance, p_period_start, p_plan_key)
    ON CONFLICT DO NOTHING;

    SELECT * INTO v_row FROM public.voice_refresh_balance WHERE user_id = p_user_id;
  END IF;

  IF v_row.remaining < 1 THEN
    RETURN QUERY SELECT false, v_row.remaining, 'no_refreshes_left'::text;
    RETURN;
  END IF;

  UPDATE public.voice_refresh_balance vb
     SET remaining = vb.remaining - 1, updated_at = now()
   WHERE vb.user_id = p_user_id
   RETURNING vb.remaining INTO v_existing;

  INSERT INTO public.voice_refresh_ledger
    (user_id, request_id, reason, delta, period_start, plan_key)
  VALUES (p_user_id, p_request_id, 'reserve', -1, p_period_start, p_plan_key);

  RETURN QUERY SELECT true, v_existing, 'reserved'::text;
END;
$$;

-- ── 6. refund_voice_refresh ──────────────────────────────────────────────
-- Safe to call on every failure path, including ones that never reserved.
CREATE OR REPLACE FUNCTION public.refund_voice_refresh(
  p_user_id    uuid,
  p_request_id uuid
)
RETURNS TABLE (out_ok boolean, out_remaining integer, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserve  public.voice_refresh_ledger%ROWTYPE;
  v_refunded integer;
  v_remaining integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_reserve
  FROM public.voice_refresh_ledger
  WHERE user_id = p_user_id AND request_id = p_request_id AND reason = 'reserve';

  IF v_reserve.id IS NULL THEN
    SELECT vb.remaining INTO v_remaining FROM public.voice_refresh_balance vb WHERE vb.user_id = p_user_id;
    RETURN QUERY SELECT false, COALESCE(v_remaining, 0), 'nothing_to_refund'::text;
    RETURN;
  END IF;

  SELECT count(*) INTO v_refunded
  FROM public.voice_refresh_ledger
  WHERE user_id = p_user_id AND request_id = p_request_id AND reason = 'refund';

  IF v_refunded > 0 THEN
    SELECT vb.remaining INTO v_remaining FROM public.voice_refresh_balance vb WHERE vb.user_id = p_user_id;
    RETURN QUERY SELECT true, COALESCE(v_remaining, 0), 'already_refunded'::text;
    RETURN;
  END IF;

  -- Only refund into the period the reservation belongs to. If the period
  -- rolled between reserve and refund the balance was already reset to full,
  -- and adding one would hand out a free extra refresh.
  UPDATE public.voice_refresh_balance vb
     SET remaining = LEAST(vb.remaining + 1, vb.allowance), updated_at = now()
   WHERE vb.user_id = p_user_id AND vb.period_start = v_reserve.period_start
   RETURNING vb.remaining INTO v_remaining;

  INSERT INTO public.voice_refresh_ledger
    (user_id, request_id, reason, delta, period_start, plan_key)
  VALUES (p_user_id, p_request_id, 'refund', 1, v_reserve.period_start, v_reserve.plan_key);

  IF v_remaining IS NULL THEN
    SELECT vb.remaining INTO v_remaining FROM public.voice_refresh_balance vb WHERE vb.user_id = p_user_id;
  END IF;

  RETURN QUERY SELECT true, COALESCE(v_remaining, 0), 'refunded'::text;
END;
$$;

-- ── 7. Mark a reservation as successfully completed ──────────────────────
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
     SET last_refresh_at = now(), updated_at = now()
   WHERE user_id = p_user_id;
$$;

-- ── 8. RLS + grants ──────────────────────────────────────────────────────
-- Service-role only, no policies — same posture as user_credits and
-- credit_ledger. These tables hold OAuth material and must never be
-- reachable with a user JWT.
ALTER TABLE public.x_oauth_states       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_connections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_refresh_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_refresh_balance ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.x_oauth_states, public.x_connections,
              public.voice_refresh_ledger, public.voice_refresh_balance
  FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_voice_refresh(uuid, uuid, integer, text, timestamptz, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_voice_refresh(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_voice_refresh(uuid, uuid, integer, integer) TO service_role;

-- ── 9. Verification ──────────────────────────────────────────────────────
-- SELECT count(*) FROM public.x_connections;                  -- expect 0
-- SELECT count(*) FROM public.voice_refresh_balance;          -- expect 0
-- SELECT count(*) FROM public.voice_refresh_ledger;           -- expect 0
-- SELECT count(*) FROM public.user_credits;                   -- expect UNCHANGED (10)
-- SELECT count(*) FROM public.credit_ledger;                  -- expect UNCHANGED
-- SELECT proname FROM pg_proc WHERE proname LIKE '%voice_refresh%';  -- expect 3

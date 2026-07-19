-- ===========================================================================
-- Aminta: plan / paid_via integrity fix
-- ===========================================================================
-- Run this in the Supabase SQL Editor, top to bottom.
--
-- WHY: a support report showed a user with plan = 'pro' and paid_via = NULL.
-- The Creem webhook (app/api/webhooks/creem/route.ts) sets plan, paid_via,
-- subscription_status, creem_customer_id, and creem_subscription_id in one
-- single `.update()` call for both the "subscription.active" and
-- "checkout.completed" events — there is no code path in this app where
-- plan can be set to "pro" or "lifetime" without paid_via also being set in
-- the same statement. A single Postgres UPDATE is atomic; it cannot apply
-- partially. That rules out "the webhook only updated part of the record"
-- as an explanation.
--
-- What CAN produce plan = 'pro' with paid_via = NULL is a manual edit in the
-- Supabase table editor (or a manual SQL UPDATE) that only touched `plan`.
-- Nothing in application code guards against that today — this migration
-- adds a real Postgres constraint so it becomes structurally impossible
-- going forward, regardless of whether the write comes from application
-- code or a manual edit.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. DIAGNOSTIC — find every row in this inconsistent state right now.
-- ---------------------------------------------------------------------------
-- Run this first. Cross-check the emails against your Creem dashboard: if a
-- row here is NOT a real paying customer in Creem, it was a manual edit
-- (test data, a support workaround, etc.) and step 2's default (paid_via =
-- 'manual') is the honest label for it. If a row here IS a real Creem
-- customer, the fact that paid_via is NULL despite that means something
-- external to this app's webhook wrote `plan` directly (e.g. an old script,
-- a different integration) — worth finding before you rely on step 2 alone.

SELECT id, email, plan, paid_via, subscription_status, creem_customer_id, created_at
FROM public.users
WHERE plan <> 'free' AND paid_via IS NULL;


-- ---------------------------------------------------------------------------
-- 2. BACKFILL — make existing bad rows satisfy the new constraint.
-- ---------------------------------------------------------------------------
-- Default: label them 'manual' rather than downgrading their plan. Revoking
-- a real customer's access without checking Creem first is a worse mistake
-- than leaving an honestly-labeled manual grant in place. If step 1 showed
-- rows that are confirmed NOT real customers, change this to downgrade them
-- instead:
--
--   UPDATE public.users SET plan = 'free', subscription_status = NULL
--   WHERE plan <> 'free' AND paid_via IS NULL;

UPDATE public.users
SET paid_via = 'manual'
WHERE plan <> 'free' AND paid_via IS NULL;


-- ---------------------------------------------------------------------------
-- 3. CONSTRAINT — make this state impossible going forward.
-- ---------------------------------------------------------------------------
-- Enforced by Postgres itself, so it also catches manual table-editor edits,
-- not just application code. Safe to re-run (drops before adding).

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_requires_paid_via;

ALTER TABLE public.users
  ADD CONSTRAINT users_plan_requires_paid_via
  CHECK (plan = 'free' OR paid_via IS NOT NULL);


-- ---------------------------------------------------------------------------
-- 4. VERIFY
-- ---------------------------------------------------------------------------
-- Should return zero rows.

SELECT id, email, plan, paid_via
FROM public.users
WHERE plan <> 'free' AND paid_via IS NULL;

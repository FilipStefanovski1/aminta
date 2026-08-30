-- ===========================================================================
-- AgentaOS billing migration.
--
-- Aminta is migrating new checkout initiation from Creem to AgentaOS. This
-- does NOT replace the existing plan/credit architecture — it adds the
-- columns AgentaOS's webhook events need, alongside the Creem columns,
-- which stay untouched so any pre-existing Creem subscriber keeps working
-- exactly as before. `plan`, `subscription_status`, `current_period_start`,
-- `current_period_end` remain the one canonical set of columns every credit/
-- entitlement check already reads (lib/ai/credits.ts's resolvePeriod,
-- lib/entitlements.ts's hasProAccess) — AgentaOS just becomes a second
-- writer into those same columns, the same way Creem already is.
--
-- Real limitation this migration works around: AgentaOS's subscription.*
-- webhook events (created/renewed/payment_failed/canceled) carry NO
-- metadata and NO customer/session id — only their own subscription id,
-- customer_email, plan_name, status, amount_minor, current_period_end. The
-- one event that DOES carry our metadata.userId is checkout.session.completed,
-- fired once at first payment. agentaos_customers below is the bridge: it's
-- populated ONLY inside the verified webhook handler from checkout metadata
-- (never from client input, never from the buyer's typed checkout email),
-- keyed on the exact email Aminta itself sent as buyerEmail at checkout
-- creation. Later subscription.* events resolve the owning user by that
-- email once, then by agentaos_subscription_id on every event after.
-- ===========================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billing_provider          text,   -- 'creem' | 'agentaos' | null (pre-migration Free users)
  ADD COLUMN IF NOT EXISTS agentaos_customer_email    text,   -- the email Aminta sent as buyerEmail at checkout — set once, read-only after
  ADD COLUMN IF NOT EXISTS agentaos_subscription_id   text;   -- AgentaOS's own subscription id, set on subscription.created

CREATE UNIQUE INDEX IF NOT EXISTS users_agentaos_subscription_id_idx
  ON public.users (agentaos_subscription_id)
  WHERE agentaos_subscription_id IS NOT NULL;

-- public.agentaos_customers
-- The trusted email->user_id bridge described above. One row per user who
-- has ever completed an AgentaOS Pro checkout. Written only by the webhook
-- handler (service-role), never by any client-reachable code path.
CREATE TABLE IF NOT EXISTS public.agentaos_customers (
  customer_email  text        PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agentaos_customers ENABLE ROW LEVEL SECURITY;
-- Service-role only — this table is never read by an authenticated user's
-- own session, only by the webhook handler resolving events.

-- public.agentaos_webhook_events
-- Idempotency ledger. AgentaOS's docs don't document a dedicated event id
-- on subscription.* payloads the way checkout.session.completed has one
-- (see the `evt_...` `id` field on the outer envelope) — that outer `id` IS
-- present on every event type per the documented envelope shape
-- ({ id, type, data }), so it's used here uniformly as the idempotency key
-- for every AgentaOS event, the same role event ids already play for most
-- webhook systems.
CREATE TABLE IF NOT EXISTS public.agentaos_webhook_events (
  event_id     text        PRIMARY KEY,
  event_type   text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agentaos_webhook_events ENABLE ROW LEVEL SECURITY;
-- Service-role only.

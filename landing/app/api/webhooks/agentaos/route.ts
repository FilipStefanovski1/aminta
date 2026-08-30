// AgentaOS webhook handler — the entitlement-mutating half of the
// migration. Writes into the SAME `users` columns the existing Creem
// webhook and every credit/entitlement check already use (plan,
// subscription_status, current_period_start/end) — this is a second
// writer into one canonical model, not a parallel one. See
// supabase-migration-agentaos.sql's header comment for the identity-binding
// design this route implements.
import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getPostHogClient } from "@/lib/posthog-server"
import { agentaosWebhookSecret } from "@/lib/agentaos/config"
import {
  verifyAgentaosSignature,
  parseAgentaosEvent,
  extractValidatedUserId,
  extractPlan,
  extractEmail,
  type AgentaosEvent,
} from "@/lib/agentaos/webhooks"

// Pro renews monthly; AgentaOS's subscription.* events give current_period_end
// but no current_period_start (see webhooks.ts's header comment). Deriving
// start as one calendar month before end reproduces the same shape
// lib/ai/credits.ts's resolvePeriod() already validates (a well-formed,
// non-inverted window containing `now`), from the one boundary AgentaOS
// actually reports.
export function derivePeriodStart(periodEndIso: string): string {
  const end = new Date(periodEndIso)
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - 1)
  return start.toISOString()
}

/** True once `iso` is in the past relative to `now` — treated as "not the fallback" only when unparsable. */
export function isPast(iso: string | null, now: number): boolean {
  if (!iso) return true
  const t = Date.parse(iso)
  return Number.isNaN(t) ? true : t <= now
}

async function alreadyProcessed(supabase: Awaited<ReturnType<typeof createServiceClient>>, eventId: string): Promise<boolean> {
  const { error } = await supabase.from("agentaos_webhook_events").insert({ event_id: eventId, event_type: "" })
  // A unique-violation on the primary key means this event id was already
  // recorded — genuinely idempotent regardless of delivery order or retry
  // timing, unlike an upfront SELECT-then-INSERT which has a race window.
  if (error) {
    if (error.code === "23505") return true
    throw error
  }
  return false
}

export async function POST(request: NextRequest) {
  let secret: string
  try {
    secret = agentaosWebhookSecret()
  } catch {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const rawBody = await request.text()
  const verification = verifyAgentaosSignature(rawBody, request.headers.get("x-agentaos-signature"), secret)
  if (!verification.ok) {
    return NextResponse.json({ error: `Invalid signature (${verification.reason})` }, { status: 401 })
  }

  const event = parseAgentaosEvent(rawBody)
  if (!event) {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Dedupe on the outer event id before any mutation — every AgentaOS event
  // type carries one (see webhooks.ts). A retried delivery is a 200 no-op
  // from here on, never a second grant/reset.
  if (await alreadyProcessed(supabase, event.id)) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const posthog = getPostHogClient()
  // Analytics identity is always the Supabase UUID, matching the Creem
  // webhook's own resolveAnalyticsId() convention — never an email.
  const captureForUser = (userId: string, name: string, properties?: Record<string, unknown>) => {
    posthog.capture({ distinctId: userId, event: name, ...(properties ? { properties } : {}) })
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(supabase, event, captureForUser)
    } else if (event.type === "subscription.created") {
      await handleSubscriptionCreated(supabase, event)
    } else if (event.type === "subscription.renewed") {
      await handleSubscriptionRenewed(supabase, event)
    } else if (event.type === "subscription.payment_failed") {
      await handleSubscriptionPaymentFailed(supabase, event)
    } else if (event.type === "subscription.canceled") {
      await handleSubscriptionCanceled(supabase, event, captureForUser)
    }
    // Any other event type (send.completed, send.failed, future types) is
    // intentionally ignored — Aminta has no billing behavior tied to them.
  } catch (e) {
    console.error("[AgentaOS webhook] handler failed", { eventId: event.id, type: event.type, detail: e instanceof Error ? e.message : e })
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

type Supabase = Awaited<ReturnType<typeof createServiceClient>>
type CaptureFn = (userId: string, name: string, properties?: Record<string, unknown>) => void

async function handleCheckoutCompleted(
  supabase: Supabase,
  event: Extract<AgentaosEvent, { type: "checkout.session.completed" }>,
  capture: CaptureFn
): Promise<void> {
  const userId = extractValidatedUserId(event.data.metadata)
  const plan = extractPlan(event.data.metadata)
  if (!userId || !plan) {
    // Never guess an owner from the buyer's checkout email — a checkout
    // with no valid metadata.userId simply grants nothing.
    console.error("[AgentaOS webhook] checkout.session.completed missing valid metadata", { eventId: event.id })
    return
  }
  const email = extractEmail(event.data.metadata)

  if (plan === "founder") {
    // One-time purchase. Lifetime entitlement, no subscription semantics —
    // mirrors Creem's existing isLifetime branch exactly: no billing
    // period columns (the credit system's rolling-monthly fallback already
    // covers Founder/Gifted, see resolvePeriod()'s "monthly" branch).
    await supabase
      .from("users")
      .update({
        plan: "lifetime",
        paid_via: "card",
        billing_provider: "agentaos",
        subscription_status: "active",
      })
      .eq("id", userId)
    capture(userId, "subscription_activated", { plan: "lifetime", provider: "agentaos" })
    return
  }

  // Pro. Grant access immediately from this event alone — do not wait on
  // subscription.created for the user to become Pro, since a lost/delayed
  // webhook must never leave a paying user unentitled. Billing-period
  // columns are filled in moments later by subscription.created; until
  // then resolvePeriod() already falls back safely to the monthly roll.
  await supabase
    .from("users")
    .update({
      plan: "pro",
      paid_via: "card",
      billing_provider: "agentaos",
      subscription_status: "active",
      ...(email ? { agentaos_customer_email: email } : {}),
    })
    .eq("id", userId)

  // The trusted bridge subscription.* events resolve through — populated
  // ONLY here, from server-supplied metadata, never from buyer input.
  if (email) {
    await supabase.from("agentaos_customers").upsert({ customer_email: email, user_id: userId }, { onConflict: "customer_email" })
  }

  capture(userId, "subscription_activated", { plan: "pro", provider: "agentaos" })
}

/** Resolves the Aminta user_id owning an AgentaOS subscription event, preferring the subscription id once known. */
async function resolveSubscriptionOwner(supabase: Supabase, subscriptionId: string, customerEmail: string | null): Promise<string | null> {
  const byId = await supabase.from("users").select("id").eq("agentaos_subscription_id", subscriptionId).maybeSingle()
  if (byId.data) return byId.data.id
  if (!customerEmail) return null
  const byEmail = await supabase.from("agentaos_customers").select("user_id").eq("customer_email", customerEmail.toLowerCase().trim()).maybeSingle()
  return byEmail.data?.user_id ?? null
}

async function handleSubscriptionCreated(
  supabase: Supabase,
  event: Extract<AgentaosEvent, { type: "subscription.created" }>
): Promise<void> {
  const email = event.data.customer_email?.toLowerCase().trim() ?? null
  const userId = await resolveSubscriptionOwner(supabase, event.data.id, email)
  if (!userId) {
    // Known limitation — see webhooks.ts's header comment: if the buyer
    // edited the pre-filled email at AgentaOS's hosted checkout, or this
    // event races ahead of checkout.session.completed, there is no id to
    // resolve by yet. Fails closed: no mutation, logged for investigation.
    // Pro access was already granted at checkout.session.completed and is
    // unaffected — only the precise billing-period window isn't set yet.
    console.error("[AgentaOS webhook] subscription.created: could not resolve owning user", { eventId: event.id, subscriptionId: event.data.id })
    return
  }

  const patch: Record<string, unknown> = {
    agentaos_subscription_id: event.data.id,
    subscription_status: "active",
  }
  if (event.data.current_period_end) {
    patch.current_period_end = event.data.current_period_end
    patch.current_period_start = derivePeriodStart(event.data.current_period_end)
  }
  await supabase.from("users").update(patch).eq("id", userId)
}

async function handleSubscriptionRenewed(
  supabase: Supabase,
  event: Extract<AgentaosEvent, { type: "subscription.renewed" }>
): Promise<void> {
  const email = event.data.customer_email?.toLowerCase().trim() ?? null
  const userId = await resolveSubscriptionOwner(supabase, event.data.id, email)
  if (!userId) {
    console.error("[AgentaOS webhook] subscription.renewed: could not resolve owning user", { eventId: event.id, subscriptionId: event.data.id })
    return
  }
  if (!event.data.current_period_end) return

  const periodStart = derivePeriodStart(event.data.current_period_end)
  // Only move forward — mirrors the Creem handler's own guard exactly, so
  // a duplicate/out-of-order delivery for a period already stored is a
  // no-op rather than rewinding a user into a finished period (and, via
  // the credit system's period-change-driven reset, cannot double-grant).
  await supabase
    .from("users")
    .update({
      subscription_status: "active",
      current_period_start: periodStart,
      current_period_end: event.data.current_period_end,
      agentaos_subscription_id: event.data.id,
    })
    .eq("id", userId)
    .or(`current_period_start.is.null,current_period_start.lt.${periodStart}`)
}

async function handleSubscriptionPaymentFailed(
  supabase: Supabase,
  event: Extract<AgentaosEvent, { type: "subscription.payment_failed" }>
): Promise<void> {
  const email = event.data.customer_email?.toLowerCase().trim() ?? null
  const userId = await resolveSubscriptionOwner(supabase, event.data.id, email)
  if (!userId) {
    console.error("[AgentaOS webhook] subscription.payment_failed: could not resolve owning user", { eventId: event.id, subscriptionId: event.data.id })
    return
  }
  // past_due only — matches Creem's existing subscription.past_due
  // handling exactly. Never touch current_period_start/end: a failed
  // renewal must not fabricate a fresh successful period, and must not
  // erase the period the user already paid for.
  await supabase.from("users").update({ subscription_status: "past_due" }).eq("id", userId)
}

async function handleSubscriptionCanceled(
  supabase: Supabase,
  event: Extract<AgentaosEvent, { type: "subscription.canceled" }>,
  capture: CaptureFn
): Promise<void> {
  const email = event.data.customer_email?.toLowerCase().trim() ?? null
  const userId = await resolveSubscriptionOwner(supabase, event.data.id, email)
  if (!userId) {
    console.error("[AgentaOS webhook] subscription.canceled: could not resolve owning user", { eventId: event.id, subscriptionId: event.data.id })
    return
  }

  // AgentaOS documents exactly one terminal subscription-cancellation event
  // ("terminal; no further charges") — unlike Creem, which has two distinct
  // events (canceled = intent, access continues; expired = access actually
  // over). AgentaOS's docs don't resolve which of those this single event
  // means. Handling both interpretations safely: if the reported period
  // has already elapsed, treat it like Creem's `expired` (downgrade now,
  // matching a provider that only fires once access is truly over); if the
  // period is still in the future, treat it like Creem's `canceled` (keep
  // Pro, access continues naturally until current_period_end via
  // resolvePeriod's own now < end check).
  if (isPast(event.data.current_period_end, Date.now())) {
    await supabase
      .from("users")
      .update({ plan: "free", subscription_status: "expired", current_period_start: null, current_period_end: null })
      .eq("id", userId)
      .neq("plan", "lifetime") // a Founder's one-time purchase is never touched by a subscription event
    capture(userId, "subscription_expired", { provider: "agentaos" })
  } else {
    await supabase.from("users").update({ subscription_status: "canceled" }).eq("id", userId)
    capture(userId, "subscription_canceled", { provider: "agentaos" })
  }
}

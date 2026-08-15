import { createServiceClient } from "@/lib/supabase/server"
import { NextResponse, type NextRequest } from "next/server"
import crypto from "crypto"
import { getPostHogClient } from "@/lib/posthog-server"

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch — a malformed header must be a
  // clean 401, not a 500.
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const secret = process.env.CREEM_WEBHOOK_SECRET
  if (!secret || secret === "we_will_add_this_later") {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  const payload = await request.text()
  const signature = request.headers.get("creem-signature") ?? ""

  if (!verifySignature(payload, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const event = JSON.parse(payload)
  const supabase = await createServiceClient()

  // Creem payload uses event.object, not event.data
  const obj = event.object ?? event.data ?? {}
  const email: string | undefined = obj.customer?.email
  const eventType: string = event.eventType ?? event.type ?? ""

  // Prefer matching by the Aminta user id we tag onto the checkout URL
  // (?metadata[user_id]=...) when the buyer clicked Upgrade while logged
  // in — this can't be broken by a mismatched or mistyped checkout email.
  // Falls back to email match for buyers who weren't logged in at checkout.
  const userId: string | undefined = obj.metadata?.user_id
  const userMatch = userId ? { column: "id", value: userId } : email ? { column: "email", value: email } : null

  if (!userMatch) return NextResponse.json({ ok: true })

  // Creem's subscription object carries the authoritative billing window.
  // Field names verified against docs.creem.io/code/webhooks:
  //   current_period_start_date / current_period_end_date (ISO 8601).
  // On checkout.completed the subscription may be nested under obj.subscription;
  // on subscription.* events obj IS the subscription. Read both shapes.
  const subscription = obj.object === "subscription" ? obj : (obj.subscription ?? {})
  const periodStart: string | null = subscription?.current_period_start_date ?? null
  const periodEnd: string | null = subscription?.current_period_end_date ?? null

  // Map Creem event types to plan status
  if (
    eventType === "subscription.active" ||
    eventType === "checkout.completed"
  ) {
    const isLifetime = obj.product?.billing_type === "onetime" || obj.order?.type === "onetime"
    const plan = isLifetime ? "lifetime" : "pro"

    await supabase
      .from("users")
      .update({
        plan,
        paid_via: "card",
        subscription_status: "active",
        creem_customer_id: obj.customer?.id,
        creem_subscription_id: subscription?.id ?? null,
        // Lifetime has no billing period — leave the columns null so the
        // credit system falls through to its rolling monthly window.
        ...(isLifetime ? {} : { current_period_start: periodStart, current_period_end: periodEnd }),
      })
      .eq(userMatch.column, userMatch.value)

    const posthog = getPostHogClient()
    posthog.capture({
      distinctId: email ?? userMatch.value,
      event: "subscription_activated",
      properties: { plan, event_type: eventType },
    })
    posthog.identify({ distinctId: email ?? userMatch.value, properties: { plan } })
  }

  // subscription.paid — a recurring payment was collected, i.e. a NEW billing
  // period started. This is the credit-renewal trigger for Pro.
  //
  // Idempotency is deliberately keyed on the PERIOD, not on the webhook's
  // event id: we only advance current_period_start when Creem reports a
  // period we haven't stored yet. A duplicate/replayed subscription.paid for
  // the same period writes the same values and grants nothing, because the
  // credit reset is driven by period_start changing (see
  // lib/ai/creditService.ts + reserve_credit()). That holds even if Creem
  // retries with a different event id, which an event-id-based dedupe table
  // would not survive.
  //
  // Note there is no credit write here at all: the balance resets lazily on
  // the user's next generation once the stored period no longer matches. So
  // a lost or late webhook can't strand a paying user at zero, and a
  // duplicate can't hand out a second 1,000.
  if (eventType === "subscription.paid") {
    if (periodStart && periodEnd) {
      await supabase
        .from("users")
        .update({
          subscription_status: "active",
          current_period_start: periodStart,
          current_period_end: periodEnd,
        })
        .eq(userMatch.column, userMatch.value)
        // Only move forward. A replayed webhook for an older period is a
        // no-op rather than rewinding a user into a period they've finished.
        .or(`current_period_start.is.null,current_period_start.lt.${periodStart}`)
    }
  }

  // Canceled = user turned off renewal; access continues until the period
  // ends, so the plan stays. Expired = the period actually ended — downgrade.
  if (eventType === "subscription.canceled") {
    await supabase
      .from("users")
      .update({ subscription_status: "canceled" })
      .eq(userMatch.column, userMatch.value)

    getPostHogClient().capture({
      distinctId: email ?? userMatch.value,
      event: "subscription_canceled",
    })
  }

  if (eventType === "subscription.expired") {
    await supabase
      .from("users")
      // Clearing the period is what drops them back to the free daily
      // allowance: with no billing window stored, the credit system resolves
      // them as a free user on a UTC-day period at their next generation.
      .update({ plan: "free", subscription_status: "expired", current_period_start: null, current_period_end: null })
      .eq(userMatch.column, userMatch.value)
      .neq("plan", "lifetime") // never downgrade lifetime purchases

    getPostHogClient().capture({
      distinctId: email ?? userMatch.value,
      event: "subscription_expired",
    })
  }

  if (eventType === "subscription.past_due") {
    await supabase
      .from("users")
      .update({ subscription_status: "past_due" })
      .eq(userMatch.column, userMatch.value)
  }

  return NextResponse.json({ ok: true })
}

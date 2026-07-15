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
        creem_subscription_id: obj.subscription?.id ?? null,
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
      .update({ plan: "free", subscription_status: "expired" })
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

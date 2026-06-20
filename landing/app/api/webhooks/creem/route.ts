import { createServiceClient } from "@/lib/supabase/server"
import { NextResponse, type NextRequest } from "next/server"
import crypto from "crypto"

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
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

  const email: string | undefined = event.data?.customer?.email
  const eventType: string = event.eventType ?? event.type ?? ""

  if (!email) return NextResponse.json({ ok: true })

  // Map Creem event types to plan status
  if (
    eventType === "subscription.active" ||
    eventType === "checkout.completed"
  ) {
    const isLifetime = event.data?.product?.price_type === "one_time"
    const plan = isLifetime ? "lifetime" : "pro"

    await supabase
      .from("users")
      .update({
        plan,
        paid_via: "card",
        subscription_status: "active",
        creem_customer_id: event.data?.customer?.id,
        creem_subscription_id: event.data?.subscription?.id ?? null,
      })
      .eq("email", email)
  }

  if (eventType === "subscription.canceled") {
    await supabase
      .from("users")
      .update({ subscription_status: "canceled" })
      .eq("email", email)
  }

  if (eventType === "subscription.past_due") {
    await supabase
      .from("users")
      .update({ subscription_status: "past_due" })
      .eq("email", email)
  }

  return NextResponse.json({ ok: true })
}

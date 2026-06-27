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

  // Creem payload uses event.object, not event.data
  const obj = event.object ?? event.data ?? {}
  const email: string | undefined = obj.customer?.email
  const eventType: string = event.eventType ?? event.type ?? ""

  if (!email) return NextResponse.json({ ok: true })

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

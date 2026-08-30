// The one canonical checkout entry point. Every paid-plan CTA (landing
// pricing, dashboard, extension Settings) routes through this endpoint
// rather than each surface building its own AgentaOS request — see
// components/Pricing.tsx.
//
// Client input is deliberately narrow: only `{ plan: "pro" | "founder" }`.
// linkId, price, and userId are never accepted from the request body —
// userId comes from the authenticated session, linkId is resolved
// server-side from plan via lib/agentaos/config.ts.
import { NextResponse, type NextRequest } from "next/server"
import { getRequestUser } from "@/lib/auth/requestUser"
import { createAgentaosCheckout, AgentaosCheckoutError } from "@/lib/agentaos/client"
import { founderSoldOut } from "@/lib/founder"

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.amintaapp.com").replace(/\/$/, "")
}

/**
 * The ONLY thing ever read from the client request body. Returns null for
 * anything else — an arbitrary linkId, price, userId, or unrecognized plan
 * string in the body is simply not "pro" or "founder" and is rejected,
 * never passed through to checkout creation.
 */
export function resolvePlanFromBody(body: unknown): "pro" | "founder" | null {
  const plan = (body as { plan?: unknown } | null)?.plan
  return plan === "pro" || plan === "founder" ? plan : null
}

export async function POST(request: NextRequest) {
  // Anonymous checkout is never allowed to bind an entitlement — an
  // unauthenticated click on Upgrade must resolve through Aminta's own
  // login flow before any checkout session is created.
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }
  const plan = resolvePlanFromBody(body)
  if (!plan) {
    return NextResponse.json({ error: "plan must be \"pro\" or \"founder\"." }, { status: 400 })
  }

  // Preserve the existing Founder-50 gate — checked here, server-side,
  // immediately before checkout creation, using the same canonical counter
  // /api/founder-availability already reads. This does not make the cap
  // atomic (a documented, pre-existing, app-level limitation — see
  // lib/founder.ts), it only ensures checkout can't even be initiated once
  // the cap is already visibly reached.
  if (plan === "founder" && (await founderSoldOut())) {
    return NextResponse.json({ error: "Founder access is sold out." }, { status: 409 })
  }

  const base = siteUrl()
  try {
    const session = await createAgentaosCheckout({
      plan,
      userId: user.id,
      buyerEmail: user.email ?? undefined,
      successUrl: `${base}/dashboard?payment=success`,
      cancelUrl: `${base}/#pricing`,
      webhookUrl: `${base}/api/webhooks/agentaos`,
    })
    return NextResponse.json({ checkoutUrl: session.checkoutUrl })
  } catch (e) {
    console.error("[AgentaOS] checkout creation failed", { plan, userId: user.id, detail: e instanceof Error ? e.message : e })
    const status = e instanceof AgentaosCheckoutError ? 502 : 500
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status })
  }
}

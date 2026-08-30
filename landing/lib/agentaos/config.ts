// Server-only AgentaOS configuration. Never import this from a "use client"
// component or anything bundled to the browser/extension — AGENTAOS_API_KEY
// and AGENTAOS_WEBHOOK_SECRET are real secrets, and this file is the only
// place that reads them.
//
// The two link ids are NOT secrets (they're public product identifiers you
// can see in any AgentaOS-hosted checkout URL), but they still live in env
// rather than being hardcoded in more than one place, so a plan's checkout
// destination is a one-line config change, never a code search-and-replace.

export type PaidPlan = "pro" | "founder"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export function agentaosApiKey(): string {
  return requireEnv("AGENTAOS_API_KEY")
}

export function agentaosWebhookSecret(): string {
  return requireEnv("AGENTAOS_WEBHOOK_SECRET")
}

// The ONLY place a plan name resolves to an AgentaOS payment-link id. The
// checkout route calls this with a plan value it already validated itself —
// never with anything read from the request body — so a client can select
// "pro" or "founder" but can never supply a linkId directly.
export function linkIdForPlan(plan: PaidPlan): string {
  const id = plan === "pro" ? process.env.AGENTAOS_PRO_LINK_ID : process.env.AGENTAOS_FOUNDER_LINK_ID
  if (!id) throw new Error(`Missing required env var: AGENTAOS_${plan.toUpperCase()}_LINK_ID`)
  return id
}

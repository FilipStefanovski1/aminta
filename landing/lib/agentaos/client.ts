// Thin, verifiable REST client for AgentaOS checkout creation. Deliberately
// a raw fetch against the documented endpoint (POST /gateway/sessions,
// verified against https://docs.agentaos.ai/api-reference/checkouts/create.md)
// rather than the @agentaos/pay SDK — the REST contract is fully documented
// field-by-field; the SDK's exact method signature for referencing an
// existing payment link by id was not independently confirmable, so this
// calls the API AgentaOS actually documents rather than guessing at a
// wrapper's shape. Server-only: never imported by client components.
import { agentaosApiKey, linkIdForPlan, type PaidPlan } from "./config"

const API_BASE = "https://api.agentaos.ai/api/v1"

export interface CreateCheckoutInput {
  plan: PaidPlan
  /** Aminta's own Supabase user id — the ONLY thing that determines entitlement ownership. */
  userId: string
  /** Prefill convenience only. AgentaOS's hosted checkout, not this call, decides what the buyer ultimately pays with. */
  buyerEmail?: string
  successUrl: string
  cancelUrl: string
  webhookUrl: string
}

export interface AgentaosCheckoutSession {
  id: string
  checkoutUrl: string
}

export class AgentaosCheckoutError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "AgentaosCheckoutError"
  }
}

/**
 * Creates a checkout session FROM the plan's configured payment link
 * (linkId), never from a raw amount — the link is the one place price is
 * actually defined, so a mistake here can only ever check someone out for
 * exactly what the Pro/Founder payment link is configured to charge.
 *
 * metadata.userId is the canonical entitlement owner, read back verbatim
 * on the checkout.session.completed webhook. metadata.email is stored
 * alongside it so the webhook handler can populate the agentaos_customers
 * bridge table with the exact email Aminta itself supplied — never the
 * value AgentaOS's own buyer-facing checkout form might independently
 * collect (see supabase-migration-agentaos.sql's header comment).
 */
export async function createAgentaosCheckout(input: CreateCheckoutInput): Promise<AgentaosCheckoutSession> {
  const res = await fetch(`${API_BASE}/gateway/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": agentaosApiKey(),
      // Same (userId, plan) can only ever mint one live session — a
      // double-click on Upgrade must not be able to create two sessions
      // that could both later complete and double-process.
      "Idempotency-Key": `checkout:${input.userId}:${input.plan}`,
    },
    body: JSON.stringify({
      linkId: linkIdForPlan(input.plan),
      buyerEmail: input.buyerEmail,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      webhookUrl: input.webhookUrl,
      metadata: {
        userId: input.userId,
        plan: input.plan,
        provider: "agentaos",
        ...(input.buyerEmail ? { email: input.buyerEmail } : {}),
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new AgentaosCheckoutError(`AgentaOS checkout creation failed (${res.status}): ${detail}`, res.status)
  }

  const json = (await res.json()) as { id: string; checkoutUrl: string }
  return { id: json.id, checkoutUrl: json.checkoutUrl }
}

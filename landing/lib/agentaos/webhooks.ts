// AgentaOS webhook signature verification and event typing.
//
// Signature scheme verified against https://docs.agentaos.ai/payments/webhooks.md:
// header `X-AgentaOS-Signature: t=<unix_seconds>,v1=<hex hmac-sha256>`, signed
// payload is `${t}.${rawBody}`, secret is AGENTAOS_WEBHOOK_SECRET (whsec_...),
// signatures older than 5 minutes are rejected (replay protection), digest
// comparison must be constant-time. Implemented directly against that
// documented algorithm rather than through the @agentaos/pay SDK's
// webhooks.verify() — functionally identical, and consistent with how
// app/api/webhooks/creem/route.ts already verifies HMAC signatures by hand
// rather than depending on a provider SDK.
import { createHmac, timingSafeEqual } from "crypto"

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000

export type AgentaosVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_header" | "malformed_header" | "expired" | "bad_signature" }

/** Parses `t=<seconds>,v1=<hex>` into its two parts, or null if malformed. */
function parseSignatureHeader(header: string): { t: string; v1: string } | null {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...rest] = kv.split("=")
      return [k.trim(), rest.join("=").trim()]
    })
  )
  if (!parts.t || !parts.v1) return null
  return { t: parts.t, v1: parts.v1 }
}

/**
 * Verifies an AgentaOS webhook signature. Pure function of its inputs (no
 * network, no env read) so it's directly unit-testable with fixtures — the
 * route wires in `agentaosWebhookSecret()` and `Date.now()`.
 */
export function verifyAgentaosSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  now: number = Date.now()
): AgentaosVerifyResult {
  if (!signatureHeader) return { ok: false, reason: "missing_header" }

  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) return { ok: false, reason: "malformed_header" }

  const timestampMs = Number(parsed.t) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_SIGNATURE_AGE_MS) {
    return { ok: false, reason: "expired" }
  }

  const expected = createHmac("sha256", secret).update(`${parsed.t}.${rawBody}`).digest("hex")
  const a = Buffer.from(parsed.v1)
  const b = Buffer.from(expected)
  // Malformed/wrong-length signature must be a clean rejection, never a
  // 500 from timingSafeEqual throwing on a length mismatch.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" }
  }
  return { ok: true }
}

// ─── Event payloads ───────────────────────────────────────────────────────
// Shapes verified against https://docs.agentaos.ai/webhooks/events.md.
// Every event shares the outer envelope { id, type, data, livemode } — `id`
// here is what agentaos_webhook_events.event_id dedupes on for every event
// type, since subscription.* payloads (unlike checkout.session.completed)
// carry no id of their own inside `data`.

export interface AgentaosCheckoutCompletedData {
  link_id: string | null
  session_id: string
  amount: string
  currency: string
  rail: string
  metadata: Record<string, unknown> | null
  livemode: boolean
}

// created/renewed/payment_failed/canceled all share this exact shape —
// AgentaOS's docs confirm "the same data shape" across every subscription
// event. Notably: NO metadata, NO customer id, NO checkout session id.
export interface AgentaosSubscriptionData {
  id: string
  status: string
  plan_name: string
  currency: string
  amount_minor: number
  current_period_end: string | null
  cancel_at_period_end: boolean
  customer_email: string | null
  customer_name: string | null
  livemode: boolean
}

// Each subscription event type gets its own union member (rather than one
// member with a `type: A | B | C | D` field) so `Extract<AgentaosEvent,
// { type: "..." }>` narrows correctly per event — a single member with a
// union-typed `type` field is not assignable to any one literal, so Extract
// would silently resolve to `never` for every one of them.
export type AgentaosEvent =
  | { id: string; type: "checkout.session.completed"; data: AgentaosCheckoutCompletedData }
  | { id: string; type: "subscription.created"; data: AgentaosSubscriptionData }
  | { id: string; type: "subscription.renewed"; data: AgentaosSubscriptionData }
  | { id: string; type: "subscription.payment_failed"; data: AgentaosSubscriptionData }
  | { id: string; type: "subscription.canceled"; data: AgentaosSubscriptionData }

/**
 * Returns null for malformed JSON. A well-formed envelope with an
 * unrecognized `type` (send.completed, send.failed, a future event) still
 * parses — the route's if-chain has no unmatched branch, so those are
 * silently ignored at runtime, never crashing. The exported type only
 * names the 5 events this route acts on; a truly unknown type is accepted
 * here and simply falls through every check in the route.
 */
export function parseAgentaosEvent(rawBody: string): AgentaosEvent | null {
  try {
    const json = JSON.parse(rawBody)
    if (!json || typeof json !== "object" || typeof json.id !== "string" || typeof json.type !== "string") return null
    return json as AgentaosEvent
  } catch {
    return null
  }
}

/** metadata.userId as AgentaOS echoes it back — validated as a UUID before any caller trusts it as an entitlement owner. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function extractValidatedUserId(metadata: Record<string, unknown> | null | undefined): string | null {
  const raw = metadata?.userId
  return typeof raw === "string" && UUID_RE.test(raw) ? raw : null
}

export function extractPlan(metadata: Record<string, unknown> | null | undefined): "pro" | "founder" | null {
  const raw = metadata?.plan
  return raw === "pro" || raw === "founder" ? raw : null
}

export function extractEmail(metadata: Record<string, unknown> | null | undefined): string | null {
  const raw = metadata?.email
  return typeof raw === "string" && raw.includes("@") ? raw.toLowerCase().trim() : null
}

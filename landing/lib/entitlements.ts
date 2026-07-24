// Single source of truth for "does this user have paid access." Every place
// that used to compute this independently (Pricing, the dashboard badge, the
// extension) must go through hasProAccess() instead of re-deriving it from
// `plan` alone — that's what let the dashboard show PRO while Pricing kept
// asking the same account to pay.
//
// Mirrored in extension/lib/entitlements.ts (a separate deployable app with
// no shared package) — keep the two in sync if this logic changes.

export type PlanTier = "free" | "pro" | "lifetime"

export interface UserSubscriptionState {
  plan?: string | null
  subscription_status?: string | null
}

// Statuses that don't revoke access. `active`/`trialing`/`paid` are normal
// paid states; `canceled` still has access because the Creem webhook only
// flips `plan` back to "free" on `subscription.expired` (turning off
// auto-renew keeps access through the period you already paid for — see
// app/api/webhooks/creem/route.ts). A missing status (null/undefined) is
// also treated as entitled: rows written before subscription_status existed,
// or a lifetime purchase, may never have one set.
const ENTITLED_STATUSES = new Set(["active", "trialing", "paid", "canceled"])

export function hasProAccess(user: UserSubscriptionState): boolean {
  const plan = user.plan ?? "free"

  // Lifetime is a one-time purchase, not a subscription — the webhook never
  // downgrades it regardless of subscription_status, so access checks must
  // not either.
  if (plan === "lifetime") return true

  if (plan !== "pro") return false

  return !user.subscription_status || ENTITLED_STATUSES.has(user.subscription_status)
}

export function planLabel(user: UserSubscriptionState): "FREE" | "PRO" | "FOUNDER" {
  const plan = user.plan ?? "free"
  if (plan === "lifetime") return "FOUNDER"
  if (plan === "pro" && hasProAccess(user)) return "PRO"
  return "FREE"
}

// Whether this user should get Included AI (Aminta's own backend-held
// provider key) instead of needing to BYOK. `aiIncludedOverride` is the
// mechanism for "Gifted" access — plan stays 'free' (so the
// users_plan_requires_paid_via CHECK constraint is never touched by a
// non-purchase), the override just adds the entitlement on top. This is the
// ONLY place that should compute this — app/api/generate/route.ts imports
// it rather than re-deriving hasProAccess()+override inline.
export function aiIncluded(
  user: UserSubscriptionState & { ai_included_override?: boolean | null }
): boolean {
  return hasProAccess(user) || !!user.ai_included_override
}

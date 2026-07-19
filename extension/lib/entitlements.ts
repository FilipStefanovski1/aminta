// Single source of truth for "does this user have paid access." Every place
// that used to compute this independently (HomeTab, sidepanel Settings,
// GeneratorPanel's free-tier limit) must go through hasProAccess() instead
// of re-deriving it from `plan` alone.
//
// Mirrored in landing/lib/entitlements.ts (a separate deployable app with no
// shared package) — keep the two in sync if this logic changes.

import type { AmintaStore, Plan } from "~lib/storage"

export interface UserSubscriptionState {
  plan?: Plan | null
  subscriptionStatus?: string | null
}

// Statuses that don't revoke access. `active`/`trialing`/`paid` are normal
// paid states; `canceled` still has access because the Creem webhook only
// flips `plan` back to "free" on `subscription.expired` (turning off
// auto-renew keeps access through the period you already paid for — see
// landing/app/api/webhooks/creem/route.ts). A missing status (null) is also
// treated as entitled: rows synced before subscription_status existed, or a
// lifetime purchase, may never have one set.
const ENTITLED_STATUSES = new Set(["active", "trialing", "paid", "canceled"])

export function hasProAccess(user: UserSubscriptionState): boolean {
  const plan = user.plan ?? "free"

  // Lifetime is a one-time purchase, not a subscription — the webhook never
  // downgrades it regardless of subscription_status, so access checks must
  // not either.
  if (plan === "lifetime") return true

  if (plan !== "pro") return false

  return !user.subscriptionStatus || ENTITLED_STATUSES.has(user.subscriptionStatus)
}

export function planLabel(user: UserSubscriptionState): "FREE" | "PRO" | "FOUNDER" {
  const plan = user.plan ?? "free"
  if (plan === "lifetime") return "FOUNDER"
  if (plan === "pro" && hasProAccess(user)) return "PRO"
  return "FREE"
}

// Convenience overload for the common case of passing the whole store.
export function storeHasProAccess(store: Pick<AmintaStore, "plan" | "subscriptionStatus">): boolean {
  return hasProAccess({ plan: store.plan, subscriptionStatus: store.subscriptionStatus })
}

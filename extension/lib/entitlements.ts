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

// THE single routing decision for "does this generate call go to Aminta's
// backend or straight to the user's own BYOK key." Every call site that
// dispatches a generation (backendGenerate.ts, GeneratorPanel.tsx,
// TemplatesModal.tsx, twitter-bridge.ts, styleProfile.ts) must go through
// this, not storeHasProAccess() or a local plan/subscriptionStatus check.
//
// Two reasons this is a distinct function from storeHasProAccess():
//  1. `aiIncluded` is the canonical, backend-computed entitlement (synced
//     via lib/sync.ts from the server's aiIncluded(), which also covers
//     gifted access: plan='free' + ai_included_override=true). A gifted
//     user is NOT storeHasProAccess() — that check only knows about
//     plan==='pro'/'lifetime' — so routing on storeHasProAccess() alone
//     silently stuck gifted users on BYOK even though the backend would
//     authorize them.
//  2. `providerMode` is a per-device UI toggle (Settings → AI Provider, see
//     sidepanel.tsx's SettingsOverlay — shown only when store.aiIncluded is
//     true; every aiIncluded user defaults to "included" until they switch
//     it). Centralizing the check here means that toggle only ever has to
//     set `store.providerMode`; every dispatch call site already reads
//     through this function and needed no further changes when it shipped.
//
// The backend independently re-verifies entitlement on every request
// regardless of what this returns (see app/api/generate/route.ts) — this
// is a client-side UX routing hint only, never a security boundary.
export function shouldUseIncludedAi(store: Pick<AmintaStore, "aiIncluded" | "providerMode">): boolean {
  return !!store.aiIncluded && store.providerMode !== "byok"
}

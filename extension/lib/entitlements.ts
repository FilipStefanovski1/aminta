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

// BYOK entitlement: Free users get Included AI only; Pro and Founder/
// lifetime can bring their own provider key. Identical to hasProAccess()
// today (paid access implies BYOK) — kept as its own named function so call
// sites express BYOK intent directly, and so the two can diverge later
// (e.g. a future paid tier without BYOK) without re-auditing every caller.
// Mirrored in landing/lib/entitlements.ts.
export function canUseByok(user: UserSubscriptionState): boolean {
  return hasProAccess(user)
}

// THE only BYOK key value any generation call site should ever read. A
// Free user can have a non-empty store.apiKey — entered back when BYOK was
// open to everyone, or placed directly into extension storage — and that
// value must never reach a provider call unless canUseByok() says so.
// Plan entitlement wins over mere presence of a key: never read
// store.apiKey directly at a generation/dispatch call site, go through this
// instead. (Settings UI/model pickers reading the raw stored value to
// populate a form field are a different concern and unaffected.)
export function effectiveApiKey(store: Pick<AmintaStore, "apiKey" | "plan" | "subscriptionStatus">): string {
  if (!canUseByok({ plan: store.plan, subscriptionStatus: store.subscriptionStatus })) return ""
  return store.apiKey ?? ""
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
export type ProviderMode = "included" | "byok"

/**
 * THE authoritative provider mode. One value, three consumers: the Settings
 * segmented control's selected state, whether the BYOK controls mount, and
 * generation dispatch.
 *
 * Previously each of those derived its own boolean, and they were not the
 * same expression — the segmented control used `providerMode !== "byok"`
 * while the other two used `aiIncluded && providerMode !== "byok"`. Any
 * state with aiIncluded=false and a stored providerMode of "included" made
 * them disagree: the control paints Included as selected while the BYOK
 * controls stay mounted, which is exactly the "Included selected but the API
 * key field is still there" report. Deriving all three from this function
 * makes that state unrepresentable rather than merely unlikely.
 *
 * Entitlement validation lives here, not at the call sites: no entitlement
 * means the mode IS "byok", so Included can never render as active for a
 * user who cannot use it.
 */
export function providerModeFor(store: Pick<AmintaStore, "aiIncluded" | "providerMode">): ProviderMode {
  if (!store.aiIncluded) return "byok"
  return store.providerMode === "byok" ? "byok" : "included"
}

export function shouldUseIncludedAi(store: Pick<AmintaStore, "aiIncluded" | "providerMode">): boolean {
  return providerModeFor(store) === "included"
}

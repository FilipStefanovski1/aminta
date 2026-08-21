// THE authoritative credit model for Included AI.
//
// Credits are a PRODUCT entitlement — how many Included AI actions a plan
// includes. They are deliberately NOT the same thing as:
//   * XP            — Aminta's progression/game currency (lib/xp.ts in the
//                     extension). Never mix the two in code or in UI.
//   * provider cost — the dollar amount Gemini bills us (see pricing.ts).
//                     1 credit does NOT mean "$0.001587". Credits are a
//                     round, user-facing unit; provider cost is accounting.
//
// Everything about "what does this action cost the user" lives here so the
// extension never hardcodes a `-1` anywhere, and so a future change (image
// generations costing 2, a premium model costing 3) is a one-line edit that
// the client physically cannot disagree with — the server is authoritative.

export type CreditedMode = "tweet" | "reply" | "polish" | "style_profile" | "thread"

// V1: every user-initiated Included AI action costs exactly 1 credit.
// style_profile is a background-ish extraction the user doesn't explicitly
// ask for, so it's free — charging for it would make a user's credits drain
// for something they never pressed a button for.
//
// thread costs 3, not 1 and not 3x-via-3-calls: it's still exactly ONE
// Gemini call (see lib/ai/prompts.ts's buildThreadMessages — one structured
// JSON response containing all 3 variants), but that one call produces
// roughly 3 threads' worth of output tokens versus a single tweet, so 1
// credit would undercharge relative to real cost and 3 credits reflects
// that honestly without penalizing the user for Aminta's own call-count
// choice.
const CREDIT_COSTS: Record<CreditedMode, number> = {
  tweet: 1,
  reply: 1,
  polish: 1,
  style_profile: 0,
  thread: 3,
}

// Internal/system callers (future Auto Voice Refresh, admin tooling) run
// Included AI without touching a user's balance. Routed as its own actor
// kind rather than a magic mode string so it can never be requested by a
// client — route.ts derives this server-side, never from the request body.
export type CreditActor = "user" | "system"

export function creditCostFor(mode: string, actor: CreditActor = "user"): number {
  if (actor === "system") return 0
  const cost = CREDIT_COSTS[mode as CreditedMode]
  // Unknown modes cost 1 rather than 0 — an unrecognized mode must never be
  // a free-generation loophole. route.ts validates the mode enum before we
  // ever get here, so this is defence in depth, not the primary gate.
  return cost === undefined ? 1 : cost
}

// ─── Plan allowances ───────────────────────────────────────────────────
// planKey matches plan_limits.plan ('free' | 'pro' | 'lifetime' | 'gifted').
// 'gifted' is synthetic — resolved in app code from ai_included_override,
// never a real users.plan value (see supabase-setup.sql section 9).
export type PeriodKind = "day" | "billing" | "monthly"

export interface PlanCreditPolicy {
  allowance: number
  periodKind: PeriodKind
}

// Free resets on the UTC calendar day; Pro follows the real Creem billing
// period; Founder (lifetime) and Gifted use a rolling 30-day month anchored
// to when their access started, since neither has a Creem billing cycle —
// a lifetime purchase has no renewal, and a gift isn't a subscription.
export const PLAN_CREDIT_POLICY: Record<string, PlanCreditPolicy> = {
  free:     { allowance: 5,    periodKind: "day" },
  pro:      { allowance: 1000, periodKind: "billing" },
  lifetime: { allowance: 1000, periodKind: "monthly" },
  gifted:   { allowance: 1000, periodKind: "monthly" },
}

export function policyFor(planKey: string): PlanCreditPolicy {
  // Fail closed: an unrecognized plan gets no credits rather than silently
  // inheriting someone else's allowance.
  return PLAN_CREDIT_POLICY[planKey] ?? { allowance: 0, periodKind: "day" }
}

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_DAYS = 30

/**
 * Resolves the credit period a user is currently in.
 *
 * Deliberately pure + fully injectable (`now`, the Creem dates, the anchor)
 * so every branch is unit-testable without a database or a live clock.
 *
 * - day     — UTC calendar day. Free resets at 00:00 UTC.
 * - billing — the real Creem subscription period. Falls back to a monthly
 *             roll ONLY if the dates are missing/unusable, so a webhook that
 *             hasn't landed yet can't strand a paying user at zero credits.
 * - monthly — rolling 30-day window anchored to `anchor` (account/gift
 *             start), advanced forward in whole periods so a dormant user
 *             returning after 6 months lands in the *current* window rather
 *             than replaying every missed one.
 */
export function resolvePeriod(
  kind: PeriodKind,
  now: Date,
  opts: {
    creemPeriodStart?: string | null
    creemPeriodEnd?: string | null
    anchor?: string | Date | null
  } = {}
): { start: Date; end: Date; kind: PeriodKind } {
  if (kind === "day") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    return { start, end: new Date(start.getTime() + DAY_MS), kind: "day" }
  }

  if (kind === "billing") {
    const s = opts.creemPeriodStart ? Date.parse(opts.creemPeriodStart) : NaN
    const e = opts.creemPeriodEnd ? Date.parse(opts.creemPeriodEnd) : NaN
    // Only trust a well-formed, non-inverted period that actually contains
    // `now`. A stale period (renewal webhook late/lost) falls through to the
    // monthly roll below rather than leaving the user permanently expired.
    if (!Number.isNaN(s) && !Number.isNaN(e) && e > s && now.getTime() < e) {
      return { start: new Date(s), end: new Date(e), kind: "billing" }
    }
    return { ...rollMonthly(now, opts.anchor ?? null), kind: "monthly" }
  }

  return { ...rollMonthly(now, opts.anchor ?? null), kind: "monthly" }
}

function rollMonthly(now: Date, anchor: string | Date | null): { start: Date; end: Date } {
  const anchorMs = anchor
    ? (anchor instanceof Date ? anchor.getTime() : Date.parse(anchor))
    : NaN
  const base = Number.isNaN(anchorMs) ? now.getTime() : anchorMs
  const periodMs = MONTH_DAYS * DAY_MS

  if (now.getTime() < base) {
    // Anchor is in the future (clock skew / bad data) — treat now as the
    // start rather than emitting a negative period index.
    return { start: new Date(now.getTime()), end: new Date(now.getTime() + periodMs) }
  }

  const elapsed = now.getTime() - base
  const periodsPassed = Math.floor(elapsed / periodMs)
  const start = new Date(base + periodsPassed * periodMs)
  return { start, end: new Date(start.getTime() + periodMs) }
}

/**
 * Whether a gifted entitlement is still active.
 *
 * A NULL expiry means "never expires" — kept as a deliberate escape hatch
 * for permanent internal/team accounts, but it is NOT the default: the
 * grant tooling always sets an expiry (see the migration's grant_gift
 * helper). Gifted access should be a gift with an end date, not accidental
 * free Pro forever.
 */
export function isGiftActive(giftExpiresAt: string | null | undefined, now: Date): boolean {
  if (!giftExpiresAt) return true
  const t = Date.parse(giftExpiresAt)
  if (Number.isNaN(t)) return false
  return now.getTime() < t
}

/**
 * The single place that decides which plan_limits/policy key a user resolves
 * to. Mirrors lib/entitlements.ts's aiIncluded() precedence, plus gift
 * expiry: an expired gift stops resolving to 'gifted' and falls back to the
 * user's real plan (normally 'free').
 */
export function resolvePlanKey(
  user: { plan: string; aiIncludedOverride: boolean; giftExpiresAt?: string | null },
  now: Date
): string {
  if (user.aiIncludedOverride && isGiftActive(user.giftExpiresAt, now)) return "gifted"
  return user.plan ?? "free"
}

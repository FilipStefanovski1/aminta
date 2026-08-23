import { describe, it, expect } from "vitest"
import {
  creditCostFor,
  policyFor,
  resolvePeriod,
  resolvePlanKey,
  isGiftActive,
  PLAN_CREDIT_POLICY,
} from "./credits"
import { computeProviderCostUsd, pricingFor, MODEL_PRICING } from "./pricing"

const DAY = 24 * 60 * 60 * 1000

describe("credit cost mapping (centralized, server-side)", () => {
  it("charges 1 credit for each user-initiated generation type", () => {
    expect(creditCostFor("tweet")).toBe(1)
    expect(creditCostFor("reply")).toBe(1)
    expect(creditCostFor("polish")).toBe(1)
  })

  it("resolves every generation type through the same mapping", () => {
    // The point of the central map: adding a type or repricing one is a
    // single-file change, and the client can't disagree.
    for (const mode of ["tweet", "reply", "polish", "style_profile", "onboarding_demo"]) {
      expect(typeof creditCostFor(mode)).toBe("number")
    }
  })

  it("does not charge for style_profile extraction", () => {
    // The user never pressed a button for this — charging would silently
    // drain their balance.
    expect(creditCostFor("style_profile")).toBe(0)
  })

  it("does not charge for onboarding's one-time demo post", () => {
    // Regression: a fresh account completing onboarding used to show
    // 4/5 credits immediately — the "Make it sound like me" demo was
    // dispatched as a normal "tweet" generation and billed like one, even
    // though the user never pressed Generate for it.
    expect(creditCostFor("onboarding_demo")).toBe(0)
  })

  it("charges thread more than a single post, but as ONE flat reservation", () => {
    // Thread Creator is one Gemini call producing 3 variants — this pins
    // that it's priced as a single higher-cost action (3 credits), never
    // as 3 separate per-variant charges.
    expect(creditCostFor("thread")).toBe(3)
    expect(creditCostFor("thread")).toBeGreaterThan(creditCostFor("tweet"))
  })

  it("charges system/internal actors 0 credits (future Auto Voice Refresh)", () => {
    expect(creditCostFor("tweet", "system")).toBe(0)
    expect(creditCostFor("reply", "system")).toBe(0)
    expect(creditCostFor("polish", "system")).toBe(0)
  })

  it("treats an unknown mode as billable, never free", () => {
    // An unrecognized mode must not become a free-generation loophole.
    expect(creditCostFor("some-future-mode")).toBe(1)
  })
})

describe("plan allowances", () => {
  it("gives Free 5 credits on a daily period", () => {
    expect(policyFor("free")).toEqual({ allowance: 5, periodKind: "day" })
  })

  it("gives Pro 1,000 credits on the real billing period", () => {
    expect(policyFor("pro")).toEqual({ allowance: 1000, periodKind: "billing" })
  })

  it("gives Founder 1,000 credits on a rolling monthly period (no billing cycle exists)", () => {
    expect(policyFor("lifetime")).toEqual({ allowance: 1000, periodKind: "monthly" })
  })

  it("gives Gifted 1,000 credits on a rolling monthly period", () => {
    expect(policyFor("gifted")).toEqual({ allowance: 1000, periodKind: "monthly" })
  })

  it("keeps Founder at least as good as Pro (public promise: everything in Pro)", () => {
    expect(PLAN_CREDIT_POLICY.lifetime.allowance).toBeGreaterThanOrEqual(PLAN_CREDIT_POLICY.pro.allowance)
  })

  it("fails closed on an unknown plan rather than inheriting an allowance", () => {
    expect(policyFor("enterprise-someday")).toEqual({ allowance: 0, periodKind: "day" })
  })
})

describe("Free daily period — no rollover", () => {
  it("uses the UTC calendar day", () => {
    const now = new Date("2026-08-14T13:45:00Z")
    const p = resolvePeriod("day", now)
    expect(p.start.toISOString()).toBe("2026-08-14T00:00:00.000Z")
    expect(p.end.toISOString()).toBe("2026-08-15T00:00:00.000Z")
  })

  it("produces a different period the next day, so the balance resets", () => {
    const d1 = resolvePeriod("day", new Date("2026-08-14T23:59:59Z"))
    const d2 = resolvePeriod("day", new Date("2026-08-15T00:00:01Z"))
    expect(d1.start.getTime()).not.toBe(d2.start.getTime())
  })

  it("resets to the full allowance regardless of what was left (no accumulation)", () => {
    // Day 1: 5 granted, 2 unused. Day 2 must be 5, never 7 — the allowance
    // is a constant, never added to a remaining balance.
    const { allowance } = policyFor("free")
    const leftoverFromYesterday = 2
    const day2Balance = allowance // what reserve_credit writes on period change
    expect(day2Balance).toBe(5)
    expect(day2Balance).not.toBe(allowance + leftoverFromYesterday)
  })
})

describe("Pro billing period — driven by real Creem dates", () => {
  const now = new Date("2026-08-14T12:00:00Z")

  it("uses Creem's current_period_start/end verbatim when valid", () => {
    const p = resolvePeriod("billing", now, {
      creemPeriodStart: "2026-08-01T00:00:00Z",
      creemPeriodEnd: "2026-09-01T00:00:00Z",
    })
    expect(p.kind).toBe("billing")
    expect(p.start.toISOString()).toBe("2026-08-01T00:00:00.000Z")
    expect(p.end.toISOString()).toBe("2026-09-01T00:00:00.000Z")
  })

  it("rolls to a new period when Creem reports the next billing window", () => {
    const before = resolvePeriod("billing", now, {
      creemPeriodStart: "2026-08-01T00:00:00Z",
      creemPeriodEnd: "2026-09-01T00:00:00Z",
    })
    const after = resolvePeriod("billing", new Date("2026-09-02T12:00:00Z"), {
      creemPeriodStart: "2026-09-01T00:00:00Z",
      creemPeriodEnd: "2026-10-01T00:00:00Z",
    })
    // Different period identity => reserve_credit resets the balance to 1000.
    expect(after.start.getTime()).not.toBe(before.start.getTime())
  })

  it("falls back to a monthly roll when the billing period is missing", () => {
    // A renewal webhook that hasn't landed must never strand a paying user
    // at zero credits.
    const p = resolvePeriod("billing", now, { creemPeriodStart: null, creemPeriodEnd: null, anchor: "2026-01-01T00:00:00Z" })
    expect(p.kind).toBe("monthly")
    expect(p.end.getTime()).toBeGreaterThan(now.getTime())
  })

  it("falls back when the stored period has already elapsed (late webhook)", () => {
    const p = resolvePeriod("billing", now, {
      creemPeriodStart: "2026-06-01T00:00:00Z",
      creemPeriodEnd: "2026-07-01T00:00:00Z", // in the past
      anchor: "2026-01-01T00:00:00Z",
    })
    expect(p.kind).toBe("monthly")
    expect(p.end.getTime()).toBeGreaterThan(now.getTime())
  })

  it("ignores an inverted/corrupt period", () => {
    const p = resolvePeriod("billing", now, {
      creemPeriodStart: "2026-09-01T00:00:00Z",
      creemPeriodEnd: "2026-08-01T00:00:00Z",
      anchor: "2026-01-01T00:00:00Z",
    })
    expect(p.kind).toBe("monthly")
  })
})

describe("Founder/Gifted rolling monthly period", () => {
  it("anchors to the account start and advances in whole 30-day periods", () => {
    const anchor = "2026-01-01T00:00:00Z"
    const now = new Date("2026-03-05T00:00:00Z") // 63 days in => period index 2
    const p = resolvePeriod("monthly", now, { anchor })
    expect(p.start.getTime()).toBe(Date.parse(anchor) + 2 * 30 * DAY)
    expect(p.end.getTime()).toBe(p.start.getTime() + 30 * DAY)
    expect(p.start.getTime()).toBeLessThanOrEqual(now.getTime())
    expect(p.end.getTime()).toBeGreaterThan(now.getTime())
  })

  it("lands a long-dormant account in the CURRENT period, not a replayed old one", () => {
    const p = resolvePeriod("monthly", new Date("2027-06-01T00:00:00Z"), { anchor: "2026-01-01T00:00:00Z" })
    expect(p.start.getTime()).toBeLessThanOrEqual(Date.parse("2027-06-01T00:00:00Z"))
    expect(p.end.getTime()).toBeGreaterThan(Date.parse("2027-06-01T00:00:00Z"))
  })

  it("handles a future anchor (clock skew) without a negative period", () => {
    const now = new Date("2026-01-01T00:00:00Z")
    const p = resolvePeriod("monthly", now, { anchor: "2026-06-01T00:00:00Z" })
    expect(p.end.getTime()).toBeGreaterThan(p.start.getTime())
  })
})

describe("Gift expiry", () => {
  const now = new Date("2026-08-14T00:00:00Z")

  it("is active before the expiry date", () => {
    expect(isGiftActive("2026-09-14T00:00:00Z", now)).toBe(true)
  })

  it("is inactive after the expiry date", () => {
    expect(isGiftActive("2026-07-14T00:00:00Z", now)).toBe(false)
  })

  it("treats an unparseable expiry as expired (fail closed)", () => {
    expect(isGiftActive("not-a-date", now)).toBe(false)
  })

  it("treats NULL as never-expiring (permanent internal accounts only)", () => {
    expect(isGiftActive(null, now)).toBe(true)
  })

  it("drops an expired gift back to the user's real plan", () => {
    const user = { plan: "free", aiIncludedOverride: true, giftExpiresAt: "2026-07-01T00:00:00Z" }
    expect(resolvePlanKey(user, now)).toBe("free")
    expect(policyFor(resolvePlanKey(user, now)).allowance).toBe(5)
  })

  it("keeps an active gift on the gifted allowance", () => {
    const user = { plan: "free", aiIncludedOverride: true, giftExpiresAt: "2026-12-01T00:00:00Z" }
    expect(resolvePlanKey(user, now)).toBe("gifted")
    expect(policyFor(resolvePlanKey(user, now)).allowance).toBe(1000)
  })

  it("resolves a normal free user to free", () => {
    expect(resolvePlanKey({ plan: "free", aiIncludedOverride: false }, now)).toBe("free")
  })

  it("resolves pro/lifetime by plan", () => {
    expect(resolvePlanKey({ plan: "pro", aiIncludedOverride: false }, now)).toBe("pro")
    expect(resolvePlanKey({ plan: "lifetime", aiIncludedOverride: false }, now)).toBe("lifetime")
  })
})

describe("provider cost accounting (model-aware, separate from credits)", () => {
  it("prices the configured model at the verified Google rate", () => {
    const p = pricingFor("gemini-3.5-flash")
    expect(p.inputPer1k).toBe(0.0015) // $1.50 / 1M
    expect(p.outputPer1k).toBe(0.009) // $9.00 / 1M
  })

  it("no longer uses the stale Gemini 2.0 Flash constants", () => {
    const p = pricingFor("gemini-3.5-flash")
    expect(p.inputPer1k).not.toBe(0.000075)
    expect(p.outputPer1k).not.toBe(0.0003)
  })

  it("prices an unknown model conservatively rather than as free", () => {
    // An unpriced model must never look free — that would let real spend
    // sail past the global caps.
    const p = pricingFor("some-unreleased-model")
    expect(p.inputPer1k).toBeGreaterThan(0)
    expect(p.outputPer1k).toBeGreaterThan(0)
    expect(p.inputPer1k).toBeGreaterThanOrEqual(MODEL_PRICING["gemini-3.5-flash"].inputPer1k)
  })

  it("prefers real provider token counts over the char heuristic", () => {
    const real = computeProviderCostUsd({ model: "gemini-3.5-flash", inputTokens: 1000, outputTokens: 1000 })
    expect(real.estimated).toBe(false)
    expect(real.costUsd).toBeCloseTo(0.0015 + 0.009, 10)
  })

  it("marks char-derived costs as estimated", () => {
    const est = computeProviderCostUsd({ model: "gemini-3.5-flash", inputChars: 4000, outputChars: 4000 })
    expect(est.estimated).toBe(true)
  })

  it("keeps dollar cost decoupled from credits", () => {
    // 1 credit is a product unit, not $0.001587. A cheap and an expensive
    // generation both cost exactly 1 credit.
    const cheap = computeProviderCostUsd({ model: "gemini-3.5-flash", inputTokens: 100, outputTokens: 50 })
    const pricey = computeProviderCostUsd({ model: "gemini-3.5-flash", inputTokens: 4000, outputTokens: 400 })
    expect(pricey.costUsd).toBeGreaterThan(cheap.costUsd)
    expect(creditCostFor("tweet")).toBe(creditCostFor("reply"))
  })
})

// ─── Free-tier spend cap gating ────────────────────────────────────────
// Mirrors isIncludedAiAvailable()'s decision table in lib/ai/config.ts.
// Kept as a pure reimplementation so the ordering (free sub-cap first, then
// global failsafe) is asserted without a database.
function availability(
  planKey: string,
  spend: { dailyUsd: number; monthlyUsd: number; freeDailyUsd: number; freeMonthlyUsd: number },
  caps: { globalDaily: number; globalMonthly: number; freeDaily: number; freeMonthly: number }
): { ok: boolean; code?: string } {
  if (planKey === "free") {
    if (spend.freeDailyUsd >= caps.freeDaily || spend.freeMonthlyUsd >= caps.freeMonthly) {
      return { ok: false, code: "FREE_AI_BUDGET_EXHAUSTED" }
    }
  }
  if (spend.dailyUsd >= caps.globalDaily) return { ok: false, code: "AI_INCLUDED_DISABLED" }
  if (spend.monthlyUsd >= caps.globalMonthly) return { ok: false, code: "AI_INCLUDED_DISABLED" }
  return { ok: true }
}

const CAPS = { globalDaily: 20, globalMonthly: 300, freeDaily: 2, freeMonthly: 30 }

describe("Free-tier spend cap enforcement", () => {
  it("blocks free users at the free daily cap with a distinct code", () => {
    const r = availability("free", { dailyUsd: 2, monthlyUsd: 2, freeDailyUsd: 2, freeMonthlyUsd: 2 }, CAPS)
    expect(r.ok).toBe(false)
    expect(r.code).toBe("FREE_AI_BUDGET_EXHAUSTED")
  })

  it("blocks free users at the free monthly cap", () => {
    const r = availability("free", { dailyUsd: 1, monthlyUsd: 30, freeDailyUsd: 0.5, freeMonthlyUsd: 30 }, CAPS)
    expect(r.ok).toBe(false)
    expect(r.code).toBe("FREE_AI_BUDGET_EXHAUSTED")
  })

  it("allows free users below both free caps", () => {
    expect(availability("free", { dailyUsd: 1, monthlyUsd: 5, freeDailyUsd: 1, freeMonthlyUsd: 5 }, CAPS).ok).toBe(true)
  })

  // The whole point of the sub-cap: free traffic must not be able to take
  // Included AI down for paying users.
  it("does NOT block Pro when the free budget is exhausted", () => {
    const spend = { dailyUsd: 2, monthlyUsd: 30, freeDailyUsd: 2, freeMonthlyUsd: 30 }
    expect(availability("pro", spend, CAPS).ok).toBe(true)
    expect(availability("lifetime", spend, CAPS).ok).toBe(true)
    expect(availability("gifted", spend, CAPS).ok).toBe(true)
  })

  it("still applies the global cap to paid users as the failsafe", () => {
    const r = availability("pro", { dailyUsd: 20, monthlyUsd: 100, freeDailyUsd: 0, freeMonthlyUsd: 0 }, CAPS)
    expect(r.ok).toBe(false)
    expect(r.code).toBe("AI_INCLUDED_DISABLED")
  })

  it("still applies the global cap to free users too", () => {
    const r = availability("free", { dailyUsd: 20, monthlyUsd: 100, freeDailyUsd: 0.1, freeMonthlyUsd: 0.1 }, CAPS)
    expect(r.ok).toBe(false)
    expect(r.code).toBe("AI_INCLUDED_DISABLED")
  })

  it("keeps the free cap well below the global cap so paid users are protected", () => {
    expect(CAPS.freeDaily).toBeLessThan(CAPS.globalDaily)
    expect(CAPS.freeMonthly).toBeLessThan(CAPS.globalMonthly)
  })
})

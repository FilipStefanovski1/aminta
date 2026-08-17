// Voice Refresh entitlement + period alignment.
//
// The concurrency and idempotency guarantees live in SQL (advisory lock +
// partial unique index) and are exercised against real Postgres, exactly as
// the credit system's were — a mocked client cannot prove them. What is
// testable in isolation is the policy: who gets refreshes, how many, and on
// which period boundary.
import { describe, it, expect } from "vitest"
import { refreshAllowanceFor } from "./allowance"
import { resolvePeriod, resolvePlanKey } from "@/lib/ai/credits"

describe("entitlement", () => {
  it("gives Pro 4 refreshes", () => {
    expect(refreshAllowanceFor("pro")).toBe(4)
  })

  it("gives Founder/Lifetime the same 4 as Pro", () => {
    expect(refreshAllowanceFor("lifetime")).toBe(4)
  })

  it("gives an active Gifted account the same 4 as Pro", () => {
    expect(refreshAllowanceFor("gifted")).toBe(4)
  })

  it("gives Free none", () => {
    expect(refreshAllowanceFor("free")).toBe(0)
  })

  it("fails closed on an unknown plan", () => {
    expect(refreshAllowanceFor("enterprise")).toBe(0)
    expect(refreshAllowanceFor("")).toBe(0)
  })
})

describe("plan resolution drives entitlement", () => {
  const now = new Date("2026-08-16T12:00:00Z")

  it("an expired gift drops back to no refreshes", () => {
    const planKey = resolvePlanKey(
      { plan: "free", aiIncludedOverride: true, giftExpiresAt: "2026-08-01T00:00:00Z" },
      now
    )
    expect(refreshAllowanceFor(planKey)).toBe(0)
  })

  it("an active gift gets the full 4", () => {
    const planKey = resolvePlanKey(
      { plan: "free", aiIncludedOverride: true, giftExpiresAt: "2026-09-01T00:00:00Z" },
      now
    )
    expect(planKey).toBe("gifted")
    expect(refreshAllowanceFor(planKey)).toBe(4)
  })

  it("a plain free account gets none", () => {
    const planKey = resolvePlanKey({ plan: "free", aiIncludedOverride: false, giftExpiresAt: null }, now)
    expect(refreshAllowanceFor(planKey)).toBe(0)
  })
})

describe("period reuse — no second billing implementation", () => {
  const now = new Date("2026-08-16T12:00:00Z")

  it("a Creem subscriber's refreshes follow the real billing period", () => {
    const p = resolvePeriod("billing", now, {
      creemPeriodStart: "2026-08-01T00:00:00Z",
      creemPeriodEnd: "2026-09-01T00:00:00Z",
    })
    expect(p.kind).toBe("billing")
    expect(p.end.toISOString()).toBe("2026-09-01T00:00:00.000Z")
  })

  it("a comped Pro with no Creem subscription uses the rolling monthly fallback", () => {
    const p = resolvePeriod("billing", now, {
      creemPeriodStart: null, creemPeriodEnd: null, anchor: "2026-07-29T00:00:00Z",
    })
    expect(p.kind).toBe("monthly")
  })

  it("Founder/Gifted use the monthly cycle", () => {
    expect(resolvePeriod("monthly", now, { anchor: "2026-01-01T00:00:00Z" }).kind).toBe("monthly")
  })

  it("periods roll forward rather than sliding from the last refresh", () => {
    // A rolling "30 days since last refresh" would move with usage. The
    // period identity must depend only on the calendar/billing cycle.
    const a = resolvePeriod("monthly", new Date("2026-08-16T12:00:00Z"), { anchor: "2026-01-01T00:00:00Z" })
    const b = resolvePeriod("monthly", new Date("2026-08-20T12:00:00Z"), { anchor: "2026-01-01T00:00:00Z" })
    expect(a.start.getTime()).toBe(b.start.getTime())
  })
})

describe("credits are untouched", () => {
  it("Voice Refresh allowance is a separate number from credit allowance", () => {
    // 4 refreshes must never be confused with the 1,000 generation credits.
    expect(refreshAllowanceFor("pro")).toBe(4)
    expect(refreshAllowanceFor("pro")).not.toBe(1000)
  })
})

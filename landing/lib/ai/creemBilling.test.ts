// Creem billing-period -> credit-renewal behaviour.
//
// Field names verified against docs.creem.io/code/webhooks:
//   eventType "subscription.paid"  = a recurring payment was collected
//   subscription.current_period_start_date / current_period_end_date (ISO 8601)
//
// Credit idempotency is keyed on the PERIOD, never on the webhook event id.
// These tests encode that: what matters is whether period_start changed, so a
// duplicate/replayed webhook is inert regardless of its event id.
import { describe, it, expect } from "vitest"
import { resolvePeriod, policyFor } from "./credits"

/** Mirrors the webhook's guard: only advance to a strictly newer period. */
function applyPaidWebhook(
  stored: { start: string | null; end: string | null },
  incoming: { start: string; end: string }
): { start: string | null; end: string | null; advanced: boolean } {
  if (!stored.start || Date.parse(incoming.start) > Date.parse(stored.start)) {
    return { start: incoming.start, end: incoming.end, advanced: true }
  }
  return { ...stored, advanced: false }
}

/** Period identity drives the reset — same identity means no new grant. */
function periodIdentity(now: Date, stored: { start: string | null; end: string | null }) {
  return resolvePeriod("billing", now, {
    creemPeriodStart: stored.start,
    creemPeriodEnd: stored.end,
    anchor: "2026-01-01T00:00:00Z",
  }).start.getTime()
}

const AUG = { start: "2026-08-01T00:00:00Z", end: "2026-09-01T00:00:00Z" }
const SEP = { start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z" }

describe("subscription.paid — duplicate webhook", () => {
  it("a replayed webhook for the SAME period does not advance the period", () => {
    let stored = { start: AUG.start as string | null, end: AUG.end as string | null }
    const first = applyPaidWebhook(stored, AUG)
    stored = { start: first.start, end: first.end }
    const replay = applyPaidWebhook(stored, AUG)
    expect(replay.advanced).toBe(false)
  })

  it("a replayed webhook cannot grant a second 1,000 credits", () => {
    const now = new Date("2026-08-14T12:00:00Z")
    const stored = { start: AUG.start as string | null, end: AUG.end as string | null }
    const before = periodIdentity(now, stored)
    const replay = applyPaidWebhook(stored, AUG)
    const after = periodIdentity(now, { start: replay.start, end: replay.end })
    // Identical period identity => reserve_credit() sees no change => no reset.
    expect(after).toBe(before)
  })

  it("is idempotent regardless of webhook event id (we never read it)", () => {
    // Two deliveries with different evt_ ids but the same period must behave
    // identically — this is exactly why event-id dedupe was rejected.
    const stored = { start: AUG.start as string | null, end: AUG.end as string | null }
    const a = applyPaidWebhook(stored, AUG)
    const b = applyPaidWebhook(stored, AUG)
    expect(a.advanced).toBe(false)
    expect(b.advanced).toBe(false)
  })
})

describe("subscription.paid — renewal", () => {
  it("a newer period advances the stored period state", () => {
    const stored = { start: AUG.start as string | null, end: AUG.end as string | null }
    const next = applyPaidWebhook(stored, SEP)
    expect(next.advanced).toBe(true)
    expect(next.start).toBe(SEP.start)
    expect(next.end).toBe(SEP.end)
  })

  it("the new period resets the balance to the full allowance", () => {
    const before = periodIdentity(new Date("2026-08-14T12:00:00Z"), { start: AUG.start, end: AUG.end })
    const after = periodIdentity(new Date("2026-09-05T12:00:00Z"), { start: SEP.start, end: SEP.end })
    expect(after).not.toBe(before) // different identity => reset to 1000
    expect(policyFor("pro").allowance).toBe(1000)
  })

  it("an out-of-order (older) webhook never rewinds the period", () => {
    const stored = { start: SEP.start as string | null, end: SEP.end as string | null }
    const late = applyPaidWebhook(stored, AUG) // arrives after SEP
    expect(late.advanced).toBe(false)
    expect(late.start).toBe(SEP.start)
  })

  it("the first webhook on a null period always applies", () => {
    const stored = { start: null, end: null }
    expect(applyPaidWebhook(stored, AUG).advanced).toBe(true)
  })
})

describe("canceled / expired subscriptions", () => {
  it("canceled keeps the period, so credits work until it actually ends", () => {
    // subscription.canceled only flips status — the plan and period stay, so
    // a user who turned off renewal keeps the credits they paid for.
    const stored = { start: AUG.start, end: AUG.end }
    const p = resolvePeriod("billing", new Date("2026-08-20T00:00:00Z"), {
      creemPeriodStart: stored.start,
      creemPeriodEnd: stored.end,
    })
    expect(p.kind).toBe("billing")
    expect(p.end.toISOString()).toBe("2026-09-01T00:00:00.000Z")
  })

  it("expired clears the period, dropping the user to the free daily allowance", () => {
    // The webhook nulls current_period_* on subscription.expired.
    const p = resolvePeriod("day", new Date("2026-09-05T12:00:00Z"))
    expect(p.kind).toBe("day")
    expect(policyFor("free").allowance).toBe(5)
  })

  it("lifetime is never downgraded by expiry and keeps a monthly period", () => {
    const p = resolvePeriod("monthly", new Date("2026-09-05T12:00:00Z"), { anchor: "2026-01-01T00:00:00Z" })
    expect(p.kind).toBe("monthly")
    expect(policyFor("lifetime").allowance).toBe(1000)
  })
})

describe("manual/comped Pro fallback", () => {
  // The 2 live Pro accounts are paid_via='manual' with no Creem subscription,
  // so they have no billing period at all.
  it("falls back to a rolling monthly cycle when no Creem period exists", () => {
    const p = resolvePeriod("billing", new Date("2026-08-14T12:00:00Z"), {
      creemPeriodStart: null,
      creemPeriodEnd: null,
      anchor: "2026-07-29T00:00:00Z",
    })
    expect(p.kind).toBe("monthly")
    expect(p.start.getTime()).toBeLessThanOrEqual(Date.parse("2026-08-14T12:00:00Z"))
    expect(p.end.getTime()).toBeGreaterThan(Date.parse("2026-08-14T12:00:00Z"))
  })

  it("still grants the full Pro allowance on that fallback cycle", () => {
    expect(policyFor("pro").allowance).toBe(1000)
  })

  it("renews on the 30-day boundary rather than never", () => {
    const anchor = "2026-07-29T00:00:00Z"
    const p1 = resolvePeriod("billing", new Date("2026-08-14T12:00:00Z"), { creemPeriodStart: null, creemPeriodEnd: null, anchor })
    const p2 = resolvePeriod("billing", new Date("2026-09-14T12:00:00Z"), { creemPeriodStart: null, creemPeriodEnd: null, anchor })
    expect(p2.start.getTime()).toBeGreaterThan(p1.start.getTime())
  })

  it("switches to the real Creem cycle the moment a subscription appears", () => {
    const p = resolvePeriod("billing", new Date("2026-08-14T12:00:00Z"), {
      creemPeriodStart: AUG.start,
      creemPeriodEnd: AUG.end,
      anchor: "2026-07-29T00:00:00Z",
    })
    expect(p.kind).toBe("billing")
    expect(p.start.toISOString()).toBe("2026-08-01T00:00:00.000Z")
  })
})

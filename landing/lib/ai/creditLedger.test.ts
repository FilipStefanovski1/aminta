// Behavioural tests for the credit ledger semantics implemented in
// supabase-migration-credits.sql (reserve_credit / refund_credit).
//
// These exercise a faithful in-memory model of those two functions rather
// than a live Postgres. That is a deliberate tradeoff and worth being
// explicit about: it proves the ALGORITHM (reset-on-period-change,
// idempotent reserve, idempotent refund, no-overspend under contention,
// clamp to allowance) but it does NOT prove the SQL itself compiles or that
// pg_advisory_xact_lock is applied correctly. The model mirrors the SQL
// statement-for-statement so the two can be diffed by eye, and the real SQL
// still needs one run against a database before rollout.
//
// The lock is modelled by running each operation to completion atomically —
// which is exactly what pg_advisory_xact_lock(user_id) guarantees in the
// real function, since every read and write happens inside the one
// transaction that holds it.
import { describe, it, expect, beforeEach } from "vitest"
import { policyFor, resolvePeriod, creditCostFor } from "./credits"

interface CreditRow {
  balance: number
  allowance: number
  periodStart: number
  planKey: string
}
interface LedgerRow {
  requestId: string | null
  delta: number
  reason: "reserve" | "refund" | "reset"
  createdAt: number
}

let credits: CreditRow | null
let ledger: LedgerRow[]
let clock: number

beforeEach(() => {
  credits = null
  ledger = []
  clock = Date.parse("2026-08-14T12:00:00Z")
})

/** Mirrors reserve_credit(). Atomic by construction (see header). */
function reserve(requestId: string, cost: number, allowance: number, periodStart: number, planKey: string) {
  if (!credits) {
    credits = { balance: allowance, allowance, periodStart, planKey }
    ledger.push({ requestId: null, delta: allowance, reason: "reset", createdAt: clock })
  } else if (credits.periodStart !== periodStart || credits.planKey !== planKey || credits.allowance !== allowance) {
    // Period rolled or plan/allowance changed => fresh allowance, no rollover.
    credits = { balance: allowance, allowance, periodStart, planKey }
    ledger.push({ requestId: null, delta: allowance, reason: "reset", createdAt: clock })
  }

  if (cost <= 0) return { ok: true, balance: credits.balance, reason: "free_action" }

  if (ledger.some((l) => l.requestId === requestId && l.reason === "reserve")) {
    return { ok: true, balance: credits.balance, reason: "already_reserved" }
  }
  if (credits.balance < cost) {
    return { ok: false, balance: credits.balance, reason: "insufficient_credits" }
  }

  credits.balance -= cost
  ledger.push({ requestId, delta: -cost, reason: "reserve", createdAt: clock })
  return { ok: true, balance: credits.balance, reason: "reserved" }
}

/** Mirrors refund_credit(). */
function refund(requestId: string) {
  const res = ledger.find((l) => l.requestId === requestId && l.reason === "reserve")
  if (!res) return { ok: false, balance: credits?.balance ?? 0, reason: "nothing_to_refund" }
  if (ledger.some((l) => l.requestId === requestId && l.reason === "refund")) {
    return { ok: true, balance: credits!.balance, reason: "already_refunded" }
  }
  if (res.createdAt < credits!.periodStart) {
    return { ok: false, balance: credits!.balance, reason: "period_rolled" }
  }
  credits!.balance = Math.min(credits!.balance + Math.abs(res.delta), credits!.allowance)
  ledger.push({ requestId, delta: Math.abs(res.delta), reason: "refund", createdAt: clock })
  return { ok: true, balance: credits!.balance, reason: "refunded" }
}

// Convenience: resolve a plan's real allowance/period the way the app does.
function ctxFor(planKey: string, now: Date, opts: Parameters<typeof resolvePeriod>[2] = {}) {
  const policy = policyFor(planKey)
  const period = resolvePeriod(policy.periodKind, now, opts)
  return { allowance: policy.allowance, periodStart: period.start.getTime(), planKey }
}

describe("Free tier", () => {
  const now = new Date("2026-08-14T12:00:00Z")

  it("starts with 5 credits", () => {
    const c = ctxFor("free", now)
    const r = reserve("req-1", 0, c.allowance, c.periodStart, c.planKey)
    expect(r.balance).toBe(5)
  })

  it("consumes exactly 1 credit for a successful generation", () => {
    const c = ctxFor("free", now)
    const r = reserve("req-1", creditCostFor("tweet"), c.allowance, c.periodStart, c.planKey)
    expect(r.ok).toBe(true)
    expect(r.balance).toBe(4)
  })

  it("consumes 0 credits for a failed generation (reserve then refund)", () => {
    const c = ctxFor("free", now)
    reserve("req-1", 1, c.allowance, c.periodStart, c.planKey)
    expect(credits!.balance).toBe(4)
    const rf = refund("req-1")
    expect(rf.ok).toBe(true)
    expect(credits!.balance).toBe(5) // net zero
  })

  it("charges a duplicate requestId only once in total", () => {
    const c = ctxFor("free", now)
    reserve("req-1", 1, c.allowance, c.periodStart, c.planKey)
    const second = reserve("req-1", 1, c.allowance, c.periodStart, c.planKey)
    const third = reserve("req-1", 1, c.allowance, c.periodStart, c.planKey)
    expect(second.reason).toBe("already_reserved")
    expect(third.reason).toBe("already_reserved")
    expect(credits!.balance).toBe(4) // one charge, not three
  })

  it("blocks at 0 credits", () => {
    const c = ctxFor("free", now)
    for (let i = 0; i < 5; i++) reserve(`req-${i}`, 1, c.allowance, c.periodStart, c.planKey)
    expect(credits!.balance).toBe(0)
    const blocked = reserve("req-blocked", 1, c.allowance, c.periodStart, c.planKey)
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toBe("insufficient_credits")
    expect(credits!.balance).toBe(0) // never negative
  })

  it("resets to 5 the next day", () => {
    const day1 = ctxFor("free", new Date("2026-08-14T12:00:00Z"))
    for (let i = 0; i < 5; i++) reserve(`d1-${i}`, 1, day1.allowance, day1.periodStart, day1.planKey)
    expect(credits!.balance).toBe(0)

    clock = Date.parse("2026-08-15T09:00:00Z")
    const day2 = ctxFor("free", new Date("2026-08-15T09:00:00Z"))
    const r = reserve("d2-1", 1, day2.allowance, day2.periodStart, day2.planKey)
    expect(r.ok).toBe(true)
    expect(credits!.balance).toBe(4) // reset to 5, then charged 1
  })

  it("does NOT roll unused credits over (5 used 3 => next day is 5, not 7)", () => {
    const day1 = ctxFor("free", new Date("2026-08-14T12:00:00Z"))
    reserve("d1-a", 1, day1.allowance, day1.periodStart, day1.planKey)
    reserve("d1-b", 1, day1.allowance, day1.periodStart, day1.planKey)
    reserve("d1-c", 1, day1.allowance, day1.periodStart, day1.planKey)
    expect(credits!.balance).toBe(2) // 2 unused

    clock = Date.parse("2026-08-15T09:00:00Z")
    const day2 = ctxFor("free", new Date("2026-08-15T09:00:00Z"))
    reserve("d2-probe", 0, day2.allowance, day2.periodStart, day2.planKey)
    expect(credits!.balance).toBe(5)
    expect(credits!.balance).not.toBe(7)
  })
})

describe("BYOK", () => {
  it("consumes 0 Aminta credits", () => {
    // BYOK never reaches /api/generate at all (the extension routes it
    // client-side straight to the user's own provider), so no reservation is
    // ever made. Modelled here as "no calls => balance untouched".
    const c = ctxFor("free", new Date("2026-08-14T12:00:00Z"))
    reserve("probe", 0, c.allowance, c.periodStart, c.planKey)
    const before = credits!.balance
    // ...BYOK generation happens entirely off this path...
    expect(credits!.balance).toBe(before)
    expect(credits!.balance).toBe(5)
  })
})

describe("Pro tier", () => {
  const now = new Date("2026-08-14T12:00:00Z")
  const billing = { creemPeriodStart: "2026-08-01T00:00:00Z", creemPeriodEnd: "2026-09-01T00:00:00Z" }

  it("starts with 1,000 credits", () => {
    const c = ctxFor("pro", now, billing)
    reserve("probe", 0, c.allowance, c.periodStart, c.planKey)
    expect(credits!.balance).toBe(1000)
  })

  it("consumes 1 credit per generation", () => {
    const c = ctxFor("pro", now, billing)
    reserve("r1", creditCostFor("reply"), c.allowance, c.periodStart, c.planKey)
    expect(credits!.balance).toBe(999)
  })

  it("is not blocked by the old 60/day product quota", () => {
    // The old system capped Pro at 60/day. Under credits, 200 generations in
    // one day is fine as long as the period balance holds.
    const c = ctxFor("pro", now, billing)
    for (let i = 0; i < 200; i++) {
      const r = reserve(`burst-${i}`, 1, c.allowance, c.periodStart, c.planKey)
      expect(r.ok).toBe(true)
    }
    expect(credits!.balance).toBe(800)
  })

  it("resets to 1,000 at renewal (new Creem billing period)", () => {
    const p1 = ctxFor("pro", now, billing)
    for (let i = 0; i < 900; i++) reserve(`p1-${i}`, 1, p1.allowance, p1.periodStart, p1.planKey)
    expect(credits!.balance).toBe(100)

    clock = Date.parse("2026-09-02T00:00:00Z")
    const p2 = ctxFor("pro", new Date("2026-09-02T00:00:00Z"), {
      creemPeriodStart: "2026-09-01T00:00:00Z",
      creemPeriodEnd: "2026-10-01T00:00:00Z",
    })
    reserve("p2-probe", 0, p2.allowance, p2.periodStart, p2.planKey)
    expect(credits!.balance).toBe(1000)
  })

  it("does NOT roll unused credits into the next period", () => {
    const p1 = ctxFor("pro", now, billing)
    reserve("p1-a", 1, p1.allowance, p1.periodStart, p1.planKey)
    expect(credits!.balance).toBe(999)

    clock = Date.parse("2026-09-02T00:00:00Z")
    const p2 = ctxFor("pro", new Date("2026-09-02T00:00:00Z"), {
      creemPeriodStart: "2026-09-01T00:00:00Z",
      creemPeriodEnd: "2026-10-01T00:00:00Z",
    })
    reserve("p2-probe", 0, p2.allowance, p2.periodStart, p2.planKey)
    expect(credits!.balance).toBe(1000)
    expect(credits!.balance).not.toBe(1999)
  })

  it("a duplicate renewal webhook does not grant a second 1,000", () => {
    const p1 = ctxFor("pro", now, billing)
    for (let i = 0; i < 500; i++) reserve(`u-${i}`, 1, p1.allowance, p1.periodStart, p1.planKey)
    expect(credits!.balance).toBe(500)
    // The webhook writes the SAME period again (Creem retry). Period identity
    // is unchanged => no reset, balance preserved.
    const same = ctxFor("pro", now, billing)
    reserve("probe", 0, same.allowance, same.periodStart, same.planKey)
    expect(credits!.balance).toBe(500)
  })
})

describe("Concurrency — the final credit", () => {
  it("only one of two simultaneous requests can take the last credit", () => {
    const c = ctxFor("free", new Date("2026-08-14T12:00:00Z"))
    for (let i = 0; i < 4; i++) reserve(`spend-${i}`, 1, c.allowance, c.periodStart, c.planKey)
    expect(credits!.balance).toBe(1)

    // Both arrive "at once"; the advisory lock serializes them.
    const a = reserve("concurrent-a", 1, c.allowance, c.periodStart, c.planKey)
    const b = reserve("concurrent-b", 1, c.allowance, c.periodStart, c.planKey)

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(credits!.balance).toBe(0)
    expect(credits!.balance).toBeGreaterThanOrEqual(0) // never oversold
  })

  it("N concurrent requests against N-1 credits grant exactly N-1", () => {
    const c = ctxFor("free", new Date("2026-08-14T12:00:00Z"))
    reserve("warm", 0, c.allowance, c.periodStart, c.planKey)
    const results = Array.from({ length: 10 }, (_, i) =>
      reserve(`race-${i}`, 1, c.allowance, c.periodStart, c.planKey)
    )
    expect(results.filter((r) => r.ok).length).toBe(5) // allowance
    expect(credits!.balance).toBe(0)
  })
})

describe("Failure handling", () => {
  const now = new Date("2026-08-14T12:00:00Z")

  it("a Gemini failure ultimately costs 0 credits", () => {
    const c = ctxFor("free", now)
    reserve("fail-1", 1, c.allowance, c.periodStart, c.planKey)
    refund("fail-1")
    expect(credits!.balance).toBe(5)
  })

  it("refund is idempotent — a double refund cannot mint credits", () => {
    const c = ctxFor("free", now)
    reserve("fail-1", 1, c.allowance, c.periodStart, c.planKey)
    refund("fail-1")
    const second = refund("fail-1")
    expect(second.reason).toBe("already_refunded")
    expect(credits!.balance).toBe(5)
  })

  it("refunding a request that was never reserved does nothing", () => {
    const c = ctxFor("free", now)
    reserve("probe", 0, c.allowance, c.periodStart, c.planKey)
    const r = refund("never-existed")
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("nothing_to_refund")
    expect(credits!.balance).toBe(5)
  })

  it("retry after failure costs exactly 1 in total, not 2", () => {
    const c = ctxFor("free", now)
    // Attempt 1 fails and refunds.
    reserve("req-x", 1, c.allowance, c.periodStart, c.planKey)
    refund("req-x")
    expect(credits!.balance).toBe(5)
    // The client retries as a NEW user action (new id) and succeeds.
    reserve("req-y", 1, c.allowance, c.periodStart, c.planKey)
    expect(credits!.balance).toBe(4)
  })

  it("never refunds across a period boundary (would hand out free credits)", () => {
    const day1 = ctxFor("free", new Date("2026-08-14T12:00:00Z"))
    reserve("late", 1, day1.allowance, day1.periodStart, day1.planKey)
    expect(credits!.balance).toBe(4)

    clock = Date.parse("2026-08-15T09:00:00Z")
    const day2 = ctxFor("free", new Date("2026-08-15T09:00:00Z"))
    reserve("probe", 0, day2.allowance, day2.periodStart, day2.planKey) // rolls period, balance = 5
    const r = refund("late")
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("period_rolled")
    expect(credits!.balance).toBe(5) // not 6
  })

  it("a refund can never push the balance above the allowance", () => {
    const c = ctxFor("free", now)
    reserve("a", 1, c.allowance, c.periodStart, c.planKey)
    refund("a")
    expect(credits!.balance).toBeLessThanOrEqual(c.allowance)
  })
})

describe("Plan changes mid-period", () => {
  it("upgrading free -> pro grants the Pro allowance immediately", () => {
    const f = ctxFor("free", new Date("2026-08-14T12:00:00Z"))
    for (let i = 0; i < 5; i++) reserve(`f-${i}`, 1, f.allowance, f.periodStart, f.planKey)
    expect(credits!.balance).toBe(0)

    const p = ctxFor("pro", new Date("2026-08-14T12:30:00Z"), {
      creemPeriodStart: "2026-08-14T12:20:00Z",
      creemPeriodEnd: "2026-09-14T12:20:00Z",
    })
    const r = reserve("first-pro", 1, p.allowance, p.periodStart, p.planKey)
    expect(r.ok).toBe(true)
    expect(credits!.balance).toBe(999)
  })

  it("an expiring gift drops the user back to the free allowance", () => {
    const g = ctxFor("gifted", new Date("2026-08-14T12:00:00Z"), { anchor: "2026-08-01T00:00:00Z" })
    reserve("g-1", 1, g.allowance, g.periodStart, g.planKey)
    expect(credits!.balance).toBe(999)

    // Gift expires; resolvePlanKey now returns 'free'.
    const f = ctxFor("free", new Date("2026-09-20T12:00:00Z"))
    clock = Date.parse("2026-09-20T12:00:00Z")
    reserve("probe", 0, f.allowance, f.periodStart, f.planKey)
    expect(credits!.balance).toBe(5)
  })
})

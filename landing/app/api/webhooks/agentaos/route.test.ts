import { describe, expect, it } from "vitest"
import { derivePeriodStart, isPast } from "./route"

describe("derivePeriodStart — AgentaOS gives current_period_end only", () => {
  it("derives a start exactly one calendar month before end", () => {
    expect(derivePeriodStart("2026-09-19T12:00:00.000Z")).toBe("2026-08-19T12:00:00.000Z")
  })

  it("produces a well-formed, non-inverted window (what resolvePeriod requires)", () => {
    const end = "2026-09-19T12:00:00.000Z"
    const start = derivePeriodStart(end)
    expect(Date.parse(start)).toBeLessThan(Date.parse(end))
  })

  it("handles a January end (crossing a year boundary)", () => {
    expect(derivePeriodStart("2027-01-15T00:00:00.000Z")).toBe("2026-12-15T00:00:00.000Z")
  })
})

describe("isPast — decides Creem-canceled vs Creem-expired semantics for AgentaOS's single terminal event", () => {
  const now = Date.parse("2026-08-30T12:00:00Z")

  it("a future period end is not past — access continues (Creem's 'canceled')", () => {
    expect(isPast("2026-09-30T12:00:00Z", now)).toBe(false)
  })

  it("a period end already elapsed is past — downgrade now (Creem's 'expired')", () => {
    expect(isPast("2026-08-01T12:00:00Z", now)).toBe(true)
  })

  it("null/unparsable period end fails closed as 'past' rather than granting indefinite access", () => {
    expect(isPast(null, now)).toBe(true)
    expect(isPast("not-a-date", now)).toBe(true)
  })
})

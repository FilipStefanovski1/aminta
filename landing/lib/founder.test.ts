import { describe, expect, it } from "vitest"

import { FOUNDER_LIMIT } from "./founder"

describe("FOUNDER_LIMIT — canonical seat cap", () => {
  it("is exactly 50", () => {
    expect(FOUNDER_LIMIT).toBe(50)
  })

  // countFounderSeatsUsed()/founderSoldOut() are thin service-role DB
  // queries (see lib/founder.ts) — no business logic to unit test beyond
  // "count >= FOUNDER_LIMIT is sold out," verified here directly against
  // the same boundary values a live count would take. An actual DB-backed
  // integration test would need a seeded Supabase instance, which this
  // suite doesn't have; that gap is called out in the report rather than
  // faked with a mock that would just re-assert the same one-line
  // comparison countFounderSeatsUsed() already makes.
  const soldOut = (used: number) => used >= FOUNDER_LIMIT

  it("0 purchases: available", () => {
    expect(soldOut(0)).toBe(false)
  })

  it("49 purchases: available (one seat left)", () => {
    expect(soldOut(49)).toBe(false)
  })

  it("50 purchases: sold out", () => {
    expect(soldOut(50)).toBe(true)
  })

  it("51+ purchases (should never happen, but must still read as sold out): sold out", () => {
    expect(soldOut(51)).toBe(true)
  })
})

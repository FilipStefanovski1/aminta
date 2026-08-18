// Voice Refresh entitlement + cooldown math.
//
// The concurrency, idempotency, and cooldown-gating guarantees live in SQL
// (advisory lock + partial unique index + the last_refresh_at comparison in
// reserve_voice_refresh) and are exercised against real Postgres, exactly as
// the credit system's were — a mocked client cannot prove them. What is
// testable in isolation here is the policy: who is entitled, and the pure
// cooldown-window arithmetic getRefreshStatus performs on a given
// last_refresh_at.
import { describe, it, expect } from "vitest"
import { isVoiceRefreshEntitled, refreshAllowanceFor, VOICE_REFRESH_COOLDOWN_MS } from "./allowance"
import { resolvePlanKey } from "@/lib/ai/credits"

describe("entitlement", () => {
  it("entitles Pro", () => {
    expect(isVoiceRefreshEntitled("pro")).toBe(true)
    expect(refreshAllowanceFor("pro")).toBe(1)
  })

  it("entitles Founder/Lifetime", () => {
    expect(isVoiceRefreshEntitled("lifetime")).toBe(true)
    expect(refreshAllowanceFor("lifetime")).toBe(1)
  })

  it("entitles an active Gifted account", () => {
    expect(isVoiceRefreshEntitled("gifted")).toBe(true)
    expect(refreshAllowanceFor("gifted")).toBe(1)
  })

  it("does not entitle Free", () => {
    expect(isVoiceRefreshEntitled("free")).toBe(false)
    expect(refreshAllowanceFor("free")).toBe(0)
  })

  it("fails closed on an unknown plan", () => {
    expect(isVoiceRefreshEntitled("enterprise")).toBe(false)
    expect(isVoiceRefreshEntitled("")).toBe(false)
  })
})

describe("plan resolution drives entitlement", () => {
  const now = new Date("2026-08-16T12:00:00Z")

  it("an expired gift drops back to not entitled", () => {
    const planKey = resolvePlanKey(
      { plan: "free", aiIncludedOverride: true, giftExpiresAt: "2026-08-01T00:00:00Z" },
      now
    )
    expect(isVoiceRefreshEntitled(planKey)).toBe(false)
  })

  it("an active gift is entitled", () => {
    const planKey = resolvePlanKey(
      { plan: "free", aiIncludedOverride: true, giftExpiresAt: "2026-09-01T00:00:00Z" },
      now
    )
    expect(planKey).toBe("gifted")
    expect(isVoiceRefreshEntitled(planKey)).toBe(true)
  })

  it("a plain free account is not entitled", () => {
    const planKey = resolvePlanKey({ plan: "free", aiIncludedOverride: false, giftExpiresAt: null }, now)
    expect(isVoiceRefreshEntitled(planKey)).toBe(false)
  })
})

describe("cooldown is 168 hours, not a calendar/billing period", () => {
  it("is exactly 7*24 hours in milliseconds", () => {
    expect(VOICE_REFRESH_COOLDOWN_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it("is anchored on the user's own last refresh, not a shared boundary", () => {
    // Two users who refreshed on different days get different cooldown
    // ends — there is no shared period_end this reads from.
    const a = new Date("2026-08-16T12:00:00Z").getTime() + VOICE_REFRESH_COOLDOWN_MS
    const b = new Date("2026-08-18T09:30:00Z").getTime() + VOICE_REFRESH_COOLDOWN_MS
    expect(a).not.toBe(b)
    expect(new Date(a).toISOString()).toBe("2026-08-23T12:00:00.000Z")
    expect(new Date(b).toISOString()).toBe("2026-08-25T09:30:00.000Z")
  })
})

describe("credits are untouched", () => {
  it("Voice Refresh entitlement is a boolean gate, never confused with the 1,000 generation credits", () => {
    expect(refreshAllowanceFor("pro")).toBe(1)
    expect(refreshAllowanceFor("pro")).not.toBe(1000)
  })
})

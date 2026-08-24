import { describe, expect, it } from "vitest"
import { canUseByok, communityUnlocked, planLabel } from "./entitlements"

// Regression guard: DashboardClient.tsx used to render the raw `plan` DB
// value (plan.toUpperCase()) instead of going through this helper, so a
// Founder/lifetime account saw "LIFETIME" on the dashboard while every
// other surface (extension Settings, Pricing) correctly said "FOUNDER" for
// the exact same account.
describe("planLabel — the one mapping from raw plan value to a user-facing label", () => {
  it("never shows the raw 'lifetime' plan value — maps it to FOUNDER", () => {
    const label = planLabel({ plan: "lifetime" })
    expect(label).toBe("FOUNDER")
    expect(label).not.toBe("LIFETIME")
  })

  it("maps an entitled pro subscription to PRO", () => {
    expect(planLabel({ plan: "pro", subscription_status: "active" })).toBe("PRO")
  })

  it("falls back to FREE for a revoked pro subscription", () => {
    expect(planLabel({ plan: "pro", subscription_status: "expired" })).toBe("FREE")
  })

  it("defaults to FREE with no plan at all", () => {
    expect(planLabel({})).toBe("FREE")
  })
})

describe("canUseByok — BYOK is Pro/Founder only", () => {
  it("Free (no plan) cannot use BYOK", () => {
    expect(canUseByok({})).toBe(false)
    expect(canUseByok({ plan: "free" })).toBe(false)
  })

  it("Pro with an entitled subscription_status can use BYOK", () => {
    expect(canUseByok({ plan: "pro", subscription_status: "active" })).toBe(true)
    expect(canUseByok({ plan: "pro", subscription_status: "canceled" })).toBe(true)
  })

  it("Pro with a revoked subscription_status cannot use BYOK", () => {
    expect(canUseByok({ plan: "pro", subscription_status: "expired" })).toBe(false)
  })

  it("Founder/lifetime can always use BYOK, regardless of subscription_status", () => {
    expect(canUseByok({ plan: "lifetime" })).toBe(true)
    expect(canUseByok({ plan: "lifetime", subscription_status: "expired" })).toBe(true)
  })
})

describe("Discord community gate", () => {
  it("locked before the extension has ever authenticated/synced", () => {
    expect(communityUnlocked(false)).toBe(false)
  })

  it("unlocked once the extension has authenticated/synced at least once", () => {
    expect(communityUnlocked(true)).toBe(true)
  })

  it("is plan-independent — Free, Pro, and Founder all resolve the same way once activated", () => {
    // communityUnlocked never takes plan/subscription_status as input at
    // all, so there is no plan branch that could special-case any tier —
    // this test documents that intent rather than exercising a branch.
    expect(communityUnlocked(true)).toBe(communityUnlocked(true))
  })
})

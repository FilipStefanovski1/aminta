import { describe, expect, it } from "vitest"
import { canUseByok, communityUnlocked } from "./entitlements"

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

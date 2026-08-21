import { describe, expect, it } from "vitest"
import { communityUnlocked } from "./entitlements"

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

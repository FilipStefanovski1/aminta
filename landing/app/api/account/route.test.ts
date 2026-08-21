import { describe, expect, it } from "vitest"
import { blocksDeletion } from "./route"

describe("account deletion — billing safety gate", () => {
  it("blocks deletion for an actively renewing Pro subscription", () => {
    expect(blocksDeletion("pro", "active")).toBe(true)
    expect(blocksDeletion("pro", "trialing")).toBe(true)
  })

  it("allows deletion once the subscription is canceled (won't renew again)", () => {
    expect(blocksDeletion("pro", "canceled")).toBe(false)
  })

  it("allows deletion for Founder/lifetime (one-time purchase, nothing recurring)", () => {
    expect(blocksDeletion("lifetime", "active")).toBe(false)
  })

  it("allows deletion for free accounts", () => {
    expect(blocksDeletion("free", null)).toBe(false)
  })

  it("allows deletion when there's no profile row at all", () => {
    expect(blocksDeletion(undefined, undefined)).toBe(false)
  })
})

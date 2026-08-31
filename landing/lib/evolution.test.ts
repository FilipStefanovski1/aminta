import { describe, expect, it } from "vitest"
import { getLevel, LEVEL_THRESHOLDS } from "./evolution"

// These thresholds MUST match extension/lib/evolution.ts's LEVEL_THRESHOLDS
// exactly — see this file's header comment. Pinned here as a literal array
// (not re-derived) so a future accidental edit to either side shows up as a
// failing assertion instead of two systems quietly disagreeing about which
// level a given XP total maps to — the exact class of bug that made
// "landing = 2,175 XP / LV.4" and "extension = 775/900 XP" look
// inconsistent (they weren't, but they easily could have been).
const EXTENSION_CANONICAL_THRESHOLDS = [0, 300, 750, 1400, 2300, 3500, 5200, 7500, 10500, 14500]

describe("LEVEL_THRESHOLDS matches the extension's canonical values", () => {
  it("is byte-for-byte identical to extension/lib/evolution.ts's LEVEL_THRESHOLDS", () => {
    expect(LEVEL_THRESHOLDS).toEqual(EXTENSION_CANONICAL_THRESHOLDS)
  })
})

describe("getLevel", () => {
  it("starts at level 1 for 0 XP", () => {
    expect(getLevel(0)).toBe(1)
  })

  it("reaches level 4 at exactly the reported 2,175 XP", () => {
    // The screenshot's own numbers: 2,175 total XP, "LV.4 Excited", 775/900
    // XP into the level, 125 XP to the next one. All four are consistent
    // under these thresholds — see the reproduction in the fix's report.
    expect(getLevel(2175)).toBe(4)
  })

  it("levels up exactly at each threshold, not one XP early or late", () => {
    expect(getLevel(1399)).toBe(3)
    expect(getLevel(1400)).toBe(4)
    expect(getLevel(2299)).toBe(4)
    expect(getLevel(2300)).toBe(5)
  })

  it("can reach level 10 at the max threshold — no artificial cap baked into the math itself", () => {
    expect(getLevel(14500)).toBe(10)
    expect(getLevel(999999)).toBe(10)
  })
})

import { describe, expect, it } from "vitest"
import { computeLengthProfile } from "~lib/styleProfile"
import { resolveLengthGuide } from "~lib/prompts"
import type { StyleProfile } from "~lib/storage"

const baseProfile: StyleProfile = {
  confidence: "balanced", energy: "moderate", vocabularyComplexity: "moderate",
  capitalization: "standard", directness: "balanced",
  rhythm: "", punctuation: "", emojiUsage: "", hashtagUsage: "", humorStyle: "",
  formattingPreferences: "", rhetoricalDevices: "", cadence: "",
  confidenceScore: 1, lengthProfile: null,
}

describe("computeLengthProfile", () => {
  it("returns null below the minimum post threshold", () => {
    const corpus = [{ text: "a".repeat(50) }, { text: "b".repeat(60) }, { text: "c".repeat(70) }]
    expect(computeLengthProfile(corpus)).toBeNull()
  })

  it("derives robust percentiles from a normal corpus", () => {
    const lens = [40, 60, 80, 100, 120, 140, 160]
    const corpus = lens.map((n) => ({ text: "x".repeat(n) }))
    const lp = computeLengthProfile(corpus)
    expect(lp).not.toBeNull()
    expect(lp!.median).toBe(100)
    expect(lp!.p25).toBeLessThan(lp!.median)
    expect(lp!.p75).toBeGreaterThan(lp!.median)
  })

  it("a single extreme outlier does not blow out the median", () => {
    const lens = [80, 90, 100, 110, 120, 5000] // one wildly long post
    const corpus = lens.map((n) => ({ text: "x".repeat(n) }))
    const lp = computeLengthProfile(corpus)!
    expect(lp.median).toBeLessThan(200) // median stays near the real cluster
  })
})

describe("resolveLengthGuide — personalized vs fallback", () => {
  const lengthProfile = { p25: 90, median: 140, p75: 210 }

  it("falls back to the fixed guide with no lengthProfile (never refreshed)", () => {
    const guide = resolveLengthGuide("tweet", "medium", baseProfile)
    expect(guide).toMatch(/150-260 characters/) // the existing static tweet/medium range
  })

  it("falls back to the fixed guide with too little history", () => {
    const guide = resolveLengthGuide("tweet", "medium", { ...baseProfile, lengthProfile: null })
    expect(guide).toMatch(/150-260 characters/)
  })

  it("short is shorter than the user's baseline median", () => {
    const profile = { ...baseProfile, lengthProfile }
    const guide = resolveLengthGuide("tweet", "short", profile)
    const [, lo, hi] = guide.match(/roughly (\d+)-(\d+) characters/)!
    expect(Number(hi)).toBeLessThanOrEqual(lengthProfile.median)
    expect(Number(lo)).toBeLessThan(Number(hi))
  })

  it("medium centers on the user's baseline median", () => {
    const profile = { ...baseProfile, lengthProfile }
    const guide = resolveLengthGuide("tweet", "medium", profile)
    const [, lo, hi] = guide.match(/roughly (\d+)-(\d+) characters/)!
    expect(Number(lo)).toBeLessThanOrEqual(lengthProfile.median)
    expect(Number(hi)).toBeGreaterThanOrEqual(lengthProfile.median)
  })

  it("long is longer than the user's baseline median", () => {
    const profile = { ...baseProfile, lengthProfile }
    const guide = resolveLengthGuide("tweet", "long", profile)
    const [, lo] = guide.match(/roughly (\d+)-(\d+) characters/)!
    expect(Number(lo)).toBeGreaterThanOrEqual(lengthProfile.median)
  })

  it("never personalizes reply or polish modes (falls back to fixed guide)", () => {
    const profile = { ...baseProfile, lengthProfile }
    expect(resolveLengthGuide("reply", "medium", profile)).not.toMatch(/this person's normal post/)
    expect(resolveLengthGuide("polish", "medium", profile)).not.toMatch(/this person's normal post/)
  })

  it("a null styleProfile never breaks generation", () => {
    expect(() => resolveLengthGuide("tweet", "medium", null)).not.toThrow()
  })
})

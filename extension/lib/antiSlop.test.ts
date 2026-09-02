import { describe, expect, it } from "vitest"
import { detectSlop, withAntiSlopCorrection } from "./antiSlop"
import type { StyleProfile } from "~lib/storage"

const BASE_PROFILE: StyleProfile = {
  confidence: "balanced", energy: "moderate", vocabularyComplexity: "moderate",
  capitalization: "standard", directness: "balanced",
  rhythm: "", punctuation: "commas and periods, no dashes", emojiUsage: "never", hashtagUsage: "never",
  humorStyle: "", formattingPreferences: "", rhetoricalDevices: "", cadence: "",
  confidenceScore: 0.8,
}

describe("H. anti-slop — generic AI-style phrases", () => {
  it("flags known generic-slop phrases", () => {
    const text = "The energy was unmatched and honestly the future is bright for this space."
    const result = detectSlop(text, null)
    expect(result.flagged).toBe(true)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it("flags a forced-lesson closer", () => {
    const result = detectSlop("Here's what I learned from the whole thing.", null)
    expect(result.flagged).toBe(true)
  })

  it("flags a padded three-item list ending", () => {
    const result = detectSlop("Solid event overall, good vibes, great people, and real conversations.", null)
    expect(result.flagged).toBe(true)
  })
})

describe("I. clean, human-like text is not flagged", () => {
  it("ordinary, specific writing with no slop signals passes clean", () => {
    const result = detectSlop("met a few builders at the summit yesterday, one of them is doing something genuinely interesting with rollups", null)
    expect(result.flagged).toBe(false)
    expect(result.reasons).toEqual([])
  })
})

describe("J. user-relative voice mismatch — detected against the learned StyleProfile", () => {
  it("flags em-dash overuse when the profile shows no dash usage", () => {
    const text = "went to the summit — met some builders — came away impressed"
    const result = detectSlop(text, BASE_PROFILE)
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((r) => r.includes("em-dash"))).toBe(true)
  })

  it("does not flag em dashes when the profile itself shows dash usage", () => {
    const profile: StyleProfile = { ...BASE_PROFILE, punctuation: "leans on em dashes for asides" }
    const text = "went to the summit — met some builders — came away impressed"
    const result = detectSlop(text, profile)
    expect(result.reasons.some((r) => r.includes("em-dash"))).toBe(false)
  })

  it("flags an emoji when the profile says this user never uses them", () => {
    const result = detectSlop("great event today 🔥", BASE_PROFILE)
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((r) => r.includes("emoji"))).toBe(true)
  })

  it("flags a hashtag when the profile says this user never uses them", () => {
    const result = detectSlop("great event today #web3", BASE_PROFILE)
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((r) => r.includes("hashtag"))).toBe(true)
  })

  it("flags standard capitalization when the profile is lowercase-leaning", () => {
    const profile: StyleProfile = { ...BASE_PROFILE, capitalization: "lowercase-leaning" }
    const result = detectSlop("Went To The Summit. It Was Genuinely Great.", profile)
    expect(result.flagged).toBe(true)
  })

  it("never flags anything when there's no styleProfile at all — only phrase signals apply", () => {
    const result = detectSlop("went to the summit — met some builders 🔥 #web3", null)
    expect(result.flagged).toBe(false)
  })
})

describe("withAntiSlopCorrection", () => {
  it("appends the corrective note without discarding an existing templateInstruction", () => {
    const out = withAntiSlopCorrection("Write as a product update.", ["generic event-energy praise"])
    expect(out).toContain("Write as a product update.")
    expect(out).toContain("generic event-energy praise")
  })

  it("stands alone when there was no existing instruction", () => {
    const out = withAntiSlopCorrection(undefined, ["forced lesson closer"])
    expect(out).toContain("forced lesson closer")
  })
})

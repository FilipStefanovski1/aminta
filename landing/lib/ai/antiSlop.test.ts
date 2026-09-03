import { describe, expect, it } from "vitest"
import { detectSlop, withAntiSlopCorrection } from "./antiSlop"
import type { StyleProfile } from "./prompts"

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

// v2.1 — semantic overclaiming / claim-provenance (§1, §2, §9, §10 of the
// generation-quality-v2.1 spec). The real example this was written
// against, verbatim from a real Gemini call (see
// landing/eval/generation-quality/REPORT.md):
const REAL_OVERCLAIM_EXAMPLE =
  "Walking around Solana Summit Serbia and it's obvious the next breakout consumer apps are being built here. No noise, just teams quietly shipping high-performance tech. That's the real leading indicator for the next cycle."

describe("semantic overclaiming — the real Gemini output that motivated this check", () => {
  it("flags the actual real-world output that slipped past the original phrase-only detector", () => {
    const result = detectSlop(REAL_OVERCLAIM_EXAMPLE, null)
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((r) => r.includes("it's obvious"))).toBe(true)
  })

  it("§9 bad example: a bare topic inflated into an unsupported ecosystem thesis is flagged", () => {
    const result = detectSlop(
      "it's obvious the next generation of consumer crypto apps is being built here",
      null,
      "solana summit serbia was pretty fun, met some smart people"
    )
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((r) => r.includes("not traceable"))).toBe(true)
  })

  it("§9 good example: a grounded rewrite staying close to what the user said is NOT flagged", () => {
    const result = detectSlop(
      "solana summit serbia was pretty fun, met some genuinely smart people there",
      null,
      "solana summit serbia was pretty fun, met some smart people"
    )
    expect(result.flagged).toBe(false)
  })

  it("§10: an explicit strong opinion the USER actually supplied is preserved, not flagged as overclaiming", () => {
    const input = "after this event i genuinely think solana is going to dominate consumer crypto"
    // The user's own strong claim, lightly rephrased by generation — high
    // word overlap with their own input, so even though it's a strong
    // claim, it's traceable to them, not invented.
    const output = "after solana summit serbia, i genuinely think solana is going to dominate consumer crypto in the next few years"
    const result = detectSlop(output, null, input)
    // No overclaim marker phrases ("it's obvious", "the future of", etc.)
    // appear in this sentence at all — the user's own strong claim doesn't
    // use those constructions, so nothing here should trigger on it.
    expect(result.reasons.some((r) => r.toLowerCase().includes("overclaim"))).toBe(false)
  })

  it("without sourceText, the overclaim check still fires on the phrase marker alone (no provenance distinction possible)", () => {
    const result = detectSlop("this is the beginning of a huge shift in the industry", null)
    expect(result.flagged).toBe(true)
  })

  it("a claim grounded in verified research context (passed as sourceText) is NOT penalized for low overlap with the user's bare topic", () => {
    const researchFacts = "Organized by Superteam Balkan. Hosted at the Sava Congress Center in Belgrade. Institutional partners included Serbia's Ministry of Finance and the Belgrade Stock Exchange."
    const output = "the future of this event is clearly institutional — the Ministry of Finance and the Belgrade Stock Exchange showed up"
    const result = detectSlop(output, null, `Solana Summit Serbia\n${researchFacts}`)
    const overclaimReason = result.reasons.find((r) => r.includes("the future of"))
    expect(overclaimReason).toBeDefined()
    expect(overclaimReason).not.toContain("not traceable") // grounded in the research text passed as sourceText
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

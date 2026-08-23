// Regression guard for the P0 style-fidelity fix: generated prompts must
// materially reflect a user's real punctuation/formatting/cadence — not
// just mention it in passing — and must never fall back to a generic
// compressed "AI-caption" default when the profile is thin or absent.
import { describe, expect, it } from "vitest"
import { buildMessages } from "~lib/prompts"
import type { StyleProfile } from "~lib/storage"

const VOICE = {
  niche: "general",
  tone: "natural",
  examples: "",
  voiceStyle: "",
  voiceInspiration: "",
  customRules: "",
}

function baseProfile(overrides: Partial<StyleProfile>): StyleProfile {
  return {
    confidence: "balanced",
    energy: "moderate",
    vocabularyComplexity: "moderate",
    capitalization: "standard",
    directness: "balanced",
    rhythm: "",
    punctuation: "",
    emojiUsage: "",
    humorStyle: "",
    formattingPreferences: "",
    rhetoricalDevices: "",
    cadence: "",
    confidenceScore: 0.85,
    lengthProfile: null,
    ...overrides,
  }
}

// PROFILE A — commas frequently, proper punctuation, blank line between
// thoughts, 2-3 sentence posts.
const PROFILE_A = baseProfile({
  punctuation: "commas and periods used naturally, full sentences",
  formattingPreferences: "blank line between separate thoughts",
  cadence: "2-3 sentence thoughts, measured pacing",
  capitalization: "standard",
})

// PROFILE B — minimal punctuation, single-line, short fragments.
const PROFILE_B = baseProfile({
  punctuation: "minimal, rarely uses periods or commas",
  formattingPreferences: "single-line, no line breaks",
  cadence: "short punchy fragments",
  capitalization: "lowercase-leaning",
})

function systemPrompt(styleProfile: StyleProfile | null): string {
  const messages = buildMessages("x", "tweet", VOICE, "a topic", styleProfile)
  return messages.find((m) => m.role === "system")!.content as string
}

describe("style-fidelity: prompt instructions materially differ per profile", () => {
  it("Profile A's and Profile B's prompts are not just distinguishable but describe opposite punctuation", () => {
    const a = systemPrompt(PROFILE_A)
    const b = systemPrompt(PROFILE_B)

    expect(a).toContain("PUNCTUATION: Match exactly how this person uses commas, periods, dashes, and apostrophes — commas and periods used naturally, full sentences.")
    expect(b).toContain("PUNCTUATION: Match exactly how this person uses commas, periods, dashes, and apostrophes — minimal, rarely uses periods or commas.")
    expect(a).not.toEqual(b)
  })

  it("Profile A's and Profile B's line-break/spacing instructions materially differ", () => {
    const a = systemPrompt(PROFILE_A)
    const b = systemPrompt(PROFILE_B)

    expect(a).toContain("blank line between separate thoughts")
    expect(b).toContain("single-line, no line breaks")
  })

  it("Profile A's and Profile B's cadence instructions materially differ", () => {
    const a = systemPrompt(PROFILE_A)
    const b = systemPrompt(PROFILE_B)

    expect(a).toContain("CADENCE: Match this person's sentence lengths and transitions — 2-3 sentence thoughts, measured pacing.")
    expect(b).toContain("CADENCE: Match this person's sentence lengths and transitions — short punchy fragments.")
  })

  it("a real, punctuation-rich profile is never silently downgraded toward fragment style", () => {
    const a = systemPrompt(PROFILE_A)
    // The active default-fights-the-bias instruction must still be present
    // even when a real profile exists — it's not conditional on profile
    // presence, only ever overridden BY the profile's own real signal.
    expect(a).toContain("Never default to a compressed lowercase AI-caption style")
  })

  it("with no StyleProfile at all, the prompt still actively defaults to normal punctuation, not silence", () => {
    const none = systemPrompt(null)
    expect(none).toContain("write real sentences with normal commas, periods, capitalization, and natural spacing")
    expect(none).toContain("Never default to a compressed lowercase AI-caption style")
  })

  it("tone never overrides the punctuation/line-break identity — the independence rule is explicit", () => {
    const a = systemPrompt(PROFILE_A)
    expect(a).toContain("Tone changes attitude and word choice ONLY")
    expect(a).toContain("Witty does not mean fragment-only")
  })
})

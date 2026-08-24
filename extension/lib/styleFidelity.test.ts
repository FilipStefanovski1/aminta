// Regression guard for the P0 style-fidelity fix: generated prompts must
// materially reflect a user's real punctuation/formatting/cadence — not
// just mention it in passing — and must never fall back to a generic
// compressed "AI-caption" default when the profile is thin or absent.
import { describe, expect, it } from "vitest"
import { buildMessages, buildThreadMessages } from "~lib/prompts"
import type { StyleProfile } from "~lib/storage"

const VOICE = {
  niche: "general",
  tone: "natural",
  examples: "",
  voiceStyle: "",
  voiceInspiration: "",
  customRules: "",
}

// Real writing examples (a founder's own posts) — used to prove they NEVER
// reach a generation prompt directly. Only the extracted, topic-free
// StyleProfile does (see lib/styleProfile.ts's file-header comment) — this
// is what makes "learn style, never copy content" structurally guaranteed
// rather than merely instructed.
const RAW_EXAMPLES_TEXT = "solana has been cooking lately, distribution matters way more than people admit"

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
    hashtagUsage: "",
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

function systemPrompt(styleProfile: StyleProfile | null, voice: typeof VOICE = VOICE): string {
  const messages = buildMessages("x", "tweet", voice, "a topic", styleProfile)
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

  it("hashtag usage is a grounded field, distinct from emoji usage, and reaches the prompt", () => {
    const withHashtags = systemPrompt(baseProfile({ hashtagUsage: "one relevant hashtag at the end" }))
    const withoutHashtags = systemPrompt(baseProfile({ hashtagUsage: "never" }))
    expect(withHashtags).toContain("Hashtag usage: one relevant hashtag at the end")
    expect(withoutHashtags).toContain("Hashtag usage: never")
    expect(withHashtags).toContain("Hashtag usage line clearly shows this person uses them")
  })
})

describe("style-fidelity: content vs style — real writing examples never leak into generation", () => {
  it("raw example text never appears in a tweet prompt even when voice.examples is populated", () => {
    const voiceWithExamples = { ...VOICE, examples: RAW_EXAMPLES_TEXT }
    const messages = buildMessages("x", "tweet", voiceWithExamples, "ai agents", PROFILE_A)
    const all = messages.map((m) => m.content).join("\n")
    expect(all).not.toContain(RAW_EXAMPLES_TEXT)
    expect(all).not.toContain("solana")
    expect(all).not.toContain("cooking lately")
  })

  it("raw example text never appears in a thread prompt either", () => {
    const voiceWithExamples = { ...VOICE, examples: RAW_EXAMPLES_TEXT }
    const messages = buildThreadMessages(voiceWithExamples, "ai agents", PROFILE_A)
    const all = messages.map((m) => m.content).join("\n")
    expect(all).not.toContain(RAW_EXAMPLES_TEXT)
    expect(all).not.toContain("solana")
  })
})

describe("style-fidelity: explicit Instincts outrank inferred style", () => {
  it("custom rules (Instincts) reach the prompt and are framed as highest priority", () => {
    const voiceWithRules = { ...VOICE, customRules: "no hashtags\nkeep it under 200 characters" }
    const system = systemPrompt(PROFILE_A, voiceWithRules)
    expect(system).toContain("no hashtags")
    expect(system).toContain("keep it under 200 characters")
    expect(system).toContain("CUSTOM RULES (highest priority")
  })

  it("the explicit style-priority hierarchy is stated: custom rules > writing style > tone > defaults", () => {
    const system = systemPrompt(PROFILE_A)
    expect(system).toContain("STYLE PRIORITY (highest to lowest): CUSTOM RULES")
    expect(system).toContain("CUSTOM RULES wins")
  })
})

describe("style-fidelity: every mode receives voice context", () => {
  it("reply mode includes the WRITING STYLE block", () => {
    const messages = buildMessages("x", "reply", VOICE, "someone's post", PROFILE_A)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("WRITING STYLE")
    expect(system).toContain("commas and periods used naturally")
  })

  it("polish mode includes the WRITING STYLE block AND explicit voice-preservation instructions", () => {
    const messages = buildMessages("x", "polish", VOICE, "rough draft text", PROFILE_A)
    const system = messages.find((m) => m.role === "system")!.content as string
    const user = messages.find((m) => m.role === "user")!.content as string
    expect(system).toContain("WRITING STYLE")
    expect(user).toContain("PRESERVE my meaning, personality, formality, and language exactly")
  })

  it("thread mode includes the WRITING STYLE block", () => {
    const messages = buildThreadMessages(VOICE, "a topic", PROFILE_A)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("WRITING STYLE")
    expect(system).toContain("commas and periods used naturally")
  })
})

// Instincts overhaul: every generation-writing mode (Post/Reply/Polish/
// Thread) must receive active Instincts (VoiceProfile.customRules), and a
// user with zero Instincts must never see a CUSTOM RULES section at all —
// an empty/absent block is prompt noise, not a neutral default.
describe("Instincts reach every mode, and add no noise when empty", () => {
  const VOICE_WITH_RULES = { ...VOICE, customRules: "no hashtags\nkeep it concise" }

  it("post (tweet) mode receives active instincts", () => {
    const system = systemPrompt(PROFILE_A, VOICE_WITH_RULES)
    expect(system).toContain("no hashtags")
    expect(system).toContain("keep it concise")
  })

  it("reply mode receives active instincts", () => {
    const messages = buildMessages("x", "reply", VOICE_WITH_RULES, "someone's post", PROFILE_A)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("no hashtags")
  })

  it("polish mode receives active instincts", () => {
    const messages = buildMessages("x", "polish", VOICE_WITH_RULES, "rough draft", PROFILE_A)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("no hashtags")
  })

  it("thread mode receives active instincts", () => {
    const messages = buildThreadMessages(VOICE_WITH_RULES, "a topic", PROFILE_A)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("no hashtags")
    expect(system).toContain("keep it concise")
  })

  it("zero instincts: the populated CUSTOM RULES block never appears (STYLE PRIORITY's own explanatory mention of the concept is unrelated and always present)", () => {
    for (const mode of ["tweet", "reply", "polish"] as const) {
      const messages = buildMessages("x", mode, VOICE, "input text", PROFILE_A)
      const system = messages.find((m) => m.role === "system")!.content as string
      expect(system).not.toContain("CUSTOM RULES (highest priority")
    }
    const threadMessages = buildThreadMessages(VOICE, "a topic", PROFILE_A)
    const threadSystem = threadMessages.find((m) => m.role === "system")!.content as string
    expect(threadSystem).not.toContain("CUSTOM RULES (highest priority")
  })
})

// The exact scenario from the product spec: a writing example implies
// normal capitalization, but an explicit Instinct says "use lowercase."
// We never call a live model here — this proves the PROMPT ITSELF states
// the hierarchy unambiguously, which is all that's mechanically testable.
describe("Instincts override a conflicting learned tendency — the prompt says so explicitly", () => {
  it("explicit 'use lowercase' instinct is framed as overriding standard-capitalization style evidence", () => {
    // Style evidence extracted from a normally-capitalized writing example
    // ("I Think This Is Actually Pretty Interesting.") — see
    // lib/styleProfile.ts's extraction schema for the `capitalization` enum.
    const normalCapsProfile = baseProfile({ capitalization: "standard" })
    const voiceWithLowercaseInstinct = { ...VOICE, customRules: "Write entirely in lowercase unless proper nouns require capitalization." }

    const system = systemPrompt(normalCapsProfile, voiceWithLowercaseInstinct)

    // Both pieces of (conflicting) evidence are present in the prompt...
    expect(system).toContain("Capitalization: standard")
    expect(system).toContain("Write entirely in lowercase")
    // ...but the prompt explicitly states which one wins, and why.
    expect(system).toContain("STYLE PRIORITY (highest to lowest): CUSTOM RULES")
    expect(system).toContain("CUSTOM RULES wins")
    expect(system).toContain("CUSTOM RULES (highest priority")
  })
})

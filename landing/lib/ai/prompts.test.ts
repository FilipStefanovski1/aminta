// Regression guard: this file's resolveLengthGuide/lengthProfile support
// did not exist at all until this fix — Included AI generation (Free/Pro
// users without BYOK) always used the generic fixed LENGTH_GUIDE regardless
// of the user's own learned posting length. See extension/lib/prompts.ts's
// identical resolveLengthGuide (SOURCE OF TRUTH) and lib/premiseAndLength
// .test.ts on the extension side for the fuller test suite.
import { describe, expect, it } from "vitest"
import { buildMessages, buildThreadMessages, resolveLengthGuide, type StyleProfile } from "./prompts"

const VOICE = { niche: "general", tone: "natural", examples: "", voiceStyle: "", voiceInspiration: "", customRules: "" }

const profileWithBaseline: StyleProfile = {
  confidence: "balanced", energy: "moderate", vocabularyComplexity: "moderate",
  capitalization: "standard", directness: "balanced",
  rhythm: "", punctuation: "", emojiUsage: "", hashtagUsage: "", humorStyle: "", formattingPreferences: "", rhetoricalDevices: "", cadence: "",
  confidenceScore: 0.85,
  lengthProfile: { p25: 180, median: 220, p75: 260 },
}

describe("resolveLengthGuide (Included AI backend)", () => {
  it("personalizes Medium to the user's own learned range when a baseline exists", () => {
    const guide = resolveLengthGuide("tweet", "medium", profileWithBaseline)
    expect(guide).toContain("close to how this person normally writes")
    expect(guide).toContain("220 characters")
  })

  it("falls back to the fixed range with no baseline", () => {
    expect(resolveLengthGuide("tweet", "medium", null)).toContain("150-260 characters")
  })

  it("buildMessages() actually uses resolveLengthGuide, not the flat fixed table", () => {
    const messages = buildMessages("tweet", VOICE, "solana summit serbia", profileWithBaseline)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("close to how this person normally writes")
  })

  it("the sparse-topic premise-development rule is present", () => {
    const messages = buildMessages("tweet", VOICE, "solana summit serbia", null)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("The topic above is a SEED, not a complete draft")
  })
})

// Regression fixture: this backend's buildThreadMessages had NO length
// parameter at all — Thread Creator's Short/Medium/Long selector never
// reached generation here, always using one fixed "under 280 characters"
// per-post cap with no floor. See extension/lib/prompts.ts's
// threadPostDepthGuide (SOURCE OF TRUTH) for the fuller rationale.
describe("buildThreadMessages: length now reaches thread generation", () => {
  it("defaults to medium depth guidance when no length is passed", () => {
    const messages = buildThreadMessages(VOICE, "solana summit serbia", null)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("PER-POST DEPTH: MEDIUM")
  })

  it("short and long produce materially different per-post depth guidance", () => {
    const shortSystem = buildThreadMessages(VOICE, "solana summit serbia", null, "direct", "short")
      .find((m) => m.role === "system")!.content as string
    const longSystem = buildThreadMessages(VOICE, "solana summit serbia", null, "direct", "long")
      .find((m) => m.role === "system")!.content as string
    expect(shortSystem).toContain("PER-POST DEPTH: SHORT")
    expect(longSystem).toContain("PER-POST DEPTH: LONG")
  })

  it("a personalized lengthProfile reaches the thread path", () => {
    const system = buildThreadMessages(VOICE, "solana summit serbia", profileWithBaseline, "direct", "medium")
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("This person's own posts typically run around 220 characters")
  })

  it("requires narrative progression, not fragment padding", () => {
    const system = buildThreadMessages(VOICE, "solana summit serbia", null)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("ONE coherent idea developing across the posts, not a single point chopped into fragments")
  })

  it("requires middle posts to each add something new, never restate the hook or an earlier point", () => {
    const system = buildThreadMessages(VOICE, "solana summit serbia", null)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("MIDDLE POSTS")
    expect(system).toContain("each one must advance the idea with something genuinely new")
    expect(system).toContain("Never restate or rephrase the hook")
  })

  it("treats the final post as the payoff/conclusion, not forced or generic", () => {
    const system = buildThreadMessages(VOICE, "solana summit serbia", null)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("FINAL POST (the payoff)")
    expect(system).toContain("feel like a deliberate, earned ending")
  })
})

// Regression guard for the "Medium is one short fragment" P0: a sparse
// topic ("solana summit serbia") must not collapse the output down to a
// near-verbatim paraphrase, and Medium must reflect the user's own learned
// posting depth when a lengthProfile exists — not always the generic fixed
// range.
import { describe, expect, it } from "vitest"
import { buildMessages, buildThreadMessages, resolveLengthGuide } from "~lib/prompts"
import type { StyleProfile } from "~lib/storage"

const VOICE = { niche: "general", tone: "natural", examples: "", voiceStyle: "", voiceInspiration: "", customRules: "" }
const SPARSE_TOPIC = "solana summit serbia"

function systemPrompt(mode: "tweet" | "reply" | "polish", styleProfile: StyleProfile | null = null, input = SPARSE_TOPIC): string {
  const messages = buildMessages("x", mode, VOICE, input, styleProfile)
  return messages.find((m) => m.role === "system")!.content as string
}

describe("sparse-topic premise development", () => {
  it("a three-word topic still gets full Medium length guidance, not a degraded target", () => {
    const system = systemPrompt("tweet")
    expect(system).toMatch(/LENGTH TARGET: roughly 150-260 characters/)
  })

  it("the prompt explicitly says the topic is a seed, not a complete draft, and never a reason to refuse", () => {
    const system = systemPrompt("tweet")
    expect(system).toContain("The topic above is a SEED, not a complete draft")
    expect(system).toContain("a short topic (a few words) is not an instruction to write a short post, and it is never a reason to refuse or ask for more detail")
  })

  it("lists safe subjective angles the model may infer", () => {
    const system = systemPrompt("tweet")
    expect(system).toContain("opinion, anticipation, personal perspective, general observation, a builder's/founder's angle, a question, or a reflection")
  })

  it("instructs against inventing factual specifics — stay subjective when unknown", () => {
    const system = systemPrompt("tweet")
    expect(system).toContain("Do NOT invent statistics, event details not provided, speaker names, dates, attendance numbers, announcements")
    expect(system).toContain("stay subjective/general")
  })

  it("reply and polish modes do not get the premise-development note — they already have real source content", () => {
    const replySystem = systemPrompt("reply", null, "someone's tweet to reply to")
    const polishSystem = systemPrompt("polish", null, "a rough draft")
    expect(replySystem).not.toContain("is a SEED, not a complete draft")
    expect(polishSystem).not.toContain("is a SEED, not a complete draft")
  })
})

describe("personalized Medium length actually reaches the prompt", () => {
  const profileWithBaseline: StyleProfile = {
    confidence: "balanced", energy: "moderate", vocabularyComplexity: "moderate",
    capitalization: "standard", directness: "balanced",
    rhythm: "", punctuation: "", emojiUsage: "", hashtagUsage: "", humorStyle: "", formattingPreferences: "", rhetoricalDevices: "", cadence: "",
    confidenceScore: 0.85,
    lengthProfile: { p25: 180, median: 220, p75: 260 },
  }

  it("Medium targets the user's own learned range, not the generic fixed one, when a baseline exists", () => {
    const guide = resolveLengthGuide("tweet", "medium", profileWithBaseline)
    expect(guide).toContain("close to how this person normally writes")
    expect(guide).toContain("220 characters")
    expect(guide).not.toContain("150-260 characters (X's classic single-post ceiling)")
  })

  it("falls back to the fixed range when there is no baseline yet", () => {
    const guide = resolveLengthGuide("tweet", "medium", null)
    expect(guide).toContain("150-260 characters")
  })

  it("a full buildMessages() call surfaces the personalized target end-to-end", () => {
    const system = systemPrompt("tweet", profileWithBaseline)
    expect(system).toContain("close to how this person normally writes")
  })
})

describe("thread prompt requires substantive progression, not fragment padding", () => {
  it("includes the premise-development rule for threads too", () => {
    const messages = buildThreadMessages(VOICE, SPARSE_TOPIC, null)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("The topic is a SEED, not a complete draft")
  })

  it("explicitly warns against one-line-fragment posts padded to hit a count", () => {
    const messages = buildThreadMessages(VOICE, SPARSE_TOPIC, null)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("a thread of near-duplicate one-liners is a failure, not a valid thread")
  })

  // Regression fixture requested after live QA on exactly this input:
  // topic="solana summit serbia", length=medium, tone=direct — the actual
  // generation that collapsed into 4 disconnected slogans ("time to build").
  describe("regression fixture: solana summit serbia / medium / direct", () => {
    const messages = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "medium")
    const system = messages.find((m) => m.role === "system")!.content as string

    it("requires premise development, not paraphrase", () => {
      expect(system).toContain("The topic is a SEED, not a complete draft")
    })

    it("requires narrative progression across posts (hook -> why it matters -> perspective -> payoff)", () => {
      expect(system).toContain("THREAD SHAPE")
      expect(system).toContain("hook/observation, then why it matters, then a perspective")
      expect(system).toContain("every consecutive post must add something NEW")
    })

    it("requires substantive Medium depth, not a bare slogan default", () => {
      expect(system).toContain("PER-POST DEPTH: MEDIUM")
      expect(system).toContain("not a one-line fragment or slogan")
      expect(system).toContain("under about 60-80 characters should be rare")
    })

    it("still requires DNA/WRITING STYLE preservation alongside the length/narrative fix", () => {
      expect(system).toContain("WRITING STYLE")
      expect(system).toContain("write real sentences with normal commas, periods, capitalization, and natural spacing")
    })

    it("does not encourage inventing factual specifics", () => {
      expect(system).toContain("Do NOT invent statistics, event details not provided, speaker names, dates, attendance numbers, announcements")
    })

    it("is never a reason to refuse or ask the user to rephrase a sparse topic", () => {
      expect(system).toContain("never a reason to refuse or ask for a more detailed topic")
    })
  })

  it("a personalized lengthProfile reaches the THREAD path, not just Tweet generation", () => {
    const profileWithBaseline: StyleProfile = {
      confidence: "balanced", energy: "moderate", vocabularyComplexity: "moderate",
      capitalization: "standard", directness: "balanced",
      rhythm: "", punctuation: "", emojiUsage: "", hashtagUsage: "", humorStyle: "", formattingPreferences: "", rhetoricalDevices: "", cadence: "",
      confidenceScore: 0.85,
      lengthProfile: { p25: 180, median: 220, p75: 260 },
    }
    const messages = buildThreadMessages(VOICE, SPARSE_TOPIC, profileWithBaseline, "direct", "medium")
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("This person's own posts typically run around 220 characters")
  })

  it("without a lengthProfile, thread depth still gets a real (non-personalized) anchor, not silence", () => {
    const messages = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "medium")
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("PER-POST DEPTH: MEDIUM")
    expect(system).not.toContain("This person's own posts typically run around")
  })

  it("short and long thread depth guidance are materially different from medium", () => {
    const shortMsgs = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "short")
    const longMsgs = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "long")
    const shortSystem = shortMsgs.find((m) => m.role === "system")!.content as string
    const longSystem = longMsgs.find((m) => m.role === "system")!.content as string
    expect(shortSystem).toContain("PER-POST DEPTH: SHORT")
    expect(longSystem).toContain("PER-POST DEPTH: LONG")
    expect(shortSystem).not.toBe(longSystem)
  })
})

describe("thread post count (Posts selector) is independent from Length (per-post depth)", () => {
  it("defaults to exactly 4 posts when no count is passed", () => {
    const messages = buildThreadMessages(VOICE, SPARSE_TOPIC, null)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("POST COUNT: write EXACTLY 4 posts")
  })

  it.each([2, 3, 4, 5] as const)("count=%i requests exactly that many posts", (count) => {
    const messages = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "medium", count)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain(`POST COUNT: write EXACTLY ${count} posts`)
  })

  it('"6+" requests a 6-8 range instead of a fixed number', () => {
    const messages = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "medium", "6+")
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("POST COUNT: choose a sensible number of posts between 6 and 8")
    expect(system).not.toContain("write EXACTLY")
  })

  it("never pads a weak idea just to hit the selected count", () => {
    const messages = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "medium", 5)
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("develop different angles, steps, or supporting details rather than repeating the same point")
  })

  it("changing Posts does not change the Length (per-post depth) guidance", () => {
    const twoPosts = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "long", 2)
    const fivePosts = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "long", 5)
    const sysTwo = twoPosts.find((m) => m.role === "system")!.content as string
    const sysFive = fivePosts.find((m) => m.role === "system")!.content as string
    expect(sysTwo).toContain("PER-POST DEPTH: LONG")
    expect(sysFive).toContain("PER-POST DEPTH: LONG")
  })

  it("changing Length does not change the Posts (count) guidance", () => {
    const shortLength = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "short", 3)
    const longLength = buildThreadMessages(VOICE, SPARSE_TOPIC, null, "direct", "long", 3)
    const sysShort = shortLength.find((m) => m.role === "system")!.content as string
    const sysLong = longLength.find((m) => m.role === "system")!.content as string
    expect(sysShort).toContain("POST COUNT: write EXACTLY 3 posts")
    expect(sysLong).toContain("POST COUNT: write EXACTLY 3 posts")
  })
})

describe("DNA formatting constraints remain present alongside the length/premise fix", () => {
  it("the WRITING STYLE structural headers still appear even with the new premise-development note", () => {
    const profile: StyleProfile = {
      confidence: "balanced", energy: "moderate", vocabularyComplexity: "moderate",
      capitalization: "standard", directness: "balanced",
      rhythm: "measured", punctuation: "commas and periods used naturally", emojiUsage: "", hashtagUsage: "",
      humorStyle: "", formattingPreferences: "blank line between thoughts", rhetoricalDevices: "",
      cadence: "2-3 sentence thoughts",
      confidenceScore: 0.85, lengthProfile: null,
    }
    const system = systemPrompt("tweet", profile)
    expect(system).toContain("PUNCTUATION: Match exactly how this person uses commas, periods, dashes, and apostrophes — commas and periods used naturally.")
    expect(system).toContain("LINE BREAKS & SPACING:")
    expect(system).toContain("CADENCE:")
  })
})

// Sparse input is a first-class use case, not an edge case — these are all
// valid Thread Creator inputs on their own, with no additional detail.
describe("sparse topics beyond the regression fixture — all get real premise development", () => {
  const SPARSE_TOPICS = ["building in public", "founder burnout", "ai agents"]

  it.each(SPARSE_TOPICS)('tweet mode: "%s" gets the seed/premise-development rule, not a refusal path', (topic) => {
    const system = systemPrompt("tweet", null, topic)
    expect(system).toContain("The topic above is a SEED, not a complete draft")
    expect(system).toContain("never a reason to refuse or ask for more detail")
  })

  it.each(SPARSE_TOPICS)('thread mode: "%s" gets premise development, narrative shape, and Medium depth together', (topic) => {
    const messages = buildThreadMessages(VOICE, topic, null, "direct", "medium")
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toContain("The topic is a SEED, not a complete draft")
    expect(system).toContain("THREAD SHAPE")
    expect(system).toContain("PER-POST DEPTH: MEDIUM")
  })

  it.each(SPARSE_TOPICS)('"%s" carries the anti-fabrication rule (stay subjective when specifics aren\'t known)', (topic) => {
    const system = systemPrompt("tweet", null, topic)
    expect(system).toContain("Do NOT invent statistics, event details not provided, speaker names, dates, attendance numbers, announcements")
  })
})

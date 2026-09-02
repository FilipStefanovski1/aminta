// Regression guard: this file's resolveLengthGuide/lengthProfile support
// did not exist at all until this fix — Included AI generation (Free/Pro
// users without BYOK) always used the generic fixed LENGTH_GUIDE regardless
// of the user's own learned posting length. See extension/lib/prompts.ts's
// identical resolveLengthGuide (SOURCE OF TRUTH) and lib/premiseAndLength
// .test.ts on the extension side for the fuller test suite.
import { describe, expect, it } from "vitest"
import { buildAntiSlopRewriteMessages, buildMessages, buildThreadMessages, resolveLengthGuide, type StyleProfile } from "./prompts"
import type { EntityContext } from "./contextEnrichment"

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

  it("L. explicit Medium/Long depth guidance remains intact under the changes in this file", () => {
    const medium = buildThreadMessages(VOICE, "solana summit serbia", null, "direct", "medium")
      .find((m) => m.role === "system")!.content as string
    const long = buildThreadMessages(VOICE, "solana summit serbia", null, "direct", "long")
      .find((m) => m.role === "system")!.content as string
    expect(medium).toContain("PER-POST DEPTH: MEDIUM")
    expect(long).toContain("PER-POST DEPTH: LONG")
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

const ENTITY_CONTEXT: EntityContext = {
  entityName: "Solana Summit Serbia",
  entityType: "event",
  verifiedFacts: ["A Solana ecosystem conference held in Serbia."],
  notableTopics: ["DeFi"],
  people: [],
  dates: ["2026"],
  sourceRefs: [],
}

describe("A/B — draft-preservation level scales with how much the user already wrote", () => {
  it("A. a bare topic gets the low-preservation (full construction freedom) instruction", () => {
    const system = buildMessages("tweet", VOICE, "Solana Summit Serbia", null)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("The topic above is a SEED, not a complete draft")
  })

  it("B. a substantial rough draft gets the medium-preservation instruction, not the bare-topic one", () => {
    const draft = "went to solana summit serbia and expected it to be mid but met some genuinely smart people there"
    const system = buildMessages("tweet", VOICE, draft, null)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("PRESERVE that content: their stated reaction")
    expect(system).not.toContain("The topic above is a SEED")
  })

  it("a developed multi-sentence draft gets the high-preservation instruction (retain order, selective rewrite)", () => {
    const draft = "Went to the summit yesterday. Honestly expected it to be mid, but ended up meeting a handful of genuinely sharp builders working on interesting stuff that changed my whole take on it"
    const system = buildMessages("tweet", VOICE, draft, null)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("Retain most of their ideas and their order")
  })

  it("a near-finished draft gets the max-preservation (minimal intervention) instruction", () => {
    const draft = "Went to the summit yesterday expecting it to be pretty average given all the hype online. Ended up meeting a handful of genuinely sharp builders working on interesting infra problems, which completely changed my read on the whole event. Definitely coming back next year if they run it again."
    const system = buildMessages("tweet", VOICE, draft, null)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("closer to a light copyedit than a rewrite")
  })

  it("reply and polish are unaffected by preservation-level scaling — their own framing stays exactly as before", () => {
    const reply = buildMessages("reply", VOICE, "someone's post here", null)
      .find((m) => m.role === "system")!.content as string
    expect(reply).not.toContain("The topic above is a SEED")
    expect(reply).not.toContain("closer to a light copyedit")
  })
})

describe("C. never invent personal experience — universal, present at every preservation level", () => {
  it("the rule is present for a bare topic", () => {
    const system = buildMessages("tweet", VOICE, "Solana Summit Serbia", null)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("Never invent personal experience")
  })

  it("the rule is present for a developed draft too", () => {
    const draft = "Went to the summit yesterday. Honestly expected it to be mid, but ended up meeting a handful of genuinely sharp builders working on interesting stuff that changed my whole take on it"
    const system = buildMessages("tweet", VOICE, draft, null)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("Never invent personal experience")
  })

  it("explicitly scopes verified context to objective facts, never the user's own thoughts/feelings", () => {
    const system = buildMessages("tweet", VOICE, "Solana Summit Serbia", null, "direct", "medium", undefined, false, undefined, ENTITY_CONTEXT)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("never fill in what the user themselves thought or did")
  })
})

describe("F. structured VERIFIED CONTEXT — only appears with real facts, never a raw dump", () => {
  it("no context block at all when no entity was researched", () => {
    const system = buildMessages("tweet", VOICE, "Solana Summit Serbia", null)
      .find((m) => m.role === "system")!.content as string
    expect(system).not.toContain("VERIFIED CONTEXT (public facts only")
  })

  it("renders the compact structured facts, not a raw dump, when context is present", () => {
    const system = buildMessages("tweet", VOICE, "Solana Summit Serbia", null, "direct", "medium", undefined, false, undefined, ENTITY_CONTEXT)
      .find((m) => m.role === "system")!.content as string
    expect(system).toContain("VERIFIED CONTEXT (public facts only")
    expect(system).toContain("A Solana ecosystem conference held in Serbia.")
    expect(system).toContain("Name: Solana Summit Serbia")
  })

  it("context is only ever wired for tweet mode, never reply/polish", () => {
    const system = buildMessages("reply", VOICE, "someone's post", null, "direct", "medium", undefined, false, undefined, ENTITY_CONTEXT)
      .find((m) => m.role === "system")!.content as string
    expect(system).not.toContain("VERIFIED CONTEXT (public facts only")
  })

  it("an empty/useless context object never renders an empty VERIFIED CONTEXT block", () => {
    const empty: EntityContext = { entityName: "", entityType: "", verifiedFacts: [], notableTopics: [], people: [], dates: [], sourceRefs: [] }
    const system = buildMessages("tweet", VOICE, "Solana Summit Serbia", null, "direct", "medium", undefined, false, undefined, empty)
      .find((m) => m.role === "system")!.content as string
    expect(system).not.toContain("VERIFIED CONTEXT (public facts only")
  })
})

describe("buildAntiSlopRewriteMessages — one bounded corrective rewrite", () => {
  it("reuses the exact original system prompt, unchanged", () => {
    const original = buildMessages("tweet", VOICE, "Solana Summit Serbia", null)
    const rewrite = buildAntiSlopRewriteMessages(original, "the energy was unmatched", ["generic event-energy praise"])
    expect(rewrite.find((m) => m.role === "system")!.content).toBe(original.find((m) => m.role === "system")!.content)
  })

  it("the user turn embeds the flagged draft and the specific reasons, asking for exactly one rewrite", () => {
    const original = buildMessages("tweet", VOICE, "Solana Summit Serbia", null)
    const rewrite = buildAntiSlopRewriteMessages(original, "the energy was unmatched", ["generic event-energy praise"])
    const user = rewrite.find((m) => m.role === "user")!.content as string
    expect(user).toContain("the energy was unmatched")
    expect(user).toContain("generic event-energy praise")
    expect(user).toContain("ONCE")
  })
})

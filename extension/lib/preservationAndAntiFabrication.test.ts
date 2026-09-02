// Extension-side mirror of landing/lib/ai/prompts.test.ts's A/B/C describe
// blocks — same draft-preservation scaling and universal anti-fabrication
// rule, applied to BYOK's copy of buildMessages (no VERIFIED CONTEXT here;
// research is server-only, see lib/draftIntent.ts's header).
import { describe, expect, it } from "vitest"
import { buildMessages } from "~lib/prompts"

const VOICE = { niche: "general", tone: "natural", examples: "", voiceStyle: "", voiceInspiration: "", customRules: "" }

function tweetSystem(input: string): string {
  return buildMessages("x", "tweet", VOICE, input, null).find((m) => m.role === "system")!.content as string
}

describe("A/B — draft-preservation level scales with how much the user already wrote (BYOK)", () => {
  it("A. a bare topic gets the low-preservation (full construction freedom) instruction", () => {
    expect(tweetSystem("Solana Summit Serbia")).toContain("The topic above is a SEED, not a complete draft")
  })

  it("B. a substantial rough draft gets the medium-preservation instruction, not the bare-topic one", () => {
    const draft = "went to solana summit serbia and expected it to be mid but met some genuinely smart people there"
    const system = tweetSystem(draft)
    expect(system).toContain("PRESERVE that content: their stated reaction")
    expect(system).not.toContain("The topic above is a SEED")
  })

  it("a developed multi-sentence draft gets the high-preservation instruction", () => {
    const draft = "Went to the summit yesterday. Honestly expected it to be mid, but ended up meeting a handful of genuinely sharp builders working on interesting stuff that changed my whole take on it"
    expect(tweetSystem(draft)).toContain("Retain most of their ideas and their order")
  })

  it("a near-finished draft gets the max-preservation (minimal intervention) instruction", () => {
    const draft = "Went to the summit yesterday expecting it to be pretty average given all the hype online. Ended up meeting a handful of genuinely sharp builders working on interesting infra problems, which completely changed my read on the whole event. Definitely coming back next year if they run it again."
    expect(tweetSystem(draft)).toContain("closer to a light copyedit than a rewrite")
  })
})

describe("C. never invent personal experience — universal, present at every preservation level (BYOK)", () => {
  it("present for a bare topic", () => {
    expect(tweetSystem("Solana Summit Serbia")).toContain("Never invent personal experience")
  })

  it("present for a developed draft too", () => {
    const draft = "Went to the summit yesterday. Honestly expected it to be mid, but ended up meeting a handful of genuinely sharp builders working on interesting stuff that changed my whole take on it"
    expect(tweetSystem(draft)).toContain("Never invent personal experience")
  })
})

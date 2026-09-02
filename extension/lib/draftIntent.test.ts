import { describe, expect, it } from "vitest"
import { classifyDraftIntent, preservationLevelFor } from "./draftIntent"

describe("classifyDraftIntent", () => {
  it("A. a bare topic classifies as topic -> low preservation (full freedom to construct)", () => {
    expect(classifyDraftIntent("Solana Summit Serbia")).toBe("topic")
    expect(preservationLevelFor(classifyDraftIntent("Solana Summit Serbia"))).toBe("low")
  })

  it("B. a short single-sentence rough thought classifies as rough -> medium preservation", () => {
    const draft = "went to solana summit serbia and expected it to be mid but met some really smart people"
    expect(classifyDraftIntent(draft)).toBe("rough")
    expect(preservationLevelFor(classifyDraftIntent(draft))).toBe("medium")
  })

  it("a real but shorter (2-sentence) draft classifies as developed -> high preservation", () => {
    const draft = "Went to the summit yesterday. Honestly expected it to be mid, but ended up meeting a handful of genuinely sharp builders working on interesting stuff that changed my whole take on it"
    expect(classifyDraftIntent(draft)).toBe("developed")
    expect(preservationLevelFor(classifyDraftIntent(draft))).toBe("high")
  })

  it("a long draft ending on terminal punctuation with several sentences classifies as near_final -> max preservation", () => {
    const draft = "Went to the summit yesterday expecting it to be pretty average given all the hype online. Ended up meeting a handful of genuinely sharp builders working on interesting infra problems, which completely changed my read on the whole event. Definitely coming back next year if they run it again."
    expect(classifyDraftIntent(draft)).toBe("near_final")
    expect(preservationLevelFor(classifyDraftIntent(draft))).toBe("max")
  })

  it("empty input is treated as a topic (nothing to preserve)", () => {
    expect(classifyDraftIntent("")).toBe("topic")
    expect(classifyDraftIntent("   ")).toBe("topic")
  })
})

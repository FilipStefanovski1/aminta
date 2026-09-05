// Personal Context reaching the INCLUDED AI prompt builder (server-side
// generation, app/api/generate/route.ts). Mirrors
// extension/lib/personalContextPrompt.test.ts — the same guarantees have to
// hold on both paths, since each app builds prompts from its own copy of
// prompts.ts.
import { describe, expect, it } from "vitest"
import { buildMessages, buildThreadMessages, type VoiceProfile } from "./prompts"

const BACKGROUND = "I'm building Aminta, an AI companion for people who write on X."

function voice(over: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    niche: "startups",
    tone: "direct",
    examples: "",
    voiceStyle: "",
    voiceInspiration: "",
    customRules: "",
    ...over,
  }
}

const systemOf = (messages: { role: string; content: unknown }[]) =>
  String(messages.find((m) => m.role === "system")!.content)

describe("personal context reaches every Included AI generation mode", () => {
  it.each(["tweet", "reply", "polish"] as const)("%s prompts carry it", (mode) => {
    const system = systemOf(buildMessages(mode, voice({ personalContext: BACKGROUND }), "some input"))
    expect(system).toContain("PERSONAL CONTEXT")
    expect(system).toContain(BACKGROUND)
  })

  it("thread prompts carry it too", () => {
    const system = systemOf(buildThreadMessages(voice({ personalContext: BACKGROUND }), "a topic", null))
    expect(system).toContain("PERSONAL CONTEXT")
    expect(system).toContain(BACKGROUND)
  })
})

describe("relevance + anti-hallucination instructions travel with it", () => {
  const system = () => systemOf(buildMessages("tweet", voice({ personalContext: BACKGROUND }), "had a good workout today"))

  it("tells the model to use it ONLY when genuinely relevant, and to ignore it otherwise", () => {
    expect(system()).toContain("ONLY when it's genuinely relevant")
    expect(system()).toContain("ignore it completely")
  })

  it("forbids forcing unrelated work/projects/interests into a post", () => {
    expect(system()).toContain("never work their work, projects, industry or interests into an unrelated post")
  })

  it("forbids inventing facts beyond what the user wrote", () => {
    expect(system()).toContain("Never state a fact about them that isn't written above")
    expect(system()).toContain("never invent details that merely sound consistent with it")
  })

  it("forbids turning background into a personal experience the user never described", () => {
    expect(system()).toContain("never turn background into something they did")
  })

  it("keeps the user's own input for the current post authoritative", () => {
    expect(system()).toContain("Their input for the current post always outranks this")
  })

  it("never lets it override Instincts (CUSTOM RULES)", () => {
    expect(system()).toContain("never overrides CUSTOM RULES")
  })

  it("is ranked below the request/source post in CONTEXT PRIORITY, never above", () => {
    const s = system()
    expect(s).toContain("CONTEXT PRIORITY")
    expect(s.indexOf("the topic/request below")).toBeLessThan(s.indexOf("then PERSONAL CONTEXT"))
  })

  it("labels it as background, explicitly not instructions or a list to mention", () => {
    expect(system()).toContain("NOT instructions, NOT a list of things to mention")
  })
})

describe("absent / legacy profiles", () => {
  it("adds no PERSONAL CONTEXT block at all when the user hasn't written one", () => {
    expect(systemOf(buildMessages("tweet", voice(), "topic"))).not.toContain("PERSONAL CONTEXT (background about this person, written by them")
  })

  it("a profile saved before the field existed (undefined) builds prompts exactly as before", () => {
    const legacy = voice()
    delete (legacy as Partial<VoiceProfile>).personalContext
    const system = systemOf(buildMessages("tweet", legacy, "topic"))
    expect(system).not.toContain("PERSONAL CONTEXT (background about this person, written by them")
    expect(system).toContain("NICHE: startups") // rest of the prompt is untouched
  })

  it("whitespace-only context is treated as empty", () => {
    expect(systemOf(buildMessages("tweet", voice({ personalContext: "   \n  " }), "topic")))
      .not.toContain("PERSONAL CONTEXT (background about this person, written by them")
  })

  it("caps an oversized context so it can't dominate the prompt", () => {
    const huge = "z".repeat(5000)
    const system = systemOf(buildMessages("tweet", voice({ personalContext: huge }), "topic"))
    expect(system).toContain("PERSONAL CONTEXT")
    expect(system).not.toContain("z".repeat(2100))
  })

  it("preserves multi-paragraph background verbatim", () => {
    const paragraphs = "I'm a designer.\n\nI'm building a tool for writers.\nI post about the process."
    expect(systemOf(buildMessages("tweet", voice({ personalContext: paragraphs }), "topic"))).toContain(paragraphs)
  })
})

import { describe, expect, it } from "vitest"
import {
  HELPER_PROMPT,
  MAX_PERSONAL_CONTEXT_CHARS,
  appendTranscript,
  normalizePersonalContext,
} from "./personalContext"

describe("normalizePersonalContext", () => {
  it("treats missing/empty personal context as empty — the state every pre-existing user is in", () => {
    expect(normalizePersonalContext(undefined)).toBe("")
    expect(normalizePersonalContext(null)).toBe("")
    expect(normalizePersonalContext("")).toBe("")
    expect(normalizePersonalContext("   \n  ")).toBe("")
  })

  it("preserves a real multi-paragraph answer exactly, including internal line breaks", () => {
    const written = "I'm Filip. I work around AI and product design.\n\nI'm building Aminta, an AI companion for X.\nI post about what I'm building."
    expect(normalizePersonalContext(written)).toBe(written)
  })

  it("trims only the outer whitespace, never the interior", () => {
    expect(normalizePersonalContext("  a\n\nb  ")).toBe("a\n\nb")
  })

  it("caps runaway input so it can never bloat every generation prompt", () => {
    const huge = "x".repeat(MAX_PERSONAL_CONTEXT_CHARS + 500)
    expect(normalizePersonalContext(huge)).toHaveLength(MAX_PERSONAL_CONTEXT_CHARS)
  })
})

describe("appendTranscript — speech APPENDS, never replaces", () => {
  it("keeps existing typed text and adds the new chunk after it", () => {
    expect(appendTranscript("I'm a developer.", "I build AI tools."))
      .toBe("I'm a developer. I build AI tools.")
  })

  it("appends a second chunk without touching the first", () => {
    const first = appendTranscript("", "I'm a designer.")
    const second = appendTranscript(first, "I care about typography.")
    expect(second).toBe("I'm a designer. I care about typography.")
  })

  it("uses the chunk alone when the field is empty", () => {
    expect(appendTranscript("", "hello there")).toBe("hello there")
  })

  it("respects the user's own trailing newline instead of forcing a space", () => {
    expect(appendTranscript("First paragraph.\n\n", "Second paragraph."))
      .toBe("First paragraph.\n\nSecond paragraph.")
  })

  it("ignores an empty/whitespace-only transcript rather than adding stray spaces", () => {
    expect(appendTranscript("unchanged", "   ")).toBe("unchanged")
    expect(appendTranscript("unchanged", "")).toBe("unchanged")
  })

  it("never grows past the cap", () => {
    const nearFull = "y".repeat(MAX_PERSONAL_CONTEXT_CHARS - 3)
    expect(appendTranscript(nearFull, "much longer transcript here")).toHaveLength(MAX_PERSONAL_CONTEXT_CHARS)
  })
})

describe("HELPER_PROMPT", () => {
  it("asks the other AI to interview one question at a time and return one first-person paragraph", () => {
    expect(HELPER_PROMPT).toContain("one at a time")
    expect(HELPER_PROMPT).toContain("first-person paragraph")
    expect(HELPER_PROMPT).toContain("Don't assume anything about me")
  })

  it("stays provider-agnostic — never hardcodes a specific AI product", () => {
    expect(HELPER_PROMPT).not.toMatch(/ChatGPT|Claude|Gemini|OpenAI|Anthropic/i)
  })
})

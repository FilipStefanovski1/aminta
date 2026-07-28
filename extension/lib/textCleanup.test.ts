import { describe, expect, it } from "vitest"
import { cleanGenerationOutput, isEmptyOutput, looksLikeVerbatimRepeat } from "~lib/textCleanup"

describe("cleanGenerationOutput", () => {
  it("passes clean text through unchanged", () => {
    expect(cleanGenerationOutput("Just shipped the new onboarding flow. Feels obvious in hindsight.")).toBe(
      "Just shipped the new onboarding flow. Feels obvious in hindsight."
    )
  })

  it("strips a leading label", () => {
    expect(cleanGenerationOutput("Tweet: This is the actual post.")).toBe("This is the actual post.")
    expect(cleanGenerationOutput("Reply: Solid point, but the numbers say otherwise.")).toBe(
      "Solid point, but the numbers say otherwise."
    )
    expect(cleanGenerationOutput("Here's a polished version: Cleaner draft here.")).toBe("Cleaner draft here.")
    expect(cleanGenerationOutput("Here's your reply: Nice catch.")).toBe("Nice catch.")
  })

  it("does not strip a mid-sentence colon that happens to follow a label-like word", () => {
    const text = "One rule: ship it before you overthink it."
    expect(cleanGenerationOutput(text)).toBe(text)
  })

  it("strips wrapping straight quotes", () => {
    expect(cleanGenerationOutput('"Wrapped in quotes for no reason."')).toBe("Wrapped in quotes for no reason.")
  })

  it("strips wrapping curly quotes", () => {
    expect(cleanGenerationOutput("“Curly quotes around the whole thing.”")).toBe(
      "Curly quotes around the whole thing."
    )
  })

  it("does not strip quotes that only wrap part of the text", () => {
    const text = 'She said "no thanks" and left.'
    expect(cleanGenerationOutput(text)).toBe(text)
  })

  it("strips a markdown code fence wrapper", () => {
    expect(cleanGenerationOutput("```\nThe actual post text.\n```")).toBe("The actual post text.")
  })

  it("collapses 3+ blank lines to one blank line", () => {
    expect(cleanGenerationOutput("Line one.\n\n\n\nLine two.")).toBe("Line one.\n\nLine two.")
  })

  it("preserves a single intentional line break", () => {
    expect(cleanGenerationOutput("Line one.\nLine two.")).toBe("Line one.\nLine two.")
  })

  it("removes spaces before punctuation", () => {
    expect(cleanGenerationOutput("This is a sentence , with bad spacing .")).toBe(
      "This is a sentence, with bad spacing."
    )
  })

  it("collapses duplicate exclamation/question marks but keeps a single one", () => {
    expect(cleanGenerationOutput("This is huge!!!")).toBe("This is huge!")
    expect(cleanGenerationOutput("Wait, really??")).toBe("Wait, really?")
  })

  it("does not touch an intentional ellipsis", () => {
    expect(cleanGenerationOutput("Still thinking about this one...")).toBe("Still thinking about this one...")
  })

  it("collapses duplicate commas", () => {
    expect(cleanGenerationOutput("First,, then second.")).toBe("First, then second.")
  })

  it("trims trailing whitespace per line without collapsing structure", () => {
    expect(cleanGenerationOutput("Line one.   \nLine two.  ")).toBe("Line one.\nLine two.")
  })

  it("does not alter intentional lowercase style", () => {
    const text = "shipped a small thing today. felt good."
    expect(cleanGenerationOutput(text)).toBe(text)
  })

  it("does not remove em dashes that are already part of the output", () => {
    const text = "The idea was simple — ship fast, learn faster."
    expect(cleanGenerationOutput(text)).toBe(text)
  })

  it("trims a wildly oversized output at a sentence boundary instead of mid-word", () => {
    const sentence = "This is one sentence that repeats. "
    const oversized = sentence.repeat(40) // ~1200 chars, over the 900 cap
    const result = cleanGenerationOutput(oversized)
    expect(result.length).toBeLessThan(oversized.length)
    expect(result.length).toBeLessThanOrEqual(900)
    // Ends on a real sentence boundary, not a chopped word.
    expect(result.endsWith(".")).toBe(true)
  })

  it("leaves normal-length output completely untouched by the length cap", () => {
    const text = "A totally normal length post that should never be trimmed by the safety cap."
    expect(cleanGenerationOutput(text)).toBe(text)
  })

  it("handles empty input safely", () => {
    expect(cleanGenerationOutput("")).toBe("")
    expect(cleanGenerationOutput("   ")).toBe("")
  })
})

describe("isEmptyOutput", () => {
  it("flags empty and whitespace-only text", () => {
    expect(isEmptyOutput("")).toBe(true)
    expect(isEmptyOutput("   \n  ")).toBe(true)
  })

  it("does not flag real content", () => {
    expect(isEmptyOutput("a real post")).toBe(false)
  })
})

describe("looksLikeVerbatimRepeat", () => {
  it("flags a reply that is essentially the source post restated", () => {
    const source = "Just shipped a huge redesign of our onboarding flow after three months of work"
    const output = "just shipped a huge redesign of the onboarding flow after three months of work!"
    expect(looksLikeVerbatimRepeat(output, source)).toBe(true)
  })

  it("does not flag a reply that shares a few words but adds a real reaction", () => {
    const source = "Just shipped a huge redesign of our onboarding flow after three months of work"
    const output = "three months is fast for a full onboarding redesign, most teams take twice that"
    expect(looksLikeVerbatimRepeat(output, source)).toBe(false)
  })

  it("does not flag a short reply against a long source post", () => {
    const source =
      "We spent the last quarter rebuilding our entire data pipeline from scratch, migrating off the legacy queue, rewriting the ingestion layer, and cutting our end-to-end latency by 80%"
    const output = "80% is a wild number for a rewrite that size."
    expect(looksLikeVerbatimRepeat(output, source)).toBe(false)
  })

  it("handles empty strings without throwing", () => {
    expect(looksLikeVerbatimRepeat("", "something")).toBe(false)
    expect(looksLikeVerbatimRepeat("something", "")).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { countExamples, parseExamples, serializeExamples } from "~lib/trainingExamples"

describe("serializeExamples / parseExamples round-trip", () => {
  it("a multi-paragraph post round-trips as ONE example, internal blank lines intact", () => {
    const post = "building this today.\n\nthe first version was terrible.\n\nshipped it anyway."
    const raw = serializeExamples([post])
    expect(parseExamples(raw)).toEqual([post])
  })

  it("two explicit example posts remain two examples", () => {
    const postOne = "building this today.\n\nthe first version was terrible.\n\nshipped it anyway."
    const postTwo = "spent three hours debugging something that ended up being one line.\n\nclassic."
    const raw = serializeExamples([postOne, postTwo])
    const parsed = parseExamples(raw)
    expect(parsed).toHaveLength(2)
    expect(parsed).toEqual([postOne, postTwo])
  })

  it("blank lines inside a post never create fake extra examples", () => {
    const post = "line one\n\nline two\n\nline three\n\nline four"
    const raw = serializeExamples([post])
    expect(parseExamples(raw)).toEqual([post])
  })

  it("empty/whitespace-only examples are dropped on serialize", () => {
    expect(parseExamples(serializeExamples(["real post", "   ", "", "another real post"])))
      .toEqual(["real post", "another real post"])
  })

  it("whitespace around a post is trimmed but internal paragraph structure survives", () => {
    const raw = serializeExamples(["  building this today.\n\nshipped it anyway.  "])
    expect(parseExamples(raw)).toEqual(["building this today.\n\nshipped it anyway."])
  })

  it("existing canonical (already-JSON) examples still load", () => {
    const raw = JSON.stringify(["post a", "post b", "post c"])
    expect(parseExamples(raw)).toEqual(["post a", "post b", "post c"])
  })
})

describe("parseExamples — legacy (pre-JSON) plain-text fallback", () => {
  it("a legacy plain string is treated as ONE example, never split on newlines", () => {
    const legacy = "building this today.\n\nthe first version was terrible.\n\nshipped it anyway."
    expect(parseExamples(legacy)).toEqual([legacy])
  })

  it("a single-line legacy string is also one example", () => {
    expect(parseExamples("just one line")).toEqual(["just one line"])
  })

  it("malformed JSON-looking text (starts with '[' but doesn't parse) falls back to one example", () => {
    const malformed = "[not actually json"
    expect(parseExamples(malformed)).toEqual([malformed])
  })
})

describe("parseExamples — empty / missing input", () => {
  it("undefined, null, and empty string all return no examples", () => {
    expect(parseExamples(undefined)).toEqual([])
    expect(parseExamples(null)).toEqual([])
    expect(parseExamples("")).toEqual([])
  })

  it("whitespace-only input returns no examples", () => {
    expect(parseExamples("   \n  ")).toEqual([])
  })

  it("an empty JSON array returns no examples", () => {
    expect(parseExamples("[]")).toEqual([])
  })
})

describe("countExamples", () => {
  it("counts canonical JSON examples correctly", () => {
    expect(countExamples(serializeExamples(["a", "b", "c"]))).toBe(3)
  })

  it("counts a multi-paragraph single post as exactly 1, not 3", () => {
    expect(countExamples(serializeExamples(["one\n\ntwo\n\nthree"]))).toBe(1)
  })

  it("counts a legacy plain-text blob as exactly 1 (never fragments it into a line count)", () => {
    expect(countExamples("first line\nsecond line\nthird line")).toBe(1)
  })

  it("counts missing/empty input as 0", () => {
    expect(countExamples(undefined)).toBe(0)
    expect(countExamples("")).toBe(0)
  })
})

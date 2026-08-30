import { describe, expect, it } from "vitest"
import { isPathologicallyShort, withLengthCorrection } from "~lib/lengthGuard"

describe("isPathologicallyShort", () => {
  it("flags a pathologically short Medium tweet", () => {
    expect(isPathologicallyShort("yeah this is wild", "tweet", "medium")).toBe(true)
  })

  it("flags a pathologically short Long tweet", () => {
    expect(isPathologicallyShort("nice", "tweet", "long")).toBe(true)
  })

  it("does not flag a reasonably developed Medium tweet", () => {
    expect(isPathologicallyShort("a fully developed take with real substance behind it", "tweet", "medium")).toBe(false)
  })

  it("never flags length 'short' — brevity is the point there", () => {
    expect(isPathologicallyShort("wow", "tweet", "short")).toBe(false)
  })

  it("never flags polish — LENGTH_GUIDE explicitly preserves the draft's own length", () => {
    expect(isPathologicallyShort("ok", "polish", "medium")).toBe(false)
    expect(isPathologicallyShort("ok", "polish", "long")).toBe(false)
  })

  it("uses a more conservative floor for replies — a short real reply is legitimate", () => {
    expect(isPathologicallyShort("completely agreed with this", "reply", "medium")).toBe(false) // 28 chars, above the reply floor
    expect(isPathologicallyShort("lol", "reply", "medium")).toBe(true) // 3 chars, below it
  })

  it("trims whitespace before measuring", () => {
    expect(isPathologicallyShort("   yeah this is wild   ", "tweet", "medium")).toBe(true)
  })
})

describe("withLengthCorrection", () => {
  it("uses the task's exact corrective phrasing, naming the requested length", () => {
    const note = withLengthCorrection(undefined, "medium")
    expect(note).toBe(
      "The previous result was substantially shorter than the requested Medium length. Expand the idea naturally while preserving the user's voice. Do not add filler."
    )
  })

  it("names Long when the requested length is long", () => {
    expect(withLengthCorrection(undefined, "long")).toContain("requested Long length")
  })

  it("appends to an existing templateInstruction rather than replacing it", () => {
    const note = withLengthCorrection("Write it as a product post.", "medium")
    expect(note).toContain("Write it as a product post.")
    expect(note).toContain("substantially shorter than the requested Medium length")
    expect(note.indexOf("Write it as a product post.")).toBeLessThan(note.indexOf("substantially shorter"))
  })
})

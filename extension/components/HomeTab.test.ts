import { describe, expect, it } from "vitest"
import { countExamples, countInstincts, voiceStatus } from "~components/HomeTab"
import type { AmintaStore } from "~lib/storage"

describe("countExamples", () => {
  it("counts a JSON-array-encoded examples string", () => {
    expect(countExamples(JSON.stringify(["a", "b", "c"]))).toBe(3)
  })

  it("returns 0 for empty/undefined", () => {
    expect(countExamples(undefined)).toBe(0)
    expect(countExamples("")).toBe(0)
  })

  it("treats legacy plain-text as ONE example, never splits on newlines", () => {
    // A blank/newline-separated legacy blob is ambiguous — it could be
    // several bulk-pasted posts, or one real post with its own paragraph
    // breaks. Splitting guessed wrong often enough to pollute training data
    // with fake fragments (see lib/trainingExamples.ts), so the only safe
    // reading is one example.
    expect(countExamples("first example\nsecond example")).toBe(1)
  })
})

describe("countInstincts", () => {
  it("counts non-empty newline-separated rules", () => {
    expect(countInstincts("no hashtags\nkeep it short\n")).toBe(2)
  })

  it("returns 0 for empty/undefined", () => {
    expect(countInstincts(undefined)).toBe(0)
    expect(countInstincts("")).toBe(0)
  })
})

describe("voiceStatus — real data only, no invented percentages", () => {
  it("returns null (no status shown) when there's genuinely no training yet", () => {
    const store = { voice: { examples: "", voiceStyle: "", customRules: "" }, styleProfile: null } as unknown as AmintaStore
    expect(voiceStatus(store, false)).toBeNull()
  })

  it("returns Learning for a thin/low-confidence profile", () => {
    const store = { voice: {}, styleProfile: { confidenceScore: 0.3 } } as unknown as AmintaStore
    expect(voiceStatus(store, true)).toBe("Learning")
  })

  it("returns Ready for a reasonably solid profile", () => {
    const store = { voice: {}, styleProfile: { confidenceScore: 0.6 } } as unknown as AmintaStore
    expect(voiceStatus(store, true)).toBe("Ready")
  })

  it("returns Strong only for a well-established profile — never fabricated", () => {
    const store = { voice: {}, styleProfile: { confidenceScore: 0.85 } } as unknown as AmintaStore
    expect(voiceStatus(store, true)).toBe("Strong")
  })

  it("Learning when there are examples but no extracted styleProfile yet", () => {
    const store = { voice: {}, styleProfile: null } as unknown as AmintaStore
    expect(voiceStatus(store, true)).toBe("Learning")
  })
})

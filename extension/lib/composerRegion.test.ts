import { describe, expect, it } from "vitest"
import { resolveAmintaInsertion, type ManagedRegion } from "~lib/composerRegion"

describe("resolveAmintaInsertion", () => {
  it("Generate → first insert into an empty composer: no tracked region, inserts fresh", () => {
    const { fullText, region } = resolveAmintaInsertion("", undefined, "First draft.")
    expect(fullText).toBe("First draft.")
    expect(region).toEqual({ prefix: "", suffix: "" })
  })

  it("Polish → replaces the previously tracked Aminta output, never appends", () => {
    // Generate happened: composer now holds exactly what Aminta wrote, and
    // tracking was updated to the empty-boundary region (see above).
    const afterGenerate: ManagedRegion = { prefix: "", suffix: "" }
    const { fullText, region } = resolveAmintaInsertion("First draft.", afterGenerate, "Polished draft.")
    expect(fullText).toBe("Polished draft.")
    expect(fullText).not.toContain("First draft.")
    expect(region).toEqual({ prefix: "", suffix: "" })
  })

  it("Generate again → replaces the previous Aminta output instead of concatenating", () => {
    const afterFirstGenerate: ManagedRegion = { prefix: "", suffix: "" }
    const { fullText } = resolveAmintaInsertion("Old post about cats.", afterFirstGenerate, "New post about dogs.")
    expect(fullText).toBe("New post about dogs.")
    expect(fullText).not.toContain("cats")
  })

  it("preserves user-typed text before the Aminta region (prefix survives Polish)", () => {
    // User typed "@someone " before ever clicking Generate; Aminta's
    // insertion was tracked with that as the prefix.
    const tracked: ManagedRegion = { prefix: "@someone ", suffix: "" }
    const currentText = "@someone First draft."
    const { fullText, region } = resolveAmintaInsertion(currentText, tracked, "Polished draft.")
    expect(fullText).toBe("@someone Polished draft.")
    expect(region).toEqual(tracked)
  })

  it("preserves user-typed text after the Aminta region (suffix survives Polish)", () => {
    const tracked: ManagedRegion = { prefix: "", suffix: " #hiring" }
    const currentText = "First draft. #hiring"
    const { fullText } = resolveAmintaInsertion(currentText, tracked, "Polished draft.")
    expect(fullText).toBe("Polished draft. #hiring")
  })

  it("preserves both prefix and suffix simultaneously", () => {
    const tracked: ManagedRegion = { prefix: "RT: ", suffix: " (thread)" }
    const currentText = "RT: First draft. (thread)"
    const { fullText } = resolveAmintaInsertion(currentText, tracked, "Polished draft.")
    expect(fullText).toBe("RT: Polished draft. (thread)")
  })

  it("edge case — user edits inside the managed text: still replaces the current managed region", () => {
    // Aminta wrote "First draft." with no surrounding text; the user fixed
    // a typo, so the composer now reads differently, but the empty
    // prefix/suffix still trivially bound it — Polish replaces the whole
    // (user-edited) middle.
    const tracked: ManagedRegion = { prefix: "", suffix: "" }
    const currentText = "First draftt." // user's in-place edit
    const { fullText } = resolveAmintaInsertion(currentText, tracked, "Polished draft.")
    expect(fullText).toBe("Polished draft.")
  })

  it("edge case — user edits inside the managed text with a surrounding prefix/suffix intact", () => {
    const tracked: ManagedRegion = { prefix: "@someone ", suffix: " #hiring" }
    // User tweaked the middle only — boundary text is untouched.
    const currentText = "@someone First draftt. #hiring"
    const { fullText } = resolveAmintaInsertion(currentText, tracked, "Polished draft.")
    expect(fullText).toBe("@someone Polished draft. #hiring")
  })

  it("edge case — user deletes the managed text entirely (boundary text collapses together): reconstructs prefix + new + suffix", () => {
    const tracked: ManagedRegion = { prefix: "@someone ", suffix: " #hiring" }
    const currentText = "@someone  #hiring" // middle fully deleted
    const { fullText } = resolveAmintaInsertion(currentText, tracked, "New draft.")
    expect(fullText).toBe("@someone New draft. #hiring")
  })

  it("edge case — user deletes everything (no surrounding text existed): insert normally", () => {
    const tracked: ManagedRegion = { prefix: "", suffix: "" }
    const currentText = "" // composer fully cleared
    const { fullText, region } = resolveAmintaInsertion(currentText, tracked, "New draft.")
    expect(fullText).toBe("New draft.")
    expect(region).toEqual({ prefix: "", suffix: "" })
  })

  it("edge case — user edits past the tracked boundary (prefix no longer matches): falls back to a fresh full insert", () => {
    const tracked: ManagedRegion = { prefix: "@someone ", suffix: "" }
    // User deleted the "@someone " prefix and rewrote their own opening.
    const currentText = "Actually let me say something else entirely."
    const { fullText, region } = resolveAmintaInsertion(currentText, tracked, "New draft.")
    expect(fullText).toBe("New draft.")
    expect(fullText).not.toContain("Actually let me say")
    expect(region).toEqual({ prefix: "", suffix: "" })
  })

  it("edge case — no managed region exists at all (fresh page, composer already has user text): insert normally", () => {
    const { fullText, region } = resolveAmintaInsertion("Something the user already typed.", undefined, "Aminta's draft.")
    expect(fullText).toBe("Aminta's draft.")
    expect(region).toEqual({ prefix: "", suffix: "" })
  })

  it("never concatenates old and new AI output back-to-back", () => {
    const tracked: ManagedRegion = { prefix: "", suffix: "" }
    const { fullText } = resolveAmintaInsertion("Old AI output.", tracked, "New AI output.")
    expect(fullText).toBe("New AI output.")
    expect(fullText).not.toBe("Old AI output.New AI output.")
    expect(fullText).not.toContain("Old AI output.")
  })

  it("guards against a degenerate boundary overlap (prefix+suffix longer than current text)", () => {
    // Pathological tracked state that could only arise from a bug elsewhere
    // — must still fail safe into a fresh full insert, not throw or produce
    // a negative-length slice.
    const tracked: ManagedRegion = { prefix: "abcde", suffix: "fghij" }
    const currentText = "abc"
    const { fullText, region } = resolveAmintaInsertion(currentText, tracked, "New draft.")
    expect(fullText).toBe("New draft.")
    expect(region).toEqual({ prefix: "", suffix: "" })
  })

  it("a sequence of Generate → Polish → Polish never duplicates content across three writes", () => {
    let currentText = ""
    let region: ManagedRegion | undefined = undefined

    // Generate
    let result = resolveAmintaInsertion(currentText, region, "Draft one.")
    currentText = result.fullText
    region = result.region
    expect(currentText).toBe("Draft one.")

    // Polish
    result = resolveAmintaInsertion(currentText, region, "Draft two.")
    currentText = result.fullText
    region = result.region
    expect(currentText).toBe("Draft two.")
    expect(currentText).not.toContain("Draft one.")

    // Polish again
    result = resolveAmintaInsertion(currentText, region, "Draft three.")
    currentText = result.fullText
    region = result.region
    expect(currentText).toBe("Draft three.")
    expect(currentText).not.toContain("Draft one.")
    expect(currentText).not.toContain("Draft two.")
  })
})

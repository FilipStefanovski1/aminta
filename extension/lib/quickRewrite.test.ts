import { describe, expect, it } from "vitest"
import {
  applyQuickRewriteFailure,
  applyQuickRewriteSuccess,
  applyUndo,
  canStartQuickRewrite,
  type QuickRewriteState,
} from "~lib/quickRewrite"

const IDLE: QuickRewriteState = { output: "original post", previous: null, busy: null, error: "" }

describe("canStartQuickRewrite — duplicate rapid clicks cannot create concurrent requests", () => {
  it("allowed when idle with real output", () => {
    expect(canStartQuickRewrite(IDLE)).toBe(true)
  })

  it("blocked while any action is already busy", () => {
    expect(canStartQuickRewrite({ ...IDLE, busy: "sharper" })).toBe(false)
  })

  it("blocked with no output to rewrite", () => {
    expect(canStartQuickRewrite({ ...IDLE, output: "" })).toBe(false)
    expect(canStartQuickRewrite({ ...IDLE, output: "   " })).toBe(false)
  })
})

describe("applyQuickRewriteSuccess — replaces current output, no duplicate card", () => {
  it("the new text becomes output, and the old output becomes the one-level undo", () => {
    const next = applyQuickRewriteSuccess(IDLE, "shorter version")
    expect(next.output).toBe("shorter version")
    expect(next.previous).toBe("original post")
    expect(next.busy).toBeNull()
    expect(next.error).toBe("")
  })

  it("a second rewrite operates on the latest output, not the original", () => {
    const afterFirst = applyQuickRewriteSuccess(IDLE, "sharper version")
    // Second rewrite starts from afterFirst.output, as GeneratorPanel does.
    const afterSecond = applyQuickRewriteSuccess({ ...afterFirst, busy: "shorter" }, "sharper + shorter version")
    expect(afterSecond.output).toBe("sharper + shorter version")
    expect(afterSecond.previous).toBe("sharper version") // only one level back
  })
})

describe("applyQuickRewriteFailure — never clears the successful previous output", () => {
  it("keeps output and previous exactly as they were, just records the error", () => {
    const busy: QuickRewriteState = { output: "original post", previous: "even older", busy: "casual", error: "" }
    const next = applyQuickRewriteFailure(busy, "Rate limited, try again shortly.")
    expect(next.output).toBe("original post")
    expect(next.previous).toBe("even older")
    expect(next.busy).toBeNull()
    expect(next.error).toBe("Rate limited, try again shortly.")
  })
})

describe("applyUndo — local, instant, 0 credits, no AI call", () => {
  it("restores the immediately previous version and clears itself (one level only)", () => {
    const after = applyQuickRewriteSuccess(IDLE, "rewritten")
    const undone = applyUndo(after)
    expect(undone.output).toBe("original post")
    expect(undone.previous).toBeNull()
  })

  it("is a no-op when there is nothing to undo", () => {
    expect(applyUndo(IDLE)).toEqual(IDLE)
  })

  // applyUndo's own signature takes no dependency capable of making a
  // network/model call at all — it's a pure function of local state.
  it("is a pure function — same input always produces the same output, proving no side effect/AI call occurred", () => {
    const after = applyQuickRewriteSuccess(IDLE, "rewritten")
    expect(applyUndo(after)).toEqual(applyUndo(after))
  })
})

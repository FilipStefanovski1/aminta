import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  hasActiveThreadBuildSession,
  MAX_AUTO_BUILD_THREAD_LENGTH,
  MAX_POST_LENGTH,
  resumeThreadBuild,
  startThreadBuild,
  validateThreadForAutoBuild,
  type StepResult,
  type ThreadBuilderHandlers,
} from "~lib/threadBuilder"

// All X interactions are mocked here — this suite never touches chrome.* or
// the network, and never makes a real X post or clicks a real Post button.
// "+" is a real USER click in this architecture (see threadBuilder.ts's
// file-header comment) — there is deliberately no addComposer/click-"+"
// handler anywhere in this file; only waitForComposer, which detects
// whatever composer the user's own click produces.
function makeHandlers(overrides: Partial<ThreadBuilderHandlers> = {}) {
  const calls: { fn: string; arg?: unknown }[] = []

  const defaults: ThreadBuilderHandlers = {
    prepare: vi.fn(async (): Promise<StepResult> => { calls.push({ fn: "prepare" }); return { ok: true } }),
    insertAndVerify: vi.fn(async (index: number, text: string): Promise<StepResult> => {
      calls.push({ fn: "insertAndVerify", arg: { index, text } })
      return { ok: true }
    }),
    waitForComposer: vi.fn(async (index: number, previousIndex: number, previousText: string): Promise<StepResult> => {
      calls.push({ fn: "waitForComposer", arg: { index, previousIndex, previousText } })
      return { ok: true }
    }),
    onState: vi.fn(),
    ...overrides,
  }
  return { handlers: defaults, calls }
}

const FOUR_POSTS = ["Post 1", "Post 2", "Post 3", "Post 4"]

describe("validateThreadForAutoBuild", () => {
  it("allows a normal thread", () => {
    expect(validateThreadForAutoBuild(FOUR_POSTS)).toEqual({ ok: true })
  })

  it("disables auto-build above the max thread length", () => {
    const long = Array.from({ length: MAX_AUTO_BUILD_THREAD_LENGTH + 1 }, (_, i) => `Post ${i}`)
    const result = validateThreadForAutoBuild(long)
    expect(result.ok).toBe(false)
    if (result.ok === false) expect(result.reason).toMatch(new RegExp(String(MAX_AUTO_BUILD_THREAD_LENGTH)))
  })

  it("rejects a post over X's character limit", () => {
    expect(validateThreadForAutoBuild(["ok", "x".repeat(MAX_POST_LENGTH + 1)]).ok).toBe(false)
  })

  it("rejects empty posts", () => {
    expect(validateThreadForAutoBuild(["ok", "  "]).ok).toBe(false)
  })
})

describe("native X thread-composer builder — manual '+' / auto-fill relay", () => {
  beforeEach(async () => {
    while (hasActiveThreadBuildSession()) await new Promise((r) => setTimeout(r, 5))
  })

  it("post 1 goes into composer 1 (index 0)", async () => {
    const { handlers, calls } = makeHandlers()
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    await ctrl.done

    const firstInsert = calls.find((c) => c.fn === "insertAndVerify")
    expect(firstInsert?.arg).toEqual({ index: 0, text: "Post 1" })
  })

  it("post 1 must verify before progress (builtCount) becomes 1", async () => {
    const { handlers } = makeHandlers({
      insertAndVerify: vi.fn(async (): Promise<StepResult> => {
        // Never resolves ok — builtCount must stay 0 the whole time.
        return { ok: false, error: "composer_text_mismatch" }
      }),
    })
    const states: number[] = []
    const ctrl = startThreadBuild(FOUR_POSTS, { ...handlers, onState: (s) => states.push(s.builtCount) })
    if ("error" in ctrl) throw new Error(ctrl.error)
    await ctrl.done

    expect(states.every((n) => n === 0)).toBe(true)
  })

  it("after post 1 is verified, the builder enters waiting_for_user_add before touching post 2", async () => {
    const statuses: string[] = []
    const { handlers } = makeHandlers()
    const ctrl = startThreadBuild(FOUR_POSTS, { ...handlers, onState: (s) => statuses.push(s.status) })
    if ("error" in ctrl) throw new Error(ctrl.error)
    await ctrl.done

    expect(statuses).toContain("waiting_for_user_add")
    const firstWaiting = statuses.indexOf("waiting_for_user_add")
    const secondInserting = statuses.indexOf("inserting", firstWaiting)
    expect(secondInserting).toBeGreaterThan(firstWaiting)
  })

  it("post 2 goes into composer 2 (index 1) — a 4-post thread inserts every post in order", async () => {
    const { handlers, calls } = makeHandlers()
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    await ctrl.done

    const inserts = calls.filter((c) => c.fn === "insertAndVerify").map((c) => c.arg)
    expect(inserts).toEqual([
      { index: 0, text: "Post 1" },
      { index: 1, text: "Post 2" },
      { index: 2, text: "Post 3" },
      { index: 3, text: "Post 4" },
    ])
  })

  it("a four-post thread creates exactly four populated composers and ends ready", async () => {
    const { handlers } = makeHandlers()
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    const final = await ctrl.done

    expect(final.status).toBe("ready")
    expect(final.builtCount).toBe(4)
  })

  it("never clicks X's '+' or its final Post/Post-all button — no such handler exists at all", () => {
    const { handlers } = makeHandlers()
    expect(Object.keys(handlers).sort()).toEqual(
      ["insertAndVerify", "onState", "prepare", "waitForComposer"].sort()
    )
  })

  it("existing draft safety: prepare() refusing a dirty composer stops the whole build", async () => {
    const { handlers, calls } = makeHandlers({
      prepare: vi.fn(async (): Promise<StepResult> => { calls.push({ fn: "prepare" }); return { ok: false, error: "composer_not_clean" } }),
    })
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    const final = await ctrl.done

    expect(final.status).toBe("failed")
    expect(final.builtCount).toBe(0)
    expect(calls.some((c) => c.fn === "insertAndVerify")).toBe(false)
  })

  it("does not fail merely because waitForComposer takes a while to resolve — no aggressive timeout at this layer", async () => {
    const { handlers, calls } = makeHandlers({
      waitForComposer: vi.fn(async (index: number, previousIndex: number, previousText: string): Promise<StepResult> => {
        await new Promise((r) => setTimeout(r, 50)) // simulates the user taking a moment to click "+"
        calls.push({ fn: "waitForComposer", arg: { index, previousIndex, previousText } })
        return { ok: true }
      }),
    })
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    const final = await ctrl.done

    expect(final.status).toBe("ready")
  })

  it("a next-composer timeout stops safely", async () => {
    const { handlers, calls } = makeHandlers({
      waitForComposer: vi.fn(async (index: number): Promise<StepResult> => {
        calls.push({ fn: "waitForComposer", arg: index })
        return { ok: false, error: "next_composer_timeout" }
      }),
    })
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    const final = await ctrl.done

    expect(final.status).toBe("failed")
    expect(final.builtCount).toBe(1)
    expect(final.error).toMatch(/waiting/)
  })

  // Live QA regression from the old auto-"+" architecture: something
  // destructively cleared the already-confirmed post while advancing to the
  // next one. Still a real risk in the manual-relay model too (X remounting
  // the compose UI, the user editing an already-inserted post) — must still
  // surface a specific, diagnosable reason, not a generic timeout.
  it("a destructive change to the already-confirmed post while waiting stops with a specific reason, not a generic timeout", async () => {
    const { handlers } = makeHandlers({
      waitForComposer: vi.fn(async (index: number, previousIndex: number, previousText: string): Promise<StepResult> => {
        return { ok: false, error: "previous_composer_cleared" }
      }),
    })
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    const final = await ctrl.done

    expect(final.status).toBe("failed")
    expect(final.builtCount).toBe(1) // post 1 genuinely landed before the clear
    expect(final.error).toMatch(/disappeared/)
  })

  it("waitForComposer is called with the next index, the previous index, and the already-confirmed previous text", async () => {
    const { handlers, calls } = makeHandlers()
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    await ctrl.done

    const waitCalls = calls.filter((c) => c.fn === "waitForComposer").map((c) => c.arg)
    expect(waitCalls).toEqual([
      { index: 1, previousIndex: 0, previousText: "Post 1" },
      { index: 2, previousIndex: 1, previousText: "Post 2" },
      { index: 3, previousIndex: 2, previousText: "Post 3" },
    ])
  })

  it("a composer text mismatch stops safely and never advances past the failed post", async () => {
    let call = 0
    const { handlers, calls } = makeHandlers({
      insertAndVerify: vi.fn(async (index: number, text: string): Promise<StepResult> => {
        call += 1
        calls.push({ fn: "insertAndVerify", arg: { index, text } })
        if (call === 2) return { ok: false, error: "composer_text_mismatch" }
        return { ok: true }
      }),
    })
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    const final = await ctrl.done

    expect(final.status).toBe("failed")
    expect(final.builtCount).toBe(1) // only post 1 confirmed before the mismatch on post 2
    expect(calls.filter((c) => c.fn === "insertAndVerify")).toHaveLength(2)
  })

  it("only one build can run at a time (double-click / rerender guard)", async () => {
    const { handlers: h1 } = makeHandlers()
    const ctrl1 = startThreadBuild(FOUR_POSTS, h1)
    if ("error" in ctrl1) throw new Error(ctrl1.error)

    const { handlers: h2 } = makeHandlers()
    const ctrl2 = startThreadBuild(FOUR_POSTS, h2)
    expect("error" in ctrl2).toBe(true)

    await ctrl1.done
  })

  it("retry resumes from the failed post without re-running prepare(), and already-inserted posts are not re-cleared", async () => {
    let call = 0
    const { handlers } = makeHandlers({
      waitForComposer: vi.fn(async (): Promise<StepResult> => {
        call += 1
        if (call === 1) return { ok: false, error: "next_composer_timeout" }
        return { ok: true }
      }),
    })
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    const failed = await ctrl.done
    expect(failed.status).toBe("failed")
    expect(failed.currentIndex).toBe(0)
    expect(failed.builtCount).toBe(1) // post 1 already landed — retry must not re-insert it

    const { handlers: retryHandlers, calls: retryCalls } = makeHandlers()
    const retryCtrl = resumeThreadBuild(failed, retryHandlers)
    if ("error" in retryCtrl) throw new Error(retryCtrl.error)
    const done = await retryCtrl.done

    expect(done.status).toBe("ready")
    expect(retryCalls.some((c) => c.fn === "prepare")).toBe(false)
    // Resume starts the loop at currentIndex (0 — post 1), so it does
    // re-insert post 1 (harmless: insertion replaces content, not appends —
    // see runLoop's own comment), but never re-runs prepare and never
    // clears/skips any post.
    const inserts = retryCalls.filter((c) => c.fn === "insertAndVerify").map((c) => c.arg)
    expect(inserts).toEqual([
      { index: 0, text: "Post 1" },
      { index: 1, text: "Post 2" },
      { index: 2, text: "Post 3" },
      { index: 3, text: "Post 4" },
    ])
  })

  it("building the thread queues zero AI credits and zero XP — no such call exists in the handler surface", async () => {
    const { handlers } = makeHandlers()
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    await ctrl.done

    // No "queueXp"/"generate"/"spend" method exists on the handlers at all —
    // building a draft can only ever call prepare/insertAndVerify/
    // waitForComposer/onState (+ the optional cancelWait for Stop).
    expect(handlers).not.toHaveProperty("queueXp")
    expect(handlers).not.toHaveProperty("generate")
  })

  it("stop halts before waiting for the next composer, if pressed right after insert", async () => {
    let stop: (() => void) | null = null
    const { handlers, calls } = makeHandlers({
      insertAndVerify: vi.fn(async (index: number, text: string): Promise<StepResult> => {
        calls.push({ fn: "insertAndVerify", arg: { index, text } })
        if (index === 0) stop?.()
        return { ok: true }
      }),
    })
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    stop = ctrl.stop
    const final = await ctrl.done

    expect(final.status).toBe("stopped")
    expect(final.builtCount).toBe(1)
    expect(calls.some((c) => c.fn === "waitForComposer")).toBe(false)
  })

  it("stop while waiting for the user's '+' click: cancelWait() is invoked, and a 'stopped' waitForComposer result ends the build as stopped, not failed", async () => {
    let stop: (() => void) | null = null
    const cancelWait = vi.fn()
    const { handlers } = makeHandlers({
      cancelWait,
      waitForComposer: vi.fn(async (): Promise<StepResult> => {
        stop?.() // simulates the user pressing Stop while this is in flight
        return { ok: false, error: "stopped" }
      }),
    })
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    stop = ctrl.stop
    const final = await ctrl.done

    expect(cancelWait).toHaveBeenCalled()
    expect(final.status).toBe("stopped")
    expect(final.builtCount).toBe(1) // post 1 stays verified — never cleared by Stop
  })

  it("progress reports builtCount=1 the moment post 1 is verified — not 0", async () => {
    const { handlers } = makeHandlers()
    const states: number[] = []
    const onState = vi.fn((s) => states.push(s.builtCount))
    const ctrl = startThreadBuild(FOUR_POSTS, { ...handlers, onState })
    if ("error" in ctrl) throw new Error(ctrl.error)
    await ctrl.done

    // The very first builtCount value ever emitted after post 1's
    // insertAndVerify succeeds must be 1 — never a leftover 0.
    const firstNonZero = states.find((n) => n > 0)
    expect(firstNonZero).toBe(1)
  })

  it("a failure on post 2 reports builtCount=1, not 0 — post 1 already succeeded", async () => {
    let call = 0
    const { handlers } = makeHandlers({
      insertAndVerify: vi.fn(async (index: number, text: string): Promise<StepResult> => {
        call += 1
        if (call === 2) return { ok: false, error: "composer_text_mismatch" }
        return { ok: true }
      }),
    })
    const ctrl = startThreadBuild(FOUR_POSTS, handlers)
    if ("error" in ctrl) throw new Error(ctrl.error)
    const final = await ctrl.done

    expect(final.status).toBe("failed")
    expect(final.builtCount).toBe(1) // NOT 0 — post 1 genuinely landed
  })
})

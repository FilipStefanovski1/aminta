// @vitest-environment jsdom
//
// P0 regression suite: live QA found Aminta reporting "1/5 built" while the
// VISIBLE X composer was empty — a false positive caused by a plain
// `document.querySelector('[data-testid="tweetTextarea_0"]')` returning
// whatever matching node happens to be first in document order, with no
// guarantee that's the composer the user is actually looking at (a hidden/
// stale/duplicate node can match the same testid). getActiveXComposer()
// requires connected + visible + (when a dialog is open) dialog-scoped, and
// every read/insert/verify call in threadComposerDom.ts goes through it —
// these tests prove hidden/stale/duplicate nodes are excluded and the
// SAME element is what gets read back.
import { beforeEach, describe, expect, it } from "vitest"
import {
  debugSnapshotComposer,
  getActiveXComposer,
  insertIntoComposerAt,
  normalizeForCompare,
  readThreadComposerText,
  verifyThreadComposerText,
  waitForNextComposerOrRegression,
} from "~lib/threadComposerDom"

// jsdom has no layout engine, so it never implements real `innerText` or
// `getBoundingClientRect` (the production code's deliberate, correct choice
// for every actual browser this runs in — see threadComposerDom.ts's
// comments). It also doesn't expose a global `DataTransfer`/`ClipboardEvent`
// in this version. All four are real in Chrome; these are minimal test-
// environment-only stand-ins, not behavior changes.
Object.defineProperty(HTMLElement.prototype, "innerText", {
  get(this: HTMLElement) { return this.textContent ?? "" },
  set(this: HTMLElement, v: string) { this.textContent = v },
  configurable: true,
})
// Simulates real layout just enough to distinguish "visible" from "hidden
// via inline display:none/visibility:hidden on itself or an ancestor" —
// which is exactly what isVisible() in threadComposerDom.ts checks via
// getBoundingClientRect().width/height, since jsdom's getComputedStyle
// already handles the actual display/visibility/aria-hidden logic
// correctly on its own (real CSSOM, no mock needed for that part).
Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  value(this: HTMLElement) {
    let node: HTMLElement | null = this
    while (node) {
      if (node.style.display === "none" || node.style.visibility === "hidden") {
        return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() { return {} } }
      }
      node = node.parentElement
    }
    return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON() { return {} } }
  },
  configurable: true,
})
if (typeof (globalThis as unknown as { DataTransfer?: unknown }).DataTransfer === "undefined") {
  class FakeDataTransfer {
    private data = new Map<string, string>()
    setData(type: string, value: string) { this.data.set(type, value) }
    getData(type: string) { return this.data.get(type) ?? "" }
  }
  ;(globalThis as unknown as { DataTransfer: unknown }).DataTransfer = FakeDataTransfer
}
if (typeof (globalThis as unknown as { ClipboardEvent?: unknown }).ClipboardEvent === "undefined") {
  class FakeClipboardEvent extends Event {
    clipboardData: unknown
    constructor(type: string, init?: EventInit & { clipboardData?: unknown }) {
      super(type, init)
      this.clipboardData = init?.clipboardData
    }
  }
  ;(globalThis as unknown as { ClipboardEvent: unknown }).ClipboardEvent = FakeClipboardEvent
}

/** Simulates X's own paste handler: reads clipboardData, rebuilds content as nested spans, preventDefault(). */
function attachFakeXPasteHandler(editable: HTMLElement, opts: { delayMs?: number } = {}) {
  editable.addEventListener("paste", (e) => {
    const evt = e as ClipboardEvent
    const text = evt.clipboardData?.getData("text/plain") ?? ""
    const apply = () => {
      editable.innerHTML = ""
      text.split(" ").forEach((w, i, arr) => {
        const span = document.createElement("span")
        span.textContent = w
        editable.appendChild(span)
        if (i < arr.length - 1) editable.appendChild(document.createTextNode(" "))
      })
    }
    if (opts.delayMs) setTimeout(apply, opts.delayMs)
    else apply()
    e.preventDefault()
  })
}

function makeComposerWrapper(index: number, container: HTMLElement = document.body): HTMLElement {
  const wrapper = document.createElement("div")
  wrapper.setAttribute("data-testid", `tweetTextarea_${index}`)
  const editable = document.createElement("div")
  editable.setAttribute("contenteditable", "true")
  wrapper.appendChild(editable)
  container.appendChild(wrapper)
  return wrapper
}

function editableOf(wrapper: HTMLElement): HTMLElement {
  return wrapper.querySelector('[contenteditable="true"]') as HTMLElement
}

function makeDialog(): HTMLElement {
  const dialog = document.createElement("div")
  dialog.setAttribute("role", "dialog")
  document.body.appendChild(dialog)
  return dialog
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("getActiveXComposer — false-positive exclusion", () => {
  it("1. hidden composer contains expected text, visible composer empty -> selects the visible one, reads empty", () => {
    const hidden = makeComposerWrapper(0)
    hidden.style.display = "none"
    editableOf(hidden).textContent = "Post 1 text"

    const visible = makeComposerWrapper(0)
    // visible stays empty

    const selected = getActiveXComposer(0)
    expect(selected).toBe(editableOf(visible))
    expect(selected?.textContent).toBe("")
    expect(readThreadComposerText(0)).toBe("")
  })

  it("2. stale detached composer contains expected text -> excluded entirely", () => {
    const detached = document.createElement("div")
    detached.setAttribute("data-testid", "tweetTextarea_0")
    const detachedEditable = document.createElement("div")
    detachedEditable.setAttribute("contenteditable", "true")
    detachedEditable.textContent = "stale text"
    detached.appendChild(detachedEditable)
    // Never appended to document — this is what a stale/removed composer looks like.

    const visible = makeComposerWrapper(0)

    const selected = getActiveXComposer(0)
    expect(selected).toBe(editableOf(visible))
    expect(selected?.textContent).toBe("")
  })

  it("3. two tweetTextarea_0 elements — hidden old one with text, visible active one empty -> visible wins, empty", () => {
    const old = makeComposerWrapper(0)
    old.setAttribute("aria-hidden", "true")
    editableOf(old).textContent = "old draft text"

    const active = makeComposerWrapper(0)

    expect(readThreadComposerText(0)).toBe("")
    expect(getActiveXComposer(0)).toBe(editableOf(active))
  })

  it("4. visible active composer contains expected text -> passes", () => {
    const active = makeComposerWrapper(0)
    editableOf(active).textContent = "Post 1 text"
    expect(readThreadComposerText(0)).toBe("Post 1 text")
  })

  it("6. an aria-hidden accessibility-mirror node does not count as the active composer", () => {
    const mirror = makeComposerWrapper(0)
    mirror.setAttribute("aria-hidden", "true")
    editableOf(mirror).textContent = "mirror text"

    // No other candidate exists — the real composer just hasn't mounted yet.
    expect(getActiveXComposer(0)).toBeNull()
    expect(readThreadComposerText(0)).toBeNull()
  })

  it("prefers a composer scoped inside the active dialog over an inline one elsewhere on the page", () => {
    // An inline "what's happening" box on the timeline, outside any dialog.
    const inline = makeComposerWrapper(0)
    editableOf(inline).textContent = "inline draft, not what we're building"

    // The actual compose modal, opened after.
    const dialog = makeDialog()
    const modalComposer = makeComposerWrapper(0, dialog)

    const selected = getActiveXComposer(0)
    expect(selected).toBe(editableOf(modalComposer))
    expect(selected).not.toBe(editableOf(inline))
  })

  it("8. a tweetTextarea_N_label accessibility wrapper ANCESTOR of the real composer is excluded from position counting", () => {
    // Live QA: X renders an outer `tweetTextarea_0_label` wrapper around the
    // real `tweetTextarea_0` composer. Both match a bare `^="tweetTextarea_"`
    // prefix, and since the label wrapper is an ANCESTOR it sorts earlier in
    // document order — corrupting positional indexing unless label-suffixed
    // testids are filtered out entirely.
    const dialog = makeDialog()
    const label = document.createElement("div")
    label.setAttribute("data-testid", "tweetTextarea_0_label")
    const real = makeComposerWrapper(0, label)
    dialog.appendChild(label)

    const composers = [getActiveXComposer(0), getActiveXComposer(1)]
    expect(composers[0]).toBe(editableOf(real))
    expect(composers[1]).toBeNull()

    const snap = debugSnapshotComposer(0)
    expect(snap.selectedTestId).toBe("tweetTextarea_0")
    expect(snap.visibleMatchesInDialog).toBe(1)
  })

  it("does not fall through to a document-wide match when a dialog is open but doesn't yet contain this index", () => {
    const dialog = makeDialog()
    makeComposerWrapper(0, dialog) // dialog has index 0, not 1 yet
    const strayInline = makeComposerWrapper(1) // an unrelated index-1 match outside the dialog
    editableOf(strayInline).textContent = "should never be selected"

    expect(getActiveXComposer(1)).toBeNull()
  })
})

describe("insert + verify target the exact same element — false positive cannot occur", () => {
  it("5. active composer remounts after paste — polling reacquires the new visible node and passes only if it has the text", async () => {
    const first = makeComposerWrapper(0)
    // Simulate X replacing the editable node entirely (a remount) shortly
    // after paste, before the new node ever receives the pasted text —
    // the first node briefly shows the flash-then-empty behavior from the
    // live bug report.
    attachFakeXPasteHandler(editableOf(first))

    insertIntoComposerAt("Post 1 text", 0)
    // Immediately swap in a brand-new wrapper/editable at the same index —
    // simulates X remounting the composer right after the paste fired.
    first.remove()
    const remounted = makeComposerWrapper(0)
    // The remounted node starts empty, then "catches up" with the real text
    // shortly after (simulating X's own re-render finishing).
    setTimeout(() => { editableOf(remounted).textContent = "Post 1 text" }, 150)

    const result = await verifyThreadComposerText(0, "Post 1 text", 2000)
    expect(result.ok).toBe(true)
    // Confirms verification re-acquired the NEW node, not a stale reference
    // to the removed one.
    expect(getActiveXComposer(0)).toBe(editableOf(remounted))
  })

  it("5b. if the remounted composer never receives the text, verification fails rather than trusting the old node", async () => {
    const first = makeComposerWrapper(0)
    editableOf(first).textContent = "Post 1 text" // old node HAS the text

    first.remove()
    makeComposerWrapper(0) // new node stays empty — never catches up

    const result = await verifyThreadComposerText(0, "Post 1 text", 300)
    expect(result.ok).toBe(false)
  })

  it("7. builtCount-relevant: verification only succeeds once the visible active composer itself matches — never earlier", async () => {
    const hidden = makeComposerWrapper(0)
    hidden.style.display = "none"
    editableOf(hidden).textContent = "Post 1 text" // decoy, has the right text

    const visible = makeComposerWrapper(0) // empty — the one that matters

    const result = await verifyThreadComposerText(0, "Post 1 text", 300)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("composer_text_mismatch")
  })

  it("insertIntoComposerAt and verifyThreadComposerText operate on the identical element when exactly one valid candidate exists", () => {
    const wrapper = makeComposerWrapper(0)
    const editable = editableOf(wrapper)
    attachFakeXPasteHandler(editable)

    const insertTarget = getActiveXComposer(0)
    insertIntoComposerAt("hello world", 0)
    const verifyTarget = getActiveXComposer(0)

    expect(insertTarget).toBe(editable)
    expect(verifyTarget).toBe(editable)
    expect(insertTarget).toBe(verifyTarget)
  })
})

describe("debugSnapshotComposer — diagnostic only, never affects pass/fail", () => {
  it("reports total vs visible match counts and the selected testid", () => {
    const hidden = makeComposerWrapper(0)
    hidden.style.display = "none"
    makeComposerWrapper(0) // visible

    const snap = debugSnapshotComposer(0)
    expect(snap.totalMatchesInDocument).toBe(2)
    expect(snap.visibleMatchesInDialog).toBe(1)
    expect(snap.selectedTestId).toBe("tweetTextarea_0")
    expect(snap.selectedConnected).toBe(true)
  })

  it("reports no dialog when none is open, and dialogFound=true when one is", () => {
    makeComposerWrapper(0)
    expect(debugSnapshotComposer(0).dialogFound).toBe(false)

    document.body.innerHTML = ""
    const dialog = makeDialog()
    makeComposerWrapper(0, dialog)
    expect(debugSnapshotComposer(0).dialogFound).toBe(true)
  })
})

describe("insertIntoComposerAt + a real simulated paste (unchanged behavior)", () => {
  it("dispatches a paste event a real handler can read and apply", () => {
    const wrapper = makeComposerWrapper(0)
    attachFakeXPasteHandler(editableOf(wrapper))
    const ok = insertIntoComposerAt("hello world", 0)
    expect(ok).toBe(true)
    expect(readThreadComposerText(0)).toBe("hello world")
  })

  it("returns false when the target composer doesn't exist", () => {
    expect(insertIntoComposerAt("hello", 5)).toBe(false)
  })
})

describe("verifyThreadComposerText: bounded polling closes the async-commit race", () => {
  it("succeeds once a DELAYED DOM update lands within the timeout", async () => {
    const wrapper = makeComposerWrapper(0)
    attachFakeXPasteHandler(editableOf(wrapper), { delayMs: 150 })
    insertIntoComposerAt("heading to solana summit in serbia", 0)
    const result = await verifyThreadComposerText(0, "heading to solana summit in serbia", 2000)
    expect(result.ok).toBe(true)
  })

  it("fails cleanly (not hanging) when the text never arrives before the deadline", async () => {
    const wrapper = makeComposerWrapper(0)
    attachFakeXPasteHandler(editableOf(wrapper), { delayMs: 999999 })
    insertIntoComposerAt("hello world", 0)
    const result = await verifyThreadComposerText(0, "hello world", 300)
    expect(result.ok).toBe(false)
  })

  it("wrong text still fails — polling must never make verification loose enough to pass a mismatch", async () => {
    const wrapper = makeComposerWrapper(0)
    attachFakeXPasteHandler(editableOf(wrapper))
    insertIntoComposerAt("hello world", 0)
    const result = await verifyThreadComposerText(0, "totally different text", 300)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("composer_text_mismatch")
  })
})

describe("normalizeForCompare — DOM representation differences, not a loosened check", () => {
  it("treats NBSP the same as a regular space", () => {
    expect(normalizeForCompare("hello world")).toBe(normalizeForCompare("hello world"))
  })
  it("normalizes CRLF to LF", () => {
    expect(normalizeForCompare("a\r\nb")).toBe(normalizeForCompare("a\nb"))
  })
  it("still rejects genuinely different text", () => {
    expect(normalizeForCompare("hello world")).not.toBe(normalizeForCompare("hello there"))
  })
})

// The "+" click is now a real USER action (see threadComposerDom.ts's
// architecture-change note) — Aminta only detects the composer it produces.
// This polls for that composer to appear, and separately watches the
// already-verified composer for a destructive change while it waits.
describe("waitForNextComposerOrRegression — detects the user's '+' click, and any destructive change while waiting", () => {
  it("succeeds once the user-created next composer appears and the previous one is untouched", async () => {
    const wrapper0 = makeComposerWrapper(0)
    editableOf(wrapper0).textContent = "Post 1 text"
    setTimeout(() => makeComposerWrapper(1), 50)

    const result = await waitForNextComposerOrRegression(1, 0, "Post 1 text", () => false, 2000)
    expect(result.ok).toBe(true)
  })

  it("fails fast with previous_composer_cleared when the confirmed post's text disappears instead of the next composer appearing", async () => {
    const wrapper0 = makeComposerWrapper(0)
    editableOf(wrapper0).textContent = "Post 1 text"
    setTimeout(() => { editableOf(wrapper0).textContent = "" }, 100)

    const result = await waitForNextComposerOrRegression(1, 0, "Post 1 text", () => false, 2000)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("previous_composer_cleared")
  })

  it("tolerates a single-tick blip (brief compose-UI remount) and still succeeds once the next composer settles in", async () => {
    // A single transient empty/missing read of composer 0 must not be
    // treated as a destructive clear if it recovers on the next tick, same
    // as insert/verify already tolerates a remount elsewhere in this file.
    const wrapper0 = makeComposerWrapper(0)
    editableOf(wrapper0).textContent = "Post 1 text"
    editableOf(wrapper0).textContent = ""
    setTimeout(() => { editableOf(wrapper0).textContent = "Post 1 text" }, 250)
    setTimeout(() => makeComposerWrapper(1), 300)

    const result = await waitForNextComposerOrRegression(1, 0, "Post 1 text", () => false, 2000)
    expect(result.ok).toBe(true)
  })

  it("times out with next_composer_timeout (not a false regression) when nothing changes at all", async () => {
    const wrapper0 = makeComposerWrapper(0)
    editableOf(wrapper0).textContent = "Post 1 text"
    // Composer 1 never appears (the user hasn't clicked "+" yet), but
    // composer 0's text is also never touched — genuinely still waiting,
    // not a destructive clear.
    const result = await waitForNextComposerOrRegression(1, 0, "Post 1 text", () => false, 300)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("next_composer_timeout")
  })

  it("does not false-positive on whitespace/NBSP differences in the still-present previous text", async () => {
    const wrapper0 = makeComposerWrapper(0)
    editableOf(wrapper0).innerHTML = "<span>Post</span> <span>1</span> <span>text</span>"
    setTimeout(() => makeComposerWrapper(1), 50)

    const result = await waitForNextComposerOrRegression(1, 0, "Post 1 text", () => false, 2000)
    expect(result.ok).toBe(true)
  })

  it("does not fail merely because several seconds pass while waiting for the user to click \"+\"", async () => {
    // This is now a user-paced wait, not a short automatic retry — the
    // user might take a while reviewing the post before clicking "+".
    const wrapper0 = makeComposerWrapper(0)
    editableOf(wrapper0).textContent = "Post 1 text"
    setTimeout(() => makeComposerWrapper(1), 900)

    const result = await waitForNextComposerOrRegression(1, 0, "Post 1 text", () => false, 2000)
    expect(result.ok).toBe(true)
  })

  it("stops immediately with error 'stopped' when shouldStop() reports the user pressed Stop", async () => {
    const wrapper0 = makeComposerWrapper(0)
    editableOf(wrapper0).textContent = "Post 1 text"
    // Composer 1 never appears — Stop must win over the long default
    // timeout rather than the wait silently continuing to poll.
    const result = await waitForNextComposerOrRegression(1, 0, "Post 1 text", () => true, 60_000)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("stopped")
  })
})

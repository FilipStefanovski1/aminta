// @vitest-environment jsdom
//
// Product decision: the injected X composer action strip (Generate/Polish/
// Meme, and before that News/Product/You/Length) has been removed entirely
// — too many controls crammed into a small bar injected into someone
// else's UI. This file replaces the old injection-lifecycle test (which
// proved the bar survived X's own DOM churn) with the opposite invariant:
// nothing Aminta-authored is ever injected into the X composer, on first
// load or after any DOM churn, on a normal post OR a reply composer.
//
// It also spot-checks that removing the toolbar didn't break the SHARED,
// non-toolbar message handlers this file still owns (GET_ACTIVE_TWEET,
// INSERT_TEXT) — deep coverage of their own logic lives in
// lib/composerRegion.test.ts, lib/threadComposerDom.test.ts,
// lib/threadBuilder.test.ts, lib/xAccountGuard.test.ts, etc., untouched by
// this change.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("~lib/xAccountGuard", () => ({
  assertActiveXAccountMatchesConnectedAccount: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.stubGlobal("chrome", {
  runtime: {
    getManifest: () => ({}),
    onMessage: { addListener: (fn: unknown) => { listeners.push(fn as MessageListener) } },
    sendMessage: () => Promise.resolve(),
  },
  storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
})

type MessageListener = (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean
const listeners: MessageListener[] = []

function sendMessage(msg: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    for (const listener of listeners) {
      const handled = listener(msg, {}, resolve)
      if (handled) return
    }
    resolve(undefined)
  })
}

function makeToolbar(): HTMLElement {
  const toolbar = document.createElement("div")
  toolbar.setAttribute("data-testid", "toolBar")
  return toolbar
}

function anyAmintaNode(root: ParentNode): Element | null {
  return root.querySelector("[data-aminta-bar], .aminta-actions, .aminta-status, .aminta-keywords")
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

describe("no injected composer UI on a normal post composer", () => {
  let root: HTMLDivElement
  let toolbar: HTMLElement

  beforeEach(async () => {
    listeners.length = 0
    vi.resetModules()
    document.body.innerHTML = ""
    root = document.createElement("div")
    toolbar = makeToolbar()
    root.appendChild(toolbar)
    document.body.appendChild(root)
    await import("./twitter-bridge")
  })

  it("nothing Aminta-authored is injected on first load", () => {
    expect(anyAmintaNode(root)).toBeNull()
    expect(toolbar.nextElementSibling).toBeNull()
  })

  it("stays absent through DOM churn that would have triggered the old MutationObserver injection", async () => {
    // Simulate X re-rendering the toolbar's parent repeatedly, exactly the
    // churn the old injection lifecycle used to react to.
    for (let i = 0; i < 3; i++) {
      const next = makeToolbar()
      root.replaceChildren(next)
      toolbar = next
      await flush()
    }
    expect(anyAmintaNode(root)).toBeNull()
    expect(anyAmintaNode(document)).toBeNull()
  })

  it("removing the toolbar entirely still leaves no Aminta node anywhere", async () => {
    root.replaceChildren()
    await flush()
    expect(anyAmintaNode(document)).toBeNull()
  })
})

describe("no injected composer UI on a reply composer either", () => {
  it("a toolbar sitting right after a real tweetText node (the old Meme-eligibility shape) still gets nothing injected", async () => {
    listeners.length = 0
    vi.resetModules()
    document.body.innerHTML = ""

    const root = document.createElement("div")
    const tweetText = document.createElement("div")
    tweetText.setAttribute("data-testid", "tweetText")
    tweetText.textContent = "a post being replied to"
    const toolbar = makeToolbar()
    root.append(tweetText, toolbar)
    document.body.appendChild(root)

    await import("./twitter-bridge")

    expect(anyAmintaNode(root)).toBeNull()
    expect(root.querySelector("button")).toBeNull() // no Generate/Polish/Meme button anywhere
  })
})

describe("shared, non-toolbar message handlers still work after the toolbar's removal", () => {
  beforeEach(async () => {
    listeners.length = 0
    vi.resetModules()
    document.body.innerHTML = ""
    await import("./twitter-bridge")
  })

  it("GET_ACTIVE_TWEET still reports when no tweet is on screen", async () => {
    const res = await sendMessage({ type: "GET_ACTIVE_TWEET" }) as { ok: boolean; error?: string }
    expect(res.ok).toBe(false)
    expect(res.error).toContain("No tweet found")
  })

  it("INSERT_TEXT still runs the account-mismatch guard and reports a clean failure with no composer present", async () => {
    const res = await sendMessage({ type: "INSERT_TEXT", text: "hello" }) as { ok: boolean; error?: string }
    expect(res.ok).toBe(false)
    expect(res.error).toContain("compose box")
  })

  it("an unrecognized message type is not swallowed silently by leftover toolbar wiring", async () => {
    const res = await sendMessage({ type: "SOME_UNKNOWN_TYPE" })
    expect(res).toBeUndefined()
  })
})

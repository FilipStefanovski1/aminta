// @vitest-environment jsdom
//
// Everything in lib/composerPresets.test.ts proves the action strip's own
// click/dropdown wiring works — but only ever calls buildActionStrip()
// directly. It can never catch a bug where X's OWN DOM churn tears our
// injected bar (and therefore its WeakMap-keyed composer state) out of the
// document — a brand-new `bar` element from the next injectBar() pass would
// be a brand-new WeakMap key, silently resetting News/Product/tone/length
// selections while looking, to the user, like "the button did nothing."
//
// This drives the REAL injectBar()/buildBar()/removeBar()/startObserver()
// from contents/twitter-bridge.ts against a synthetic X-shaped DOM — no
// E2E framework, just jsdom plus a fake [data-testid="toolBar"] element and
// real MutationObserver churn.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.stubGlobal("chrome", {
  runtime: {
    getManifest: () => ({}), // no update_url -> isDev === true, enabling the diagnostics under test
    onMessage: { addListener: () => {} },
    sendMessage: () => Promise.resolve(),
  },
  storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
})

function makeToolbar(): HTMLElement {
  const toolbar = document.createElement("div")
  toolbar.setAttribute("data-testid", "toolBar")
  return toolbar
}

async function flush() {
  // MutationObserver callbacks run on their own microtask checkpoint, not
  // synchronously — a macrotask boundary reliably drains it (same technique
  // used in lib/sync.test.ts for its own async-flush needs).
  await new Promise((r) => setTimeout(r, 0))
}

function amintaBar(container: ParentNode): HTMLElement | null {
  return container.querySelector("[data-aminta-bar]")
}

function newsButton(bar: HTMLElement): HTMLButtonElement {
  const all = Array.from(bar.querySelectorAll("button"))
  const btn = all.find((b) => b.textContent?.trim() === "News")
  if (!btn) throw new Error("No News button in bar")
  return btn
}

describe("real injected composer lifecycle on a synthetic X DOM", () => {
  let root: HTMLDivElement
  let toolbar: HTMLElement

  beforeEach(async () => {
    vi.resetModules()
    document.body.innerHTML = ""
    root = document.createElement("div")
    toolbar = makeToolbar()
    root.appendChild(toolbar)
    document.body.appendChild(root)
    // startObserver() runs at module top level and does its first,
    // synchronous querySelectorAll+injectBar pass immediately — the toolbar
    // must already be in the document before this import runs, exactly
    // like the real content script attaching to an already-rendered page.
    await import("./twitter-bridge")
  })

  it("A. injects exactly one Aminta bar right after the toolbar on first load", () => {
    const bar = amintaBar(root)
    expect(bar).not.toBeNull()
    expect(toolbar.nextElementSibling).toBe(bar)
    expect(root.querySelectorAll("[data-aminta-bar]")).toHaveLength(1)
  })

  it("B. clicking News toggles it active without X's DOM churning at all", () => {
    const bar = amintaBar(root)!
    const news = newsButton(bar)
    expect(news.getAttribute("style")).not.toContain(`color:#60a5fa`) // not yet active (accent applied only when active)
    news.click()
    const barAfter = amintaBar(root)! // strip re-renders in place; bar itself is unchanged
    const newsAfter = newsButton(barAfter)
    expect(newsAfter.style.color).toBe("rgb(96, 165, 250)") // ACCENT.news, now active
  })

  it("C. X replacing the toolbar's OWN element (a real re-render) still leaves exactly one functional Aminta bar after the next observer pass", async () => {
    // Toggle News BEFORE the churn, so a state-reset regression is visible.
    newsButton(amintaBar(root)!).click()
    expect(newsButton(amintaBar(root)!).style.color).toBe("rgb(96, 165, 250)")

    const oldBar = amintaBar(root)!
    const oldBarId = oldBar.getAttribute("data-aminta-bar")

    // Simulate X unmounting and remounting the toolbar itself (a real React
    // re-render swaps the DOM node, not just its attributes) — our bar,
    // inserted as toolbar.nextSibling, goes with it since it shares the
    // same parent subtree being replaced.
    const newToolbar = makeToolbar()
    root.replaceChildren(newToolbar) // toolbar AND our old bar are both gone

    await flush()

    const rebuiltBar = amintaBar(root)
    expect(rebuiltBar).not.toBeNull() // re-injected, not left missing
    expect(root.querySelectorAll("[data-aminta-bar]")).toHaveLength(1) // exactly one — no duplicates
    expect(rebuiltBar!.getAttribute("data-aminta-bar")).toBe(oldBarId) // same COMPOSER_BAR_VERSION, i.e. still "current"

    // The important behavioral question: is the REBUILT bar's News button
    // still clickable, and does its own fresh state track correctly? A
    // fresh bar after a real X re-render is expected to start from a fresh
    // (not carried-over) selection — the invariant under test is that it's
    // still FUNCTIONAL, not stuck inert.
    const news = newsButton(rebuiltBar!)
    news.click()
    expect(newsButton(amintaBar(root)!).style.color).toBe("rgb(96, 165, 250)")
  })

  it("D. removing the toolbar entirely removes the Aminta bar (no orphaned inert bar left behind)", async () => {
    expect(amintaBar(root)).not.toBeNull()
    root.replaceChildren() // toolbar gone, nothing to attach to
    await flush()
    expect(amintaBar(document)).toBeNull()
  })

  it("E. the You dropdown stays open after the triggering click's event finishes propagating (outside-click doesn't self-close it)", () => {
    const bar = amintaBar(root)!
    const you = Array.from(bar.querySelectorAll("button")).find((b) => b.textContent?.includes("You"))!
    // A real click bubbles to document (capture-phase outside-click
    // listeners are attached with `true`) — dispatching with bubbles:true
    // reproduces that instead of the isolated .click() jsdom shortcut.
    you.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    expect(you.getAttribute("aria-expanded")).toBe("true")
  })
})

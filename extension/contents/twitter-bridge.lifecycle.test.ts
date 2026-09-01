// @vitest-environment jsdom
//
// lib/composerPresets.test.ts proves the action strip's own click wiring
// works — but only ever calls buildActionStrip() directly. It can never
// catch a bug where X's OWN DOM churn tears our injected bar out of the
// document, leaving an orphaned/inert bar or duplicate bars behind.
//
// This drives the REAL injectBar()/buildBar()/removeBar()/startObserver()
// from contents/twitter-bridge.ts against a synthetic X-shaped DOM — no
// E2E framework, just jsdom plus a fake [data-testid="toolBar"] element and
// real MutationObserver churn.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.stubGlobal("chrome", {
  runtime: {
    getManifest: () => ({}),
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

function generateButton(bar: HTMLElement): HTMLButtonElement {
  const all = Array.from(bar.querySelectorAll("button"))
  const btn = all.find((b) => b.textContent?.trim() === "Generate")
  if (!btn) throw new Error("No Generate button in bar")
  return btn
}

function statusText(bar: HTMLElement): string {
  return bar.querySelector(".aminta-status")?.textContent ?? ""
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

  it("B. only Generate and Polish are present — no News/Product/You/Length", () => {
    const bar = amintaBar(root)!
    const labels = Array.from(bar.querySelectorAll(".aminta-actions button")).map((b) => b.textContent?.trim())
    expect(labels).toEqual(["Generate", "Polish"])
  })

  it("C. clicking Generate reaches the real generation path (status text changes) without X's DOM churning at all", async () => {
    const bar = amintaBar(root)!
    expect(statusText(bar)).toBe("Aminta")
    generateButton(bar).click()
    await flush()
    expect(statusText(bar)).not.toBe("Aminta") // moved off the idle label — the click reached runGenerate
  })

  it("D. X replacing the toolbar's OWN element (a real re-render) still leaves exactly one functional Aminta bar after the next observer pass", async () => {
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

    // The rebuilt bar must still be genuinely functional, not a stale/inert
    // clone — clicking Generate on it must still reach the real handler.
    expect(statusText(rebuiltBar!)).toBe("Aminta")
    generateButton(rebuiltBar!).click()
    await flush()
    expect(statusText(rebuiltBar!)).not.toBe("Aminta")
  })

  it("E. removing the toolbar entirely removes the Aminta bar (no orphaned inert bar left behind)", async () => {
    expect(amintaBar(root)).not.toBeNull()
    root.replaceChildren() // toolbar gone, nothing to attach to
    await flush()
    expect(amintaBar(document)).toBeNull()
  })
})

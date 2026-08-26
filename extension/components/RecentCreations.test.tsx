// @vitest-environment jsdom
//
// Credit-safety regression: opening/copying/reusing a Recent Creation must
// never call generation. This module never imports lib/ai, lib/backendGenerate,
// or lib/replyGeneration at all — these tests pin the observable behavior
// (Copy = clipboard only, Reuse = callback only) that guarantee holds on.
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RecentCreations from "~components/RecentCreations"
import type { RecentCreation } from "~lib/storage"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let clipboardWrites: string[] = []
let reuseCalls: RecentCreation[] = []
let saveAsTemplateCalls: RecentCreation[] = []
let updateCalls = 0

const THREAD: RecentCreation = { id: "t1", type: "thread", posts: ["hook", "payoff"], createdAt: Date.now() }
const TWEET: RecentCreation = { id: "p1", type: "tweet", text: "a saved post", createdAt: Date.now() }

function render(creations: RecentCreation[]) {
  act(() => {
    root.render(
      <RecentCreations
        creations={creations}
        tint="#74f7b5"
        onReuse={(c) => reuseCalls.push(c)}
        onUpdate={() => { updateCalls++ }}
        onSaveAsTemplate={(c) => saveAsTemplateCalls.push(c)}
      />
    )
  })
}

// The detail modal renders via createPortal into document.body, outside
// `container` — search the whole document so modal buttons are found too.
async function click(text: string) {
  const buttons = Array.from(document.querySelectorAll("button"))
  const btn = buttons.find((b) => b.textContent === text) ?? buttons.find((b) => b.textContent?.includes(text))
  if (!btn) throw new Error(`No button with text "${text}" — visible: ${buttons.map((b) => b.textContent)}`)
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  clipboardWrites = []
  reuseCalls = []
  saveAsTemplateCalls = []
  updateCalls = 0
  Object.assign(navigator, { clipboard: { writeText: (t: string) => { clipboardWrites.push(t); return Promise.resolve() } } })
  // deleteRecentCreation() (called by the Delete button) round-trips through
  // chrome.storage.local — stub it so that path doesn't throw in jsdom.
  let memoryStore: Record<string, unknown> = {}
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: (keys: Record<string, unknown>) => Promise.resolve({ ...keys, ...memoryStore }),
        set: (patch: Record<string, unknown>) => { memoryStore = { ...memoryStore, ...patch }; return Promise.resolve() },
      },
    },
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

describe("empty state", () => {
  it("shows a small line, not a big empty card", () => {
    render([])
    expect(container.textContent).toContain("Your generated posts will appear here.")
  })
})

describe("Copy — 0 credits, local clipboard only", () => {
  it("copies the full text for a normal creation without calling generation", async () => {
    render([TWEET])
    await click(TWEET.text!)
    await click("Copy")
    expect(clipboardWrites).toEqual(["a saved post"])
  })

  it("copies all thread posts in order, blank-line separated, no artificial numbering", async () => {
    render([THREAD])
    await click(THREAD.posts![0])
    await click("Copy thread")
    expect(clipboardWrites).toEqual(["hook\n\npayoff"])
  })
})

describe("Reuse — hands the creation back to the caller, never generates", () => {
  it("calls onReuse with the full creation and nothing else", async () => {
    render([TWEET])
    await click(TWEET.text!)
    await click("Reuse")
    expect(reuseCalls).toEqual([TWEET])
  })
})

describe("Save as template — hands the creation back to the caller, never generates", () => {
  it("calls onSaveAsTemplate with the full creation and nothing else", async () => {
    render([TWEET])
    await click(TWEET.text!)
    await click("Save as template")
    expect(saveAsTemplateCalls).toEqual([TWEET])
  })
})

describe("delete", () => {
  it("removes the item via onUpdate, without touching generation", async () => {
    render([TWEET])
    await click(TWEET.text!)
    await click("Delete")
    expect(updateCalls).toBe(1)
  })
})

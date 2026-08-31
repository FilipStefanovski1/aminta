// @vitest-environment jsdom
//
// Layout-stability contract for the companion card's speech region (see
// CLAUDE.md task: "the companion Home card visibly changes layout depending
// on speech bubble text"). This can't prove actual pixel geometry — jsdom
// doesn't run layout — but it can prove the CONTRACT that makes geometry
// stable: the reserved speech region keeps the same fixed height and the
// bubble is line-clamped, regardless of how long `speech` is. If a future
// change makes the region's height depend on `speech.length`, this fails.
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AmintaStore } from "~lib/storage"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// lib/evolution.ts pulls in `url:~/assets/*.gif` (Parcel-style) imports on
// every FORMS entry, which Vitest's plain Vite transform can't resolve
// outside Plasmo's real build — mocked with the minimal real shape HomeTab
// needs (same pattern as OnboardingWizard.test.tsx).
vi.mock("~lib/evolution", () => {
  const skin = { body: "#74f7b5", horn: "#000", eye: "#000" }
  const form = { level: 1, name: "Dormant", color: "#74f7b5", rarity: "COMMON", blurb: "", revealed: true, skin }
  return {
    FORMS: [form],
    getForm: () => form,
    getLevel: () => 1,
    getStageTint: () => "#74f7b5",
    getXpInLevel: () => 0,
    getXpProgress: () => 0,
    getLevelSpan: () => 300,
  }
})
vi.mock("~lib/xTab", () => ({ openXComposer: vi.fn(), focusOrCreateXTab: vi.fn() }))

const { default: HomeTab } = await import("~components/HomeTab")

const BASE_STORE = {
  xp: 0, plan: "free", streak: 0, xpToday: 0,
  voice: null, tweetDNA: [], styleProfile: null,
  recentCreations: [], bounties: [],
} as unknown as AmintaStore

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function renderHome(speech: string) {
  act(() => {
    root.render(
      <HomeTab
        store={BASE_STORE}
        onCreate={() => {}}
        onReuse={() => {}}
        onSaveCreationAsTemplate={() => {}}
        animClass=""
        animKey={0}
        speech={speech}
      />
    )
  })
}

function bubbleText(): HTMLElement {
  // Distinct from the header's stage-name <p> (same font-pixel text-[8px]
  // classes) via its leading-relaxed/text-center styling, unique to the
  // bubble.
  return container.querySelector("p.leading-relaxed.text-center") as HTMLElement
}

function speechRegion(): HTMLElement {
  // The bubble's text lives in a font-pixel <p>; its fixed-height
  // grandparent is the reserved speech region.
  const p = bubbleText()
  return p.parentElement!.parentElement!.parentElement!.parentElement as HTMLElement
}

describe("companion speech region reserves a fixed height regardless of message length", () => {
  const messages = [
    "nice.",
    "let's keep this going.",
    "i missed you. post something.",
    "this is a deliberately much longer companion message than the others, spanning well past two lines of text to see what happens",
  ]

  it("the reserved region's height never changes across short and long messages", () => {
    const heights = messages.map((m) => {
      renderHome(m)
      return speechRegion().style.height
    })
    expect(new Set(heights).size).toBe(1) // one shared height across every message
    expect(heights[0]).not.toBe("")
  })

  it("the bubble text is line-clamped to 2 lines on Home (not left to grow the card)", () => {
    renderHome(messages[3])
    const p = bubbleText()
    expect(p.style.webkitLineClamp).toBe("2")
    expect(p.style.overflow).toBe("hidden")
  })
})

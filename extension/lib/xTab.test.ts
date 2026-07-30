import { beforeEach, describe, expect, it, vi } from "vitest"
import { focusOrCreateXTab, openXComposer } from "~lib/xTab"

function tab(overrides: Partial<chrome.tabs.Tab> & { lastAccessed?: number } = {}): chrome.tabs.Tab {
  return {
    id: 1, index: 0, windowId: 1, active: false, highlighted: false, pinned: false,
    incognito: false, selected: false, discarded: false, autoDiscardable: true,
    groupId: -1, url: "https://x.com/home", ...overrides,
  } as chrome.tabs.Tab
}

describe("xTab", () => {
  let query: ReturnType<typeof vi.fn>
  let update: ReturnType<typeof vi.fn>
  let windowsUpdate: ReturnType<typeof vi.fn>
  let getLastFocused: ReturnType<typeof vi.fn>
  let create: ReturnType<typeof vi.fn>
  let sendMessage: ReturnType<typeof vi.fn>
  let executeScript: ReturnType<typeof vi.fn>

  beforeEach(() => {
    query = vi.fn().mockResolvedValue([])
    update = vi.fn().mockResolvedValue(undefined)
    windowsUpdate = vi.fn().mockResolvedValue(undefined)
    // No test cares which window is focused unless it sets this explicitly —
    // default to a window id that won't match any tab's windowId, so the
    // "active in focused window" preference is a no-op by default.
    getLastFocused = vi.fn().mockResolvedValue({ id: -1 })
    create = vi.fn().mockResolvedValue(undefined)
    sendMessage = vi.fn().mockResolvedValue({ ok: true })
    executeScript = vi.fn().mockResolvedValue(undefined)

    ;(globalThis as any).chrome = {
      tabs: { query, update, create, sendMessage },
      windows: { update: windowsUpdate, getLastFocused },
      scripting: { executeScript },
    }
  })

  describe("openXComposer", () => {
    it("no existing X tab: opens a new tab straight at the composer", async () => {
      query.mockResolvedValue([])
      await openXComposer()
      expect(create).toHaveBeenCalledWith({ url: "https://x.com/compose/post" })
      expect(update).not.toHaveBeenCalled()
    })

    it("one existing X tab: focuses it and asks it to open the composer, no new tab", async () => {
      query.mockResolvedValue([tab({ id: 7, windowId: 3, active: true })])
      await openXComposer()
      expect(create).not.toHaveBeenCalled()
      expect(windowsUpdate).toHaveBeenCalledWith(3, { focused: true })
      expect(update).toHaveBeenCalledWith(7, { active: true })
      expect(sendMessage).toHaveBeenCalledWith(7, { type: "OPEN_COMPOSER" })
    })

    it("multiple X tabs: prefers the currently active one", async () => {
      query.mockResolvedValue([
        tab({ id: 1, active: false, lastAccessed: 500 }),
        tab({ id: 2, active: true, lastAccessed: 100 }),
      ])
      await openXComposer()
      expect(sendMessage).toHaveBeenCalledWith(2, { type: "OPEN_COMPOSER" })
    })

    it("multiple X tabs across windows, several active: prefers the one in the focused window", async () => {
      // tab.active is per-window — a tab can be "active" (frontmost of its
      // own window) in more than one window at once. Without disambiguating
      // by the actually-focused window, this could pick a background
      // window's X tab instead of the one the user is looking at.
      getLastFocused.mockResolvedValue({ id: 50 })
      query.mockResolvedValue([
        tab({ id: 1, windowId: 10, active: true }),  // active in a background window
        tab({ id: 2, windowId: 50, active: true }),  // active in the focused window
      ])
      await openXComposer()
      expect(windowsUpdate).toHaveBeenCalledWith(50, { focused: true })
      expect(sendMessage).toHaveBeenCalledWith(2, { type: "OPEN_COMPOSER" })
    })

    it("multiple X tabs, none active: prefers the most recently accessed", async () => {
      query.mockResolvedValue([
        tab({ id: 1, active: false, lastAccessed: 100 }),
        tab({ id: 2, active: false, lastAccessed: 900 }),
        tab({ id: 3, active: false, lastAccessed: 400 }),
      ])
      await openXComposer()
      expect(sendMessage).toHaveBeenCalledWith(2, { type: "OPEN_COMPOSER" })
    })

    it("composer message fails once: re-injects the content script and retries", async () => {
      query.mockResolvedValue([tab({ id: 9, active: true })])
      sendMessage.mockRejectedValueOnce(new Error("no receiver")).mockResolvedValueOnce({ ok: true })
      await openXComposer()
      expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 9 }, files: ["contents/twitter-bridge.js"] })
      expect(sendMessage).toHaveBeenCalledTimes(2)
    })

    it("repeated rapid clicks share one in-flight operation, not one tab each", async () => {
      query.mockResolvedValue([])
      await Promise.all([openXComposer(), openXComposer(), openXComposer()])
      expect(create).toHaveBeenCalledTimes(1)
    })
  })

  describe("focusOrCreateXTab", () => {
    it("no existing X tab: creates one at the fallback URL", async () => {
      query.mockResolvedValue([])
      await focusOrCreateXTab()
      expect(create).toHaveBeenCalledWith({ url: "https://x.com" })
    })

    it("existing X tab: focuses it instead of creating a new one", async () => {
      query.mockResolvedValue([tab({ id: 5, windowId: 2 })])
      await focusOrCreateXTab()
      expect(create).not.toHaveBeenCalled()
      expect(windowsUpdate).toHaveBeenCalledWith(2, { focused: true })
      expect(update).toHaveBeenCalledWith(5, { active: true })
    })

    it("X tab open in another window still gets focused (window + tab both updated)", async () => {
      query.mockResolvedValue([tab({ id: 11, windowId: 99, active: false })])
      await focusOrCreateXTab()
      expect(windowsUpdate).toHaveBeenCalledWith(99, { focused: true })
      expect(update).toHaveBeenCalledWith(11, { active: true })
    })
  })
})

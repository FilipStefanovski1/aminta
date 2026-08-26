import { beforeEach, describe, expect, it, vi } from "vitest"

// In-memory chrome.storage.local stand-in — same pattern as templates.test.ts.
let memoryStore: Record<string, unknown> = {}
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: (keys: Record<string, unknown>) => Promise.resolve({ ...keys, ...memoryStore }),
      set: (patch: Record<string, unknown>) => {
        memoryStore = { ...memoryStore, ...patch }
        return Promise.resolve()
      },
    },
  },
})

let uuidCounter = 0
vi.stubGlobal("crypto", {
  ...globalThis.crypto,
  randomUUID: () => `test-uuid-${uuidCounter++}`,
})

import { getStore } from "~lib/storage"
import { MAX_RECENT_CREATIONS, deleteRecentCreation, relativeTimeLabel, saveRecentCreation } from "~lib/recentCreations"

beforeEach(() => {
  memoryStore = {}
  uuidCounter = 0
})

describe("saveRecentCreation", () => {
  it("saves a successful tweet generation", async () => {
    await saveRecentCreation({ type: "tweet", text: "hello world" })
    const store = await getStore()
    expect(store.recentCreations).toHaveLength(1)
    expect(store.recentCreations[0]).toMatchObject({ type: "tweet", text: "hello world" })
  })

  it("does not save an empty/blank result", async () => {
    await saveRecentCreation({ type: "polish", text: "   " })
    await saveRecentCreation({ type: "polish", text: "" })
    const store = await getStore()
    expect(store.recentCreations).toEqual([])
  })

  it("preserves thread posts as an ordered array, not a flattened blob", async () => {
    await saveRecentCreation({ type: "thread", posts: ["hook", "middle", "payoff"] })
    const store = await getStore()
    expect(store.recentCreations[0].posts).toEqual(["hook", "middle", "payoff"])
    expect(store.recentCreations[0].text).toBeUndefined()
  })

  it("does not save a thread with no posts", async () => {
    await saveRecentCreation({ type: "thread", posts: [] })
    const store = await getStore()
    expect(store.recentCreations).toEqual([])
  })

  it("newest first — each save is prepended", async () => {
    await saveRecentCreation({ type: "tweet", text: "first" })
    await saveRecentCreation({ type: "tweet", text: "second" })
    const store = await getStore()
    expect(store.recentCreations.map((c) => c.text)).toEqual(["second", "first"])
  })

  it("keeps only the newest MAX_RECENT_CREATIONS, dropping the oldest", async () => {
    for (let i = 0; i < MAX_RECENT_CREATIONS + 1; i++) {
      await saveRecentCreation({ type: "tweet", text: `post ${i}` })
    }
    const store = await getStore()
    expect(store.recentCreations).toHaveLength(MAX_RECENT_CREATIONS)
    expect(store.recentCreations[0].text).toBe(`post ${MAX_RECENT_CREATIONS}`)
    expect(store.recentCreations.at(-1)!.text).toBe("post 1")
  })

  it("one completed generation creates exactly one entry — calling it twice for the same event never happens, but two genuinely separate saves never merge into one either", async () => {
    await saveRecentCreation({ type: "tweet", text: "same text" })
    await saveRecentCreation({ type: "tweet", text: "same text" })
    const store = await getStore()
    expect(store.recentCreations).toHaveLength(2)
  })
})

describe("missing history safely becomes []", () => {
  it("getStore() with no prior recentCreations field returns an empty array, not undefined", async () => {
    const store = await getStore()
    expect(store.recentCreations).toEqual([])
  })
})

describe("deleteRecentCreation", () => {
  it("removes only the targeted entry", async () => {
    await saveRecentCreation({ type: "tweet", text: "keep me" })
    const afterFirst = await getStore()
    await saveRecentCreation({ type: "tweet", text: "delete me" })
    const afterSecond = await getStore()
    const toDelete = afterSecond.recentCreations.find((c) => c.text === "delete me")!
    await deleteRecentCreation(toDelete.id)
    const store = await getStore()
    expect(store.recentCreations).toHaveLength(1)
    expect(store.recentCreations[0].id).toBe(afterFirst.recentCreations[0].id)
  })
})

describe("relativeTimeLabel", () => {
  const now = Date.parse("2026-08-26T12:00:00Z")
  it("Just now for under a minute", () => {
    expect(relativeTimeLabel(now - 30_000, now)).toBe("Just now")
  })
  it("minutes for under an hour", () => {
    expect(relativeTimeLabel(now - 12 * 60_000, now)).toBe("12m")
  })
  it("hours for under a day", () => {
    expect(relativeTimeLabel(now - 2 * 3_600_000, now)).toBe("2h")
  })
  it("Yesterday for exactly one day back", () => {
    expect(relativeTimeLabel(now - 24 * 3_600_000, now)).toBe("Yesterday")
  })
})

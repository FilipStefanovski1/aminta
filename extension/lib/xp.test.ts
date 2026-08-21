// Confirmed-publish resolution: exercises the two additions made alongside
// the daily-goals redesign — resolvePendingXP() now (1) counts a lifetime
// "real publish" total distinct from generationsTotal, and (2) reports which
// mode was actually published so callers (background.ts → missions.ts) can
// credit the right per-mode daily goal.
import { beforeEach, describe, expect, it, vi } from "vitest"

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

import { getStore, setStore } from "~lib/storage"
import { queuePendingXP, resolvePendingXP } from "~lib/xp"

beforeEach(() => {
  memoryStore = {}
})

describe("resolvePendingXP tracks real publishes and their mode", () => {
  it("increments postsPublishedTotal on a confirmed publish", async () => {
    await queuePendingXP("hash-1", 50, "tweet")
    const before = (await getStore()).postsPublishedTotal
    expect(before).toBe(0)
    await resolvePendingXP()
    const after = (await getStore()).postsPublishedTotal
    expect(after).toBe(1)
  })

  it("does not increment postsPublishedTotal when nothing was pending", async () => {
    await resolvePendingXP()
    expect((await getStore()).postsPublishedTotal).toBe(0)
  })

  it("reports the mode of the resolved publish", async () => {
    await queuePendingXP("hash-2", 25, "reply")
    const result = await resolvePendingXP()
    expect(result?.mode).toBe("reply")
  })

  it("postsPublishedTotal is distinct from generationsTotal", async () => {
    // Simulate several Generate clicks with no publish at all.
    await setStore({ generationsTotal: 5 })
    expect((await getStore()).postsPublishedTotal).toBe(0)
    expect((await getStore()).generationsTotal).toBe(5)
  })
})

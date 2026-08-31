// Targeted coverage for lib/sync.ts's epoch guard — the mechanism that
// stops a slow pull/push started under one account from resolving (and
// silently writing its stale data) after the user has already switched to
// a different account. See lib/accountScope.ts's handleAuthUserChanged,
// which bumps the epoch immediately before clearing on every real switch.
import { beforeEach, describe, expect, it, vi } from "vitest"

let memoryStore: Record<string, unknown> = {}
vi.stubGlobal("chrome", {
  runtime: { getManifest: () => ({}) },
  storage: {
    local: {
      get: (keys: Record<string, unknown> | string | string[]) => {
        if (Array.isArray(keys) || typeof keys === "string") {
          const keyList = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, unknown> = {}
          for (const k of keyList) if (k in memoryStore) out[k] = memoryStore[k]
          return Promise.resolve(out)
        }
        const defaults = keys as Record<string, unknown>
        const out: Record<string, unknown> = { ...defaults }
        for (const k of Object.keys(defaults)) if (k in memoryStore) out[k] = memoryStore[k]
        return Promise.resolve(out)
      },
      set: (patch: Record<string, unknown>) => {
        memoryStore = { ...memoryStore, ...patch }
        return Promise.resolve()
      },
    },
  },
})

vi.mock("~lib/auth", () => ({
  getAuthSession: vi.fn().mockResolvedValue({ accessToken: "tok", refreshToken: "r", userId: "u", email: "e@x.com" }),
  refreshAuthSession: vi.fn(),
}))

import { getStore } from "~lib/storage"
import { bumpSyncEpoch, currentSyncEpoch, pullFromCloud } from "~lib/sync"

beforeEach(() => {
  memoryStore = {}
  vi.stubGlobal("fetch", vi.fn())
})

describe("bumpSyncEpoch / currentSyncEpoch", () => {
  it("increments monotonically", () => {
    const before = currentSyncEpoch()
    const after = bumpSyncEpoch()
    expect(after).toBe(before + 1)
    expect(currentSyncEpoch()).toBe(after)
  })
})

describe("pullFromCloud discards a stale response after the account changes mid-flight", () => {
  it("a response that resolves after the epoch was bumped is never written to storage", async () => {
    let resolveFetch!: (res: Response) => void
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => { resolveFetch = resolve })
    )

    const pullPromise = pullFromCloud() // starts under the CURRENT epoch

    bumpSyncEpoch() // simulate an account switch happening while the request is in flight

    resolveFetch({
      status: 200, ok: true,
      json: async () => ({ xp: 9999, plan: "pro" }), // account A's stale, would-be-wrong data
    } as Response)
    await pullPromise

    const store = await getStore()
    expect(store.xp).toBe(0) // the stale response never got written
    expect(store.plan).toBe("free")
  })

  it("a response that resolves with no epoch change in between IS written normally", async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({ xp: 123, plan: "free" }),
    } as Response)

    await pullFromCloud()

    expect((await getStore()).xp).toBe(123)
  })
})

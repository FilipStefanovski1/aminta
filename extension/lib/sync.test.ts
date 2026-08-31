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
import { bumpSyncEpoch, currentSyncEpoch, pullFromCloud, pushToCloud } from "~lib/sync"

beforeEach(() => {
  memoryStore = { auth_user_id: "u" } // matches the mocked ~lib/auth session's userId by default
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

  // CROSS-CONTEXT regression: the sidepanel page and the background service
  // worker each have their OWN module instance of this file, so each has
  // its OWN independent syncEpoch counter — a switch detected and bumped in
  // one context's epoch is invisible to a pull already in flight in the
  // OTHER context. auth_user_id itself lives in the one chrome.storage.local
  // bucket every context reads from, so this simulates exactly that: the
  // account changes in storage (as a different context would do it) WITHOUT
  // this context's own bumpSyncEpoch() ever being called.
  it("still discards a stale response when the account changes via storage alone — no bumpSyncEpoch() in THIS context", async () => {
    let resolveFetch!: (res: Response) => void
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => { resolveFetch = resolve })
    )

    const pullPromise = pullFromCloud() // captures userId "u" at the start

    // Simulates account B's tokens landing via a DIFFERENT context (e.g.
    // aminta-auth-bridge.ts writing directly, or background.ts's own
    // handleAuthUserChanged) — this context's syncEpoch never moves.
    memoryStore.auth_user_id = "u-different-account"

    resolveFetch({
      status: 200, ok: true,
      json: async () => ({ xp: 9999, plan: "pro" }), // account A's stale data
    } as Response)
    await pullPromise

    const store = await getStore()
    expect(store.xp).toBe(0) // never written, even though the epoch never changed
    expect(store.plan).toBe("free")
  })
})

describe("pushToCloud discards a stale push after the account changes cross-context", () => {
  it("never even sends account A's stale local xp once a different context has already switched the account", async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) } as Response)

    const pushPromise = pushToCloud() // captures userId "u" synchronously, before this line runs
    memoryStore.auth_user_id = "u-different-account" // a different context's switch, this context's epoch untouched
    await pushPromise

    // Caught at the pre-send check — the request for A's stale xp never
    // goes out at all under B's now-current credentials.
    expect(fetch).not.toHaveBeenCalled()
    expect(memoryStore.sync_last_push).toBeUndefined()
  })

  it("also discards the response if the account changes while the request is already in flight", async () => {
    let resolveFetch!: (res: Response) => void
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => { resolveFetch = resolve }))

    // Let pushToCloud() past its pre-send check (and into the paused fetch
    // call) before mutating storage, so this exercises the SECOND
    // (post-fetch) check specifically, not the pre-send one above. A
    // macrotask boundary reliably drains every microtask queued so far,
    // unlike a fixed count of Promise.resolve() ticks.
    const pushPromise = pushToCloud()
    await new Promise((r) => setTimeout(r, 0))

    memoryStore.auth_user_id = "u-different-account"
    resolveFetch({ status: 200, ok: true, json: async () => ({ ok: true }) } as Response)
    await pushPromise

    expect(memoryStore.sync_last_push).toBeUndefined()
  })

})

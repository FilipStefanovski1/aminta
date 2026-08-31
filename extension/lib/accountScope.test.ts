import { beforeEach, describe, expect, it, vi } from "vitest"

// In-memory chrome.storage.local stand-in — real get/set/remove semantics,
// same pattern as missions.test.ts/templates.test.ts. Must be stubbed
// BEFORE importing lib/accountScope.ts below: that module reads
// `chrome.runtime.getManifest()` at its own top level (to compute isDev),
// so `chrome` has to exist the moment the module is first evaluated.
let memoryStore: Record<string, unknown> = {}
vi.stubGlobal("chrome", {
  runtime: { getManifest: () => ({}) }, // no update_url => isDev === true, matches real unpacked/dev builds
  storage: {
    local: {
      get: (keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys]
        const out: Record<string, unknown> = {}
        for (const k of keyList) if (k in memoryStore) out[k] = memoryStore[k]
        return Promise.resolve(out)
      },
      set: (patch: Record<string, unknown>) => {
        memoryStore = { ...memoryStore, ...patch }
        return Promise.resolve()
      },
      remove: (keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys]
        for (const k of keyList) delete memoryStore[k]
        return Promise.resolve()
      },
    },
  },
})

vi.mock("~lib/storage", () => ({
  clearAccountScopedState: vi.fn().mockResolvedValue(undefined),
  getStore: vi.fn().mockResolvedValue({ xp: 0 }),
}))
vi.mock("~lib/sync", () => ({
  pullFromCloud: vi.fn().mockResolvedValue({ cloudXp: 0 }),
  bumpSyncEpoch: vi.fn().mockReturnValue(1),
}))

import { clearAccountScopedState, getStore } from "~lib/storage"
import { pullFromCloud, bumpSyncEpoch } from "~lib/sync"
import { handleAuthUserChanged, storeIsOwnedBy } from "~lib/accountScope"

const mockClear = vi.mocked(clearAccountScopedState)
const mockGetStore = vi.mocked(getStore)
const mockPull = vi.mocked(pullFromCloud)
const mockBumpEpoch = vi.mocked(bumpSyncEpoch)

beforeEach(() => {
  memoryStore = {}
  mockClear.mockClear().mockResolvedValue(undefined)
  mockGetStore.mockClear().mockResolvedValue({ xp: 0 } as never)
  mockPull.mockClear().mockResolvedValue({ cloudXp: 0 })
  mockBumpEpoch.mockClear()
})

describe("storeIsOwnedBy", () => {
  it("is false when no owner has ever been recorded", async () => {
    expect(await storeIsOwnedBy("uuid-a")).toBe(false)
  })

  it("is true once handleAuthUserChanged has recorded that owner", async () => {
    await handleAuthUserChanged(null, "uuid-a")
    expect(await storeIsOwnedBy("uuid-a")).toBe(true)
    expect(await storeIsOwnedBy("uuid-b")).toBe(false)
  })
})

describe("handleAuthUserChanged — the core cross-account guard", () => {
  it("first-ever sign-in on this device: nothing to clear, pulls cloud state, records the owner", async () => {
    await handleAuthUserChanged(null, "uuid-a")
    expect(mockClear).not.toHaveBeenCalled()
    expect(mockPull).toHaveBeenCalledTimes(1)
    expect(await storeIsOwnedBy("uuid-a")).toBe(true)
  })

  it("A -> B live switch (in-memory previousUserId known): clears BEFORE pulling B's cloud state", async () => {
    await handleAuthUserChanged(null, "uuid-a") // establish A as owner
    mockClear.mockClear()
    mockPull.mockClear()

    const callOrder: string[] = []
    mockClear.mockImplementation(async () => { callOrder.push("clear") })
    mockPull.mockImplementation(async () => { callOrder.push("pull"); return { cloudXp: 5 } })

    await handleAuthUserChanged("uuid-a", "uuid-b")
    expect(callOrder).toEqual(["clear", "pull"])
    expect(mockBumpEpoch).toHaveBeenCalled()
    expect(await storeIsOwnedBy("uuid-b")).toBe(true)
    expect(await storeIsOwnedBy("uuid-a")).toBe(false)
  })

  it("REGRESSION: cold start with NO in-memory history still detects a real switch via the persisted owner marker", async () => {
    // Simulates a sidepanel remount / MV3 service-worker restart: the caller
    // has no in-memory previousUserId (null), but this device's persisted
    // marker still correctly remembers the last account — this is exactly
    // the gap that let a fresh hydration trust account A's cached XP/level
    // for account B with no live switch event ever observed in this context.
    await handleAuthUserChanged(null, "uuid-a")
    mockClear.mockClear()

    await handleAuthUserChanged(null, "uuid-b") // previousUserId unknown to THIS caller
    expect(mockClear).toHaveBeenCalledTimes(1) // still cleared — the persisted marker caught it
    expect(await storeIsOwnedBy("uuid-b")).toBe(true)
  })

  it("cold start for the SAME returning user: no clear, no data loss", async () => {
    await handleAuthUserChanged(null, "uuid-a")
    mockClear.mockClear()

    await handleAuthUserChanged(null, "uuid-a") // same user, in-memory history just happens to be unknown
    expect(mockClear).not.toHaveBeenCalled()
    expect(await storeIsOwnedBy("uuid-a")).toBe(true)
  })

  it("logout clears local state and the owner marker, and never attempts a pull", async () => {
    await handleAuthUserChanged(null, "uuid-a")
    mockClear.mockClear()
    mockPull.mockClear()

    await handleAuthUserChanged("uuid-a", null)
    expect(mockClear).toHaveBeenCalledTimes(1)
    expect(mockPull).not.toHaveBeenCalled()
    expect(await storeIsOwnedBy("uuid-a")).toBe(false)
  })

  it("A -> logout -> A again: no data loss (cloud state is what's restored)", async () => {
    await handleAuthUserChanged(null, "uuid-a")
    await handleAuthUserChanged("uuid-a", null) // logout: local cache cleared, cloud row untouched
    mockPull.mockClear()

    await handleAuthUserChanged(null, "uuid-a") // sign back in
    expect(mockPull).toHaveBeenCalledTimes(1) // re-fetches A's own persisted cloud state
    expect(await storeIsOwnedBy("uuid-a")).toBe(true)
  })

  it("A -> B -> A: each transition clears, and A's identity is correctly restored", async () => {
    await handleAuthUserChanged(null, "uuid-a")
    await handleAuthUserChanged("uuid-a", "uuid-b")
    expect(await storeIsOwnedBy("uuid-b")).toBe(true)

    mockClear.mockClear()
    await handleAuthUserChanged("uuid-b", "uuid-a")
    expect(mockClear).toHaveBeenCalledTimes(1)
    expect(await storeIsOwnedBy("uuid-a")).toBe(true)
    expect(await storeIsOwnedBy("uuid-b")).toBe(false)
  })

  it("a redundant second call for the SAME transition (e.g. background.ts and sidepanel both reacting) is a safe no-op re-clear", async () => {
    await handleAuthUserChanged(null, "uuid-a")
    await handleAuthUserChanged("uuid-a", "uuid-b") // first listener to react
    mockClear.mockClear()
    mockPull.mockClear()

    // Second, independent listener reacting to the exact same auth change —
    // its own in-memory previousUserId still says "a" (it hasn't updated
    // its ref yet), but the persisted marker already says "b".
    await handleAuthUserChanged("uuid-a", "uuid-b")
    expect(mockClear).not.toHaveBeenCalled() // already-correct state is not wiped again
    expect(mockPull).toHaveBeenCalledTimes(1) // still does a normal (safe, idempotent) pull
  })

  it("account with server state but no local cache: pulls normally, no clear needed", async () => {
    mockGetStore.mockResolvedValue({ xp: 0 } as never)
    mockPull.mockResolvedValue({ cloudXp: 240 })
    await handleAuthUserChanged(null, "uuid-new")
    expect(mockClear).not.toHaveBeenCalled()
    expect(mockPull).toHaveBeenCalledTimes(1)
  })

  it("legacy global state with an UNKNOWN owner (pre-fix install, marker never recorded) is not treated as a switch for its own returning user", async () => {
    // No prior handleAuthUserChanged call has ever run on this "device" —
    // exactly the state of an existing install immediately after upgrading
    // to this fix. The legitimate, already-authenticated user reopening the
    // panel must not have their own real progression wiped.
    await handleAuthUserChanged(null, "uuid-existing-user")
    expect(mockClear).not.toHaveBeenCalled()
    expect(await storeIsOwnedBy("uuid-existing-user")).toBe(true)
  })
})

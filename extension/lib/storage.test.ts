import { beforeEach, describe, expect, it, vi } from "vitest"

// In-memory chrome.storage.local stand-in — same pattern as missions.test.ts.
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

import { clearAccountScopedState, getStore, setStore } from "~lib/storage"

beforeEach(() => {
  memoryStore = {}
})

describe("clearAccountScopedState — sign out must clear the right things", () => {
  it("clears account-scoped identity/plan state (X identity, plan, credits)", async () => {
    await setStore({
      xConnected: true,
      xUsername: "filiplesterr",
      xDisplayName: "Filip Stefanovski",
      xAvatarUrl: "https://pbs.twimg.com/avatar.jpg",
      plan: "pro",
      creditsBalance: 42,
    })

    await clearAccountScopedState()
    const store = await getStore()

    expect(store.xConnected).toBe(false)
    expect(store.xUsername).toBe("")
    expect(store.xDisplayName).toBe("")
    expect(store.xAvatarUrl).toBe("")
    expect(store.plan).toBe("free")
    expect(store.creditsBalance).toBe(0)
  })

  it("preserves device-scoped preferences — not account data", async () => {
    await setStore({ apiKey: "sk-user-key", model: "gpt-oss-120b", avatarDataUrl: "data:image/png;base64,xyz" })

    await clearAccountScopedState()
    const store = await getStore()

    expect(store.apiKey).toBe("sk-user-key")
    expect(store.model).toBe("gpt-oss-120b")
    expect(store.avatarDataUrl).toBe("data:image/png;base64,xyz")
  })
})

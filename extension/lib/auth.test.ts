import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// In-memory chrome.storage.local stand-in — same pattern as missions.test.ts.
let memoryStore: Record<string, unknown> = {}
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: (keys: string[] | Record<string, unknown>) => {
        if (Array.isArray(keys)) {
          const out: Record<string, unknown> = {}
          for (const k of keys) if (k in memoryStore) out[k] = memoryStore[k]
          return Promise.resolve(out)
        }
        return Promise.resolve({ ...keys, ...memoryStore })
      },
      set: (patch: Record<string, unknown>) => {
        memoryStore = { ...memoryStore, ...patch }
        return Promise.resolve()
      },
      remove: (keys: string[]) => {
        for (const k of keys) delete memoryStore[k]
        return Promise.resolve()
      },
    },
  },
})

import { getAuthSession, refreshAuthSession, setAuthSession, signOutEverywhere } from "~lib/auth"

beforeEach(() => {
  memoryStore = {}
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const SESSION = { accessToken: "at", refreshToken: "rt", userId: "u1", email: "u@example.com" }

describe("signOutEverywhere", () => {
  it("revokes the session server-side, then clears local auth state", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const result = await signOutEverywhere()

    expect(result.ok).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(
      "https://amintaapp.com/api/auth/logout",
      expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer at" } })
    )
    expect(await getAuthSession()).toBeNull()
  })

  it("does not clear local state when the server revoke fails — no ambiguous half-logged-out state", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 502 }))

    const result = await signOutEverywhere()

    expect(result.ok).toBe(false)
    expect(await getAuthSession()).toEqual(SESSION)
  })

  it("does not clear local state on a network error", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockRejectedValue(new Error("offline"))

    const result = await signOutEverywhere()

    expect(result.ok).toBe(false)
    expect(await getAuthSession()).toEqual(SESSION)
  })

  it("just clears local state when there was never a session to revoke", async () => {
    const result = await signOutEverywhere()
    expect(result.ok).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe("refreshAuthSession — a revoked refresh token cannot silently restore a signed-out session", () => {
  it("clears the local session when the refresh token is rejected as invalid (401)", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ error: "invalid" }), { status: 401 }))

    const result = await refreshAuthSession()

    expect(result).toBeNull()
    expect(await getAuthSession()).toBeNull()
  })
})

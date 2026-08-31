import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// In-memory chrome.storage.local stand-in — same pattern as missions.test.ts.
let memoryStore: Record<string, unknown> = {}
function installWorkingChromeStub() {
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
}
installWorkingChromeStub()

import { getAuthSession, refreshAuthSession, setAuthSession, signOutEverywhere } from "~lib/auth"

beforeEach(() => {
  memoryStore = {}
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
  installWorkingChromeStub() // undo any test-specific chrome.storage override (e.g. a simulated broken local write)
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

  // Regression coverage for "Sign out failed. Try again." trapping the
  // user indefinitely: a remote revoke that can't be confirmed (expired
  // token, invalid/missing refresh token, or the server unreachable) must
  // never block clearing the LOCAL session — that's the one thing this
  // device actually needs to stop acting as the signed-in user.

  it("expired/already-invalid session (server 401): local session still clears — the user is not trapped", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ error: "invalid" }), { status: 401 }))

    const result = await signOutEverywhere()

    expect(result.ok).toBe(true)
    expect(await getAuthSession()).toBeNull()
  })

  it("a genuine server failure (502) still clears local session instead of trapping the user behind a retry loop", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 502 }))

    const result = await signOutEverywhere()

    expect(result.ok).toBe(true)
    expect(await getAuthSession()).toBeNull()
  })

  it("a network error reaching the logout endpoint still clears local session", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockRejectedValue(new Error("offline"))

    const result = await signOutEverywhere()

    expect(result.ok).toBe(true)
    expect(await getAuthSession()).toBeNull()
  })

  it("just clears local state when there was never a session to revoke", async () => {
    const result = await signOutEverywhere()
    expect(result.ok).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("only fails when the LOCAL clear itself is the thing that breaks", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: (keys: string[]) => {
            const out: Record<string, unknown> = {}
            for (const k of keys) if (k in memoryStore) out[k] = memoryStore[k]
            return Promise.resolve(out)
          },
          remove: () => Promise.reject(new Error("storage broken")),
        },
      },
    })

    const result = await signOutEverywhere()

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.error).not.toMatch(/at|rt/) // never leaks the raw token into the message
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

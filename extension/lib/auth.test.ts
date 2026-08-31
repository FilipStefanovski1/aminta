import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// In-memory chrome.storage.local stand-in — same pattern as missions.test.ts.
let memoryStore: Record<string, unknown> = {}
let tabsCreateCalls: { url: string; active?: boolean }[] = []
function installWorkingChromeStub() {
  vi.stubGlobal("chrome", {
    runtime: { getManifest: () => ({}) },
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
    tabs: {
      create: (opts: { url: string; active?: boolean }) => {
        tabsCreateCalls.push(opts)
        return Promise.resolve({ id: 1 })
      },
    },
  })
}
installWorkingChromeStub()

import { getAuthSession, refreshAuthSession, setAuthSession, signOutEverywhere } from "~lib/auth"

beforeEach(() => {
  memoryStore = {}
  tabsCreateCalls = []
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

  // The other half of the wrong-account bug: revoking the token server-side
  // and clearing the extension's own chrome.storage.local never touched
  // amintaapp.com's own browser-side Supabase session (its own cookies),
  // which is exactly what let a later "Connect with X" silently hand back
  // that same still-logged-in account. See app/logout-complete/page.tsx.
  it("also opens the website's own logout-completion page, unfocused, to invalidate its browser session", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await signOutEverywhere()

    expect(tabsCreateCalls).toEqual([{ url: "https://amintaapp.com/logout-complete", active: false }])
  })

  it("never calls the X data-connection disconnect endpoint or anything under /x/ — sign-out is not the same as disconnecting X", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await signOutEverywhere()

    const urls = vi.mocked(global.fetch).mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes("/x/"))).toBe(false)
    expect(tabsCreateCalls.some((t) => t.url.includes("/x/") || t.url.includes("x.com"))).toBe(false)
  })

  it("never opens or navigates x.com — signing out of Aminta must not touch the X session", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await signOutEverywhere()

    expect(tabsCreateCalls.every((t) => !t.url.includes("x.com") && !t.url.includes("twitter.com"))).toBe(true)
  })

  it("never calls any account-deletion endpoint — sign-out only ever hits /api/auth/logout", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await signOutEverywhere()

    const urls = vi.mocked(global.fetch).mock.calls.map((c) => String(c[0]))
    expect(urls).toEqual(["https://amintaapp.com/api/auth/logout"])
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
    expect(tabsCreateCalls).toHaveLength(1) // website logout still attempted
  })

  it("a genuine server failure (502) still clears local session instead of trapping the user behind a retry loop", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 502 }))

    const result = await signOutEverywhere()

    expect(result.ok).toBe(true)
    expect(await getAuthSession()).toBeNull()
    expect(tabsCreateCalls).toHaveLength(1)
  })

  it("a network error reaching the logout endpoint still clears local session", async () => {
    await setAuthSession(SESSION)
    vi.mocked(global.fetch).mockRejectedValue(new Error("offline"))

    const result = await signOutEverywhere()

    expect(result.ok).toBe(true)
    expect(await getAuthSession()).toBeNull()
    expect(tabsCreateCalls).toHaveLength(1)
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
    expect(tabsCreateCalls).toHaveLength(0) // never reached — local clear failed first
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

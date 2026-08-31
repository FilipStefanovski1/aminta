// End-to-end regression coverage for the "Sign out failed. Try again." bug
// and its relationship to the account-isolation fix: drives the REAL
// lib/auth.ts (signOutEverywhere/clearAuthSession/setAuthSession), REAL
// lib/storage.ts, REAL lib/sync.ts, and REAL lib/accountScope.ts together —
// only the network `fetch` is mocked. Exercises the exact sequence the UI
// triggers: Settings "Sign out" -> signOutEverywhere() -> (on success) the
// storage listener's handleAuthUserChanged(prev, null) -> a later sign-in
// as a different account.
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
      remove: (keys: string[]) => {
        for (const k of keys) delete memoryStore[k]
        return Promise.resolve()
      },
    },
  },
})

import { getAuthSession, setAuthSession, signOutEverywhere } from "~lib/auth"
import { getStore } from "~lib/storage"
import { handleAuthUserChanged } from "~lib/accountScope"

const SESSION_A = { accessToken: "at-a", refreshToken: "rt-a", userId: "uuid-a", email: "a@x.com" }
const SESSION_B = { accessToken: "at-b", refreshToken: "rt-b", userId: "uuid-b", email: "b@x.com" }

function cloudResponse(overrides: Record<string, unknown>) {
  return {
    status: 200, ok: true,
    json: async () => ({
      xp: 0, plan: "free", ai_included_paid: false, x_connected: false,
      voice_profile: null, tweet_dna: [], ...overrides,
    }),
  } as Response
}

beforeEach(() => {
  memoryStore = {}
  vi.stubGlobal("fetch", vi.fn())
})

describe("1. normal authenticated sign out", () => {
  it("succeeds and clears the active local auth session", async () => {
    await setAuthSession(SESSION_A)
    vi.mocked(fetch).mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) } as Response)

    const result = await signOutEverywhere()

    expect(result.ok).toBe(true)
    expect(await getAuthSession()).toBeNull()
  })
})

describe("2 & 3. expired session / invalid or missing refresh token", () => {
  it("an expired-session response (401) from the logout endpoint still lets local sign-out succeed", async () => {
    await setAuthSession(SESSION_A)
    vi.mocked(fetch).mockResolvedValue({ status: 401, ok: false, json: async () => ({ error: "invalid" }) } as Response)

    const result = await signOutEverywhere()

    expect(result.ok).toBe(true) // not trapped
    expect(await getAuthSession()).toBeNull()
  })

  it("no session at all (already logged out) is a trivial success, never an error", async () => {
    const result = await signOutEverywhere()
    expect(result.ok).toBe(true)
  })
})

describe("4. optional sync cleanup failure does not leave the old account rendered", () => {
  it("even if a subsequent cloud pull for the NEXT account fails, the previous account's local cache was already cleared", async () => {
    // A was signed in with real progression.
    await setAuthSession(SESSION_A)
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 2175, plan: "pro", ai_included_paid: true }))
    await handleAuthUserChanged(null, "uuid-a")
    expect((await getStore()).xp).toBe(2175)

    // A signs out (auth ended successfully) — local session cleared.
    vi.mocked(fetch).mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) } as Response)
    const signOutResult = await signOutEverywhere()
    expect(signOutResult.ok).toBe(true)

    // The account-scoped cache clear (loggedOut path) happens once the
    // storage listener observes auth_user_id going away — simulated here
    // directly, same as sidepanel.tsx's own listener does.
    await handleAuthUserChanged("uuid-a", null)
    expect((await getStore()).xp).toBe(0) // A's progression is gone from the LOCAL cache

    // Now B signs in, but their OWN cloud pull fails (network/server issue)
    // — this must not resurrect A's cached XP.
    await setAuthSession(SESSION_B)
    vi.mocked(fetch).mockRejectedValue(new Error("network down"))
    await handleAuthUserChanged(null, "uuid-b")
    expect((await getStore()).xp).toBe(0) // still not A's 2175 — never rendered
  })
})

describe("5, 6, 7. full sign-out -> sign-in sequences", () => {
  it("A signs out -> B signs in: B never receives A's XP, plan, or voice", async () => {
    await setAuthSession(SESSION_A)
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 3500, plan: "pro", ai_included_paid: true, voice_profile: { niche: "AI", tone: "", examples: "[]", voiceStyle: "", voiceInspiration: "", customRules: "" } }))
    await handleAuthUserChanged(null, "uuid-a")

    vi.mocked(fetch).mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) } as Response)
    await signOutEverywhere()
    await handleAuthUserChanged("uuid-a", null)

    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 15, plan: "free", ai_included_paid: false }))
    await setAuthSession(SESSION_B)
    await handleAuthUserChanged(null, "uuid-b")

    const b = await getStore()
    expect(b.xp).toBe(15)
    expect(b.plan).toBe("free")
    expect(b.aiIncludedPaid).toBe(false)
    expect(b.voice).toBeNull()
  })

  it("A signs out -> A signs back in: A's own progression returns intact (no data loss)", async () => {
    await setAuthSession(SESSION_A)
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 2175 }))
    await handleAuthUserChanged(null, "uuid-a")

    vi.mocked(fetch).mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) } as Response)
    await signOutEverywhere()
    await handleAuthUserChanged("uuid-a", null)
    expect((await getStore()).xp).toBe(0) // cleared locally, NOT deleted server-side

    await setAuthSession(SESSION_A) // A signs back in
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 2175 })) // the real, persisted cloud row
    await handleAuthUserChanged(null, "uuid-a")
    expect((await getStore()).xp).toBe(2175) // restored
  })

  it("7. sign-out itself never deletes account-owned progression/training — only local cache is reset, the cloud row is untouched", async () => {
    await setAuthSession(SESSION_A)
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 900, tweet_dna: ["a real learned tweet"] }))
    await handleAuthUserChanged(null, "uuid-a")

    vi.mocked(fetch).mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) } as Response)
    const signOutFetchCalls = vi.mocked(fetch).mock.calls.length
    await signOutEverywhere()

    // signOutEverywhere only ever calls the logout endpoint — never a
    // delete-account or data-wipe endpoint.
    const calledUrls = vi.mocked(fetch).mock.calls.slice(signOutFetchCalls).map((c) => c[0])
    expect(calledUrls.every((u) => String(u).includes("/api/auth/logout"))).toBe(true)
  })
})

describe("8. sign-out does not touch the X connection", () => {
  it("signOutEverywhere never calls any X-connection endpoint", async () => {
    await setAuthSession(SESSION_A)
    vi.mocked(fetch).mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) } as Response)

    await signOutEverywhere()

    const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes("/x/"))).toBe(false)
  })

  it("a full sign-out -> sign-in cycle preserves whatever xConnected state the cloud reports for the NEW account, never forcing it false because of A's sign-out", async () => {
    await setAuthSession(SESSION_A)
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ x_connected: true }))
    await handleAuthUserChanged(null, "uuid-a")
    expect((await getStore()).xConnected).toBe(true)

    vi.mocked(fetch).mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) } as Response)
    await signOutEverywhere()
    await handleAuthUserChanged("uuid-a", null)

    await setAuthSession(SESSION_B)
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ x_connected: true }))
    await handleAuthUserChanged(null, "uuid-b")
    expect((await getStore()).xConnected).toBe(true) // B's own real connection state, not forced off
  })
})

// End-to-end regression test for the cross-account XP/level/entitlement leak
// — drives the REAL lib/storage.ts, lib/sync.ts, and lib/accountScope.ts
// together (only `~lib/auth`'s getAuthSession and the network `fetch` are
// mocked), reproducing the reported bug's exact scenario: Account A reaches
// Level 4, switches to Account B, and B must never inherit A's progression,
// voice, streak, or Pro entitlement.
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
        // getStore() calls chrome.storage.local.get(DEFAULTS) — an object of
        // defaults, whose keys ARE the keys to read, real chrome semantics.
        const defaults = keys as Record<string, unknown>
        const out: Record<string, unknown> = { ...defaults }
        for (const k of Object.keys(defaults)) if (k in memoryStore) out[k] = memoryStore[k]
        return Promise.resolve(out)
      },
      set: (patch: Record<string, unknown>) => {
        memoryStore = { ...memoryStore, ...patch }
        return Promise.resolve()
      },
      remove: (keys: string | string[]) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) delete memoryStore[k]
        return Promise.resolve()
      },
    },
  },
})

vi.mock("~lib/auth", () => ({
  getAuthSession: vi.fn(),
  refreshAuthSession: vi.fn(),
}))

import { getAuthSession } from "~lib/auth"
import { getStore } from "~lib/storage"
import { handleAuthUserChanged } from "~lib/accountScope"

const mockGetAuthSession = vi.mocked(getAuthSession)

function cloudResponse(overrides: Record<string, unknown>) {
  return {
    status: 200,
    ok: true,
    json: async () => ({
      xp: 0, generations_total: 0, earned_hashes: [], streak: 0, streak_date: "",
      plan: "free", subscription_status: null, ai_included: true, ai_included_paid: false,
      voice_profile: null, style_profile: null, tweet_dna: [],
      ...overrides,
    }),
  } as Response
}

beforeEach(() => {
  memoryStore = {}
  mockGetAuthSession.mockReset()
  vi.stubGlobal("fetch", vi.fn())
})

describe("the exact reported reproduction: Account A Level 4 -> switch to Account B", () => {
  it("Account B never inherits Account A's XP/level after switching", async () => {
    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-a", refreshToken: "r", userId: "uuid-a", email: "a@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 2175, plan: "pro", ai_included_paid: true }))
    await handleAuthUserChanged(null, "uuid-a")

    const afterA = await getStore()
    expect(afterA.xp).toBe(2175) // Level 4 territory (1400-2300 XP)
    expect(afterA.plan).toBe("pro")

    // Switch to a brand-new Account B with low/no XP.
    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-b", refreshToken: "r", userId: "uuid-b", email: "b@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 40, plan: "free", ai_included_paid: false }))
    await handleAuthUserChanged("uuid-a", "uuid-b")

    const afterB = await getStore()
    expect(afterB.xp).toBe(40) // B's own real XP — NOT A's 2175
    expect(afterB.xp).not.toBe(afterA.xp)
  })

  it("a Pro user (A) switching to a Free user (B) never leaves B appearing Pro", async () => {
    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-a", refreshToken: "r", userId: "uuid-a", email: "a@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 5000, plan: "pro", ai_included_paid: true }))
    await handleAuthUserChanged(null, "uuid-a")
    expect((await getStore()).aiIncludedPaid).toBe(true)

    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-b", refreshToken: "r", userId: "uuid-b", email: "b@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 0, plan: "free", ai_included_paid: false }))
    await handleAuthUserChanged("uuid-a", "uuid-b")

    const b = await getStore()
    expect(b.plan).toBe("free")
    expect(b.aiIncludedPaid).toBe(false)
  })

  it("voice profile, streak, and tweetDNA do not leak from A to B", async () => {
    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-a", refreshToken: "r", userId: "uuid-a", email: "a@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({
      xp: 900, streak: 12, streak_date: "2026-08-30",
      voice_profile: { niche: "AI", tone: "direct", examples: "[]", voiceStyle: "direct", voiceInspiration: "", customRules: "" },
      tweet_dna: ["a real tweet from account A", "another one"],
    }))
    await handleAuthUserChanged(null, "uuid-a")
    const a = await getStore()
    expect(a.voice?.niche).toBe("AI")
    expect(a.tweetDNA).toHaveLength(2)
    expect(a.streak).toBe(12)

    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-b", refreshToken: "r", userId: "uuid-b", email: "b@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 0, streak: 0, streak_date: "" }))
    await handleAuthUserChanged("uuid-a", "uuid-b")

    const b = await getStore()
    expect(b.voice).toBeNull()
    expect(b.tweetDNA).toEqual([])
    expect(b.streak).toBe(0)
  })

  it("switching back to A restores A's real progression — no permanent data loss", async () => {
    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-a", refreshToken: "r", userId: "uuid-a", email: "a@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 2175 }))
    await handleAuthUserChanged(null, "uuid-a")

    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-b", refreshToken: "r", userId: "uuid-b", email: "b@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 10 }))
    await handleAuthUserChanged("uuid-a", "uuid-b")
    expect((await getStore()).xp).toBe(10)

    // Back to A — the cloud row (never touched by the local clear) is the
    // source of truth, so A's real total returns intact.
    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-a", refreshToken: "r", userId: "uuid-a", email: "a@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 2175 }))
    await handleAuthUserChanged("uuid-b", "uuid-a")
    expect((await getStore()).xp).toBe(2175)
  })

  it("a new account with no server-side state row (404-ish empty response) never inherits A's cached XP", async () => {
    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-a", refreshToken: "r", userId: "uuid-a", email: "a@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({ xp: 2175 }))
    await handleAuthUserChanged(null, "uuid-a")

    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-c", refreshToken: "r", userId: "uuid-c", email: "c@x.com" })
    // Server has literally nothing for this brand-new user yet.
    vi.mocked(fetch).mockResolvedValue({ status: 200, ok: true, json: async () => ({}) } as Response)
    await handleAuthUserChanged("uuid-a", "uuid-c")

    expect((await getStore()).xp).toBe(0) // cleared defaults, not A's 2175
  })

  // The exact reported reproduction, with the exact numbers from the bug
  // report: Account A at Level 4 (2175 XP => 775/900 into the level, per
  // lib/evolution.ts's thresholds), 1-day streak — switching to a genuinely
  // barely-used Free account B must show B's real base state, not A's.
  it("Account A at Level 4 (2175 XP, 1-day streak) -> Account B (Free, barely used): B renders its own real base state, never A's", async () => {
    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-a", refreshToken: "r", userId: "uuid-a", email: "a@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({
      xp: 2175, streak: 1, streak_date: "2026-08-31", plan: "pro", ai_included_paid: true,
    }))
    await handleAuthUserChanged(null, "uuid-a")
    const afterA = await getStore()
    expect(afterA.xp).toBe(2175) // Level 4 territory (1400-2300)
    expect(afterA.streak).toBe(1)
    expect(afterA.plan).toBe("pro")

    mockGetAuthSession.mockResolvedValue({ accessToken: "tok-b", refreshToken: "r", userId: "uuid-b", email: "b@x.com" })
    vi.mocked(fetch).mockResolvedValue(cloudResponse({
      xp: 0, streak: 0, streak_date: "", plan: "free", ai_included_paid: false,
    }))
    await handleAuthUserChanged("uuid-a", "uuid-b")

    const b = await getStore()
    expect(b.xp).toBe(0) // NOT 2175 — B is genuinely barely used
    expect(b.streak).toBe(0) // NOT A's 1-day streak
    expect(b.plan).toBe("free") // Free stays Free — no leaked Pro entitlement
    expect(b.aiIncludedPaid).toBe(false)
  })
})

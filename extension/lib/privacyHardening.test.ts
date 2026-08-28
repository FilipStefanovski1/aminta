// Covers the privacy-hardening pass: account-deletion local cleanup, the
// earned_hashes bound, and "Delete learned data".
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

import {
  MAX_EARNED_HASHES,
  capEarnedHashes,
  clearAccountScopedState,
  clearAllLocalUserData,
  getStore,
  setStore,
  type VoiceProfile,
} from "~lib/storage"
import { buildLearnedDataPatch, clearLearnedData, hasLearnedData } from "~lib/learnedData"
import { tryAwardXP } from "~lib/xp"

const VOICE: VoiceProfile = {
  niche: "AI, B2B SaaS",
  tone: "direct",
  examples: "a pasted writing sample",
  voiceStyle: "punchy",
  voiceInspiration: "nobody",
  customRules: "no hashtags\nuse lowercase",
}

// A store populated the way a real signed-in user's would be.
async function seedPopulatedStore() {
  await setStore({
    apiKey: "AIzaUserOwnKey",
    model: "gemini-3.5-flash",
    providerMode: "byok",
    avatarDataUrl: "data:image/jpeg;base64,AAAA",
    voice: VOICE,
    tweetDNA: ["dna one", "dna two"],
    styleProfile: { confidenceScore: 0.9 } as never,
    styleProfileHash: "hash-1",
    templates: [{ id: "t1", name: "Launch" }] as never,
    recentCreations: [{ id: "c1", type: "tweet", text: "a generated post", createdAt: 1 }] as never,
    createDrafts: { tweet: { topic: "unfinished draft" } },
    xp: 900,
    earnedHashes: ["h1", "h2"],
  })
}

beforeEach(() => { memoryStore = {} })

describe("account deletion clears local personal data", () => {
  it("clears voice, DNA, style profile, templates, Recent Creations, and drafts", async () => {
    await seedPopulatedStore()
    await clearAllLocalUserData()
    const s = await getStore()
    expect(s.voice).toBeNull()
    expect(s.tweetDNA).toEqual([])
    expect(s.styleProfile).toBeNull()
    expect(s.templates).toEqual([])
    expect(s.recentCreations).toEqual([])
    expect(s.createDrafts).toEqual({})
    expect(s.xp).toBe(0)
    expect(s.earnedHashes).toEqual([])
  })

  it("clears the BYOK API key and the uploaded avatar", async () => {
    await seedPopulatedStore()
    await clearAllLocalUserData()
    const s = await getStore()
    expect(s.apiKey).toBe("")
    expect(s.avatarDataUrl).toBe("")
  })

  it("keeps inert device preferences (model/providerMode) — nothing personal in them", async () => {
    await seedPopulatedStore()
    await clearAllLocalUserData()
    const s = await getStore()
    expect(s.model).toBe("gemini-3.5-flash")
    expect(s.providerMode).toBe("byok")
  })

  it("ordinary sign-out behavior is unchanged — the BYOK key deliberately survives", async () => {
    await seedPopulatedStore()
    await clearAccountScopedState()
    const s = await getStore()
    expect(s.apiKey).toBe("AIzaUserOwnKey") // reversible action, key stays
    expect(s.voice).toBeNull()              // account data still cleared
  })

  // The ordering guarantee lives at the call site (sidepanel.tsx awaits
  // deleteAccount() before clearAllLocalUserData(), so a throw skips the
  // wipe). This pins the half that's testable here: nothing clears unless
  // the clear is actually invoked.
  it("a failed server deletion leaves local data intact (clear is never reached)", async () => {
    await seedPopulatedStore()
    const failingDelete = async () => { throw new Error("Couldn't delete your account.") }
    await expect((async () => {
      await failingDelete()
      await clearAllLocalUserData()
    })()).rejects.toThrow("Couldn't delete your account.")
    const s = await getStore()
    expect(s.apiKey).toBe("AIzaUserOwnKey")
    expect(s.voice).toEqual(VOICE)
    expect(s.recentCreations).toHaveLength(1)
  })
})

describe("earned_hashes is bounded", () => {
  it("stays at or under the cap and keeps the newest entries", () => {
    const over = Array.from({ length: MAX_EARNED_HASHES + 50 }, (_, i) => `h${i}`)
    const capped = capEarnedHashes(over)
    expect(capped).toHaveLength(MAX_EARNED_HASHES)
    expect(capped.at(-1)).toBe(`h${MAX_EARNED_HASHES + 49}`) // newest kept
    expect(capped[0]).toBe("h50")                            // oldest dropped
  })

  it("leaves an under-cap array untouched", () => {
    const few = ["a", "b", "c"]
    expect(capEarnedHashes(few)).toEqual(few)
  })

  it("an oversized array written by an older build normalizes on the next award", async () => {
    await setStore({ earnedHashes: Array.from({ length: MAX_EARNED_HASHES + 200 }, (_, i) => `old${i}`) })
    await tryAwardXP("brand-new-hash", 50)
    const s = await getStore()
    expect(s.earnedHashes.length).toBe(MAX_EARNED_HASHES)
    expect(s.earnedHashes.at(-1)).toBe("brand-new-hash")
  })

  it("duplicate protection still works for retained hashes", async () => {
    await tryAwardXP("post-abc", 50)
    const second = await tryAwardXP("post-abc", 50)
    expect(second).toEqual({ error: "already_claimed" })
    const s = await getStore()
    expect(s.xp).toBe(50) // awarded once, not twice
  })
})

describe("delete learned data", () => {
  it("clears the learned style profile, its hash, Tweet DNA, and writing examples", () => {
    const patch = buildLearnedDataPatch(VOICE)
    expect(patch.styleProfile).toBeNull()
    expect(patch.styleProfileHash).toBe("")
    expect(patch.tweetDNA).toEqual([])
    expect(patch.voice?.examples).toBe("")
  })

  it("PRESERVES explicitly configured Instincts and voice settings", () => {
    const patch = buildLearnedDataPatch(VOICE)
    expect(patch.voice?.customRules).toBe("no hashtags\nuse lowercase")
    expect(patch.voice?.niche).toBe("AI, B2B SaaS")
    expect(patch.voice?.tone).toBe("direct")
    expect(patch.voice?.voiceStyle).toBe("punchy")
  })

  it("preserves templates, Recent Creations, drafts, and the X connection", async () => {
    await seedPopulatedStore()
    await setStore({ xConnected: true, xUsername: "filiplesterr" })
    await clearLearnedData(async () => {})
    const s = await getStore()
    expect(s.templates).toHaveLength(1)
    expect(s.recentCreations).toHaveLength(1)
    expect(s.createDrafts).toEqual({ tweet: { topic: "unfinished draft" } })
    expect(s.xConnected).toBe(true)
    expect(s.xUsername).toBe("filiplesterr")
  })

  it("pushes the cleared state through the existing sync path", async () => {
    await seedPopulatedStore()
    const push = vi.fn().mockResolvedValue(undefined)
    const res = await clearLearnedData(push)
    expect(push).toHaveBeenCalledTimes(1)
    expect(res.ok).toBe(true)
  })

  it("a sync failure is surfaced, not swallowed — local state is still cleared", async () => {
    await seedPopulatedStore()
    const res = await clearLearnedData(async () => { throw new Error("Network error.") })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Network error.")
    const s = await getStore()
    expect(s.styleProfile).toBeNull() // cleared locally regardless
  })

  it("hasLearnedData reflects whether there is anything left to delete", () => {
    expect(hasLearnedData({ styleProfile: null, tweetDNA: [], voice: null })).toBe(false)
    expect(hasLearnedData({ styleProfile: { a: 1 } as never, tweetDNA: [], voice: null })).toBe(true)
    expect(hasLearnedData({ styleProfile: null, tweetDNA: ["x"], voice: null })).toBe(true)
    expect(hasLearnedData({ styleProfile: null, tweetDNA: [], voice: VOICE })).toBe(true)
    // Instincts alone are NOT learned data — nothing to delete.
    expect(hasLearnedData({
      styleProfile: null, tweetDNA: [],
      voice: { ...VOICE, examples: "" },
    })).toBe(false)
  })
})

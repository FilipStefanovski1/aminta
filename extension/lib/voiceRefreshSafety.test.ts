// A failed Voice Refresh must never leave the user worse off than before.
//
// parseStyleProfile() never throws — malformed model output yields a NEUTRAL
// DEFAULT profile. Installing that would silently replace a good DNA profile
// with something blander than what the user already had, which is the worst
// possible outcome of a failed refresh. isEmptyProfile() is the guard, and
// these tests pin it.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("~lib/auth", () => ({
  getAuthSession: vi.fn().mockResolvedValue({ accessToken: "t", refreshToken: "r", userId: "u", email: "e" }),
  refreshAuthSession: vi.fn(),
}))
vi.mock("~lib/storage", () => ({
  getStore: vi.fn().mockResolvedValue({ xConnected: true }),
  setStore: vi.fn().mockResolvedValue(undefined),
}))

import { setStore } from "~lib/storage"
import { isEmptyProfile, runVoiceRefresh } from "~lib/voiceRefresh"
import { isXHistorySourced, parseStyleProfile } from "~lib/styleProfile"
import type { StyleProfile } from "~lib/storage"

const mockSetStore = vi.mocked(setStore)

const GOOD_JSON = JSON.stringify({
  confidence: "assertive", energy: "high", vocabularyComplexity: "casual",
  capitalization: "lowercase-leaning", directness: "blunt",
  rhythm: "short punchy fragments", punctuation: "dashes over commas",
  emojiUsage: "none", humorStyle: "dry deadpan",
  formattingPreferences: "blank lines between ideas",
  rhetoricalDevices: "contrast pairs", cadence: "builds to a punchline",
})

function res(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response
}
const okBody = (profileJson: string, posts = 18) => ({
  profileJson, postsAnalyzed: posts,
  refreshes: { remaining: 3, allowance: 4, periodEnd: "2026-09-01T00:00:00.000Z" },
})

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

describe("isEmptyProfile", () => {
  it("flags the neutral default parseStyleProfile returns on bad JSON", () => {
    expect(isEmptyProfile(parseStyleProfile("not json at all", 1))).toBe(true)
  })

  it("does not flag a real profile", () => {
    expect(isEmptyProfile(parseStyleProfile(GOOD_JSON, 1))).toBe(false)
  })

  it("flags a profile whose descriptive fields are all blank", () => {
    const blank = { ...parseStyleProfile(GOOD_JSON, 1), rhythm: "", punctuation: "", emojiUsage: "",
      humorStyle: "", formattingPreferences: "", rhetoricalDevices: "", cadence: "" } as StyleProfile
    expect(isEmptyProfile(blank)).toBe(true)
  })
})

describe("a successful refresh installs the new profile", () => {
  it("writes the profile and the new allowance", async () => {
    vi.mocked(global.fetch).mockResolvedValue(res(200, okBody(GOOD_JSON)))
    const r = await runVoiceRefresh()
    expect(r.postsAnalyzed).toBe(18)
    expect(r.remaining).toBe(3)
    const patch = mockSetStore.mock.calls[0][0]
    expect(patch.styleProfile).toBeTruthy()
    expect(patch.voiceRefreshRemaining).toBe(3)
    expect(patch.lastVoiceRefreshAt).toBeTruthy()
  })

  it("consumes exactly one refresh (4 -> 3), reported by the server", async () => {
    vi.mocked(global.fetch).mockResolvedValue(res(200, okBody(GOOD_JSON)))
    const r = await runVoiceRefresh()
    expect(r.allowance - r.remaining).toBe(1)
  })
})

describe("failures never overwrite an existing good profile", () => {
  it("malformed Gemini output does not install a neutral profile", async () => {
    vi.mocked(global.fetch).mockResolvedValue(res(200, okBody("<<<not json>>>")))
    await expect(runVoiceRefresh()).rejects.toThrow(/existing profile was kept/i)
    expect(mockSetStore).not.toHaveBeenCalled()
  })

  it("a Gemini/extraction failure writes nothing", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      res(502, { error: "Couldn't analyze your posts right now. Please try again.", code: "EXTRACTION_FAILED" })
    )
    await expect(runVoiceRefresh()).rejects.toThrow()
    expect(mockSetStore).not.toHaveBeenCalled()
  })

  it("an insufficient corpus writes nothing", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      res(422, { error: "Not enough recent original posts to learn from — Aminta needs at least 8.", code: "INSUFFICIENT_POSTS" })
    )
    await expect(runVoiceRefresh()).rejects.toThrow(/at least 8/)
    expect(mockSetStore).not.toHaveBeenCalled()
  })

  it("an exhausted allowance writes nothing", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      res(403, { error: "You've used all your Voice Refreshes for this period.", code: "NO_REFRESHES_LEFT" })
    )
    await expect(runVoiceRefresh()).rejects.toThrow()
    expect(mockSetStore).not.toHaveBeenCalled()
  })

  it("expired X authorization surfaces a reconnect-shaped message", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      // 409, not 401 — a 401 would be consumed by authedFetch's session-refresh retry.
      res(409, { error: "Your X authorization expired. Please reconnect.", code: "X_REAUTH_REQUIRED" })
    )
    await expect(runVoiceRefresh()).rejects.toThrow(/reconnect/i)
    expect(mockSetStore).not.toHaveBeenCalled()
  })

  it("an X outage writes nothing", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      res(502, { error: "Couldn't reach X right now. Please try again.", code: "X_UNAVAILABLE" })
    )
    await expect(runVoiceRefresh()).rejects.toThrow()
    expect(mockSetStore).not.toHaveBeenCalled()
  })
})

describe("P0 — the written hash is recognized as X-sourced by the real precedence check", () => {
  // voiceRefresh.ts and styleProfile.ts must agree on the same convention —
  // this imports the REAL isXHistorySourced (only ~lib/auth and
  // ~lib/storage are mocked in this file), so a drift between the two
  // (e.g. someone changing one file's prefix string without the other)
  // fails here rather than silently reintroducing the P0 bug.
  it("the hash runVoiceRefresh() persists is recognized as X-sourced", async () => {
    vi.mocked(global.fetch).mockResolvedValue(res(200, okBody(GOOD_JSON)))
    await runVoiceRefresh()
    const patch = mockSetStore.mock.calls[0][0] as { styleProfileHash: string }
    expect(isXHistorySourced(patch.styleProfileHash)).toBe(true)
  })
})

describe("credits are never touched", () => {
  it("a refresh writes no credit fields", async () => {
    vi.mocked(global.fetch).mockResolvedValue(res(200, okBody(GOOD_JSON)))
    await runVoiceRefresh()
    const patch = mockSetStore.mock.calls[0][0] as Record<string, unknown>
    expect(patch).not.toHaveProperty("creditsBalance")
    expect(patch).not.toHaveProperty("creditsAllowance")
  })
})

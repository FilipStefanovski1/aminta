import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("~lib/auth", () => ({
  getAuthSession: vi.fn(),
  refreshAuthSession: vi.fn(),
}))
vi.mock("~lib/deviceId", () => ({
  getDeviceId: vi.fn().mockResolvedValue("device-123"),
}))
vi.mock("~lib/ai", () => ({
  generate: vi.fn().mockResolvedValue("byok text"),
  generateFromImage: vi.fn().mockResolvedValue("byok image text"),
}))

import { getAuthSession, refreshAuthSession } from "~lib/auth"
import { getDeviceId } from "~lib/deviceId"
import { generate as runAI, generateFromImage } from "~lib/ai"
import { backendGenerate, dispatchGenerate, runThreadGenerate, THREAD_DEADLINE_MS, THREAD_MAX_OUTPUT_TOKENS } from "~lib/backendGenerate"
import type { AmintaStore } from "~lib/storage"

const mockGetAuthSession = vi.mocked(getAuthSession)
const mockRefreshAuthSession = vi.mocked(refreshAuthSession)
const mockGetDeviceId = vi.mocked(getDeviceId)
const mockRunAI = vi.mocked(runAI)
const mockGenerateFromImage = vi.mocked(generateFromImage)

const SESSION = { accessToken: "token-1", refreshToken: "r1", userId: "u1", email: "a@b.com" }

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response
}

const baseStore: Partial<AmintaStore> = {
  apiKey: "",
  model: "gemini-3.5-flash",
  plan: null,
  subscriptionStatus: null,
  aiIncluded: false,
  providerMode: "included",
}

describe("backendGenerate", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetAuthSession.mockReset()
    mockRefreshAuthSession.mockReset()
    mockGetDeviceId.mockReset().mockResolvedValue("device-123")
    mockRunAI.mockReset().mockResolvedValue("byok text")
    mockGenerateFromImage.mockReset().mockResolvedValue("byok image text")
    vi.stubGlobal("fetch", vi.fn())
    vi.stubGlobal("crypto", { randomUUID: () => "req-uuid-1" })
  })

  it("throws if no auth session exists", async () => {
    mockGetAuthSession.mockResolvedValue(null)
    await expect(
      backendGenerate({ generationMode: "tweet", input: "hi", voice: {} as any, styleProfile: null, tone: "direct", length: "medium" })
    ).rejects.toThrow("Sign in required.")
  })

  it("sends the expected request shape and returns text on success", async () => {
    mockGetAuthSession.mockResolvedValue(SESSION)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse(200, { text: "generated text" }))

    const result = await backendGenerate({
      generationMode: "tweet",
      input: "topic",
      voice: {} as any,
      styleProfile: null,
      tone: "witty",
      length: "short",
    })

    expect(result).toBe("generated text")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://amintaapp.com/api/generate")
    expect(init?.method).toBe("POST")
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token-1")
    expect((init?.headers as Record<string, string>)["X-Aminta-Device-Id"]).toBe("device-123")
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({
      requestId: "req-uuid-1",
      generationMode: "tweet",
      input: "topic",
      tone: "witty",
      length: "short",
    })
  })

  it("retries once on a 401 using a refreshed session, reusing the same requestId", async () => {
    mockGetAuthSession.mockResolvedValue(SESSION)
    mockRefreshAuthSession.mockResolvedValue({ ...SESSION, accessToken: "token-2" })
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { text: "ok after refresh" }))

    const result = await backendGenerate({
      generationMode: "tweet",
      input: "topic",
      voice: {} as any,
      styleProfile: null,
      tone: "direct",
      length: "medium",
    })

    expect(result).toBe("ok after refresh")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
    expect(secondBody.requestId).toBe(firstBody.requestId)
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe("Bearer token-2")
  })

  it("throws when refresh fails after a 401", async () => {
    mockGetAuthSession.mockResolvedValue(SESSION)
    mockRefreshAuthSession.mockResolvedValue(null)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "expired" }))

    await expect(
      backendGenerate({ generationMode: "tweet", input: "hi", voice: {} as any, styleProfile: null, tone: "direct", length: "medium" })
    ).rejects.toThrow("Session expired. Please sign in again.")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("throws the server's error message on a non-2xx response", async () => {
    mockGetAuthSession.mockResolvedValue(SESSION)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse(429, { error: "Rate limited, try again shortly.", code: "RATE_LIMITED" }))

    await expect(
      backendGenerate({ generationMode: "tweet", input: "hi", voice: {} as any, styleProfile: null, tone: "direct", length: "medium" })
    ).rejects.toThrow("Rate limited, try again shortly.")
  })

  it("throws on a network failure", async () => {
    mockGetAuthSession.mockResolvedValue(SESSION)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockRejectedValue(new Error("offline"))

    await expect(
      backendGenerate({ generationMode: "tweet", input: "hi", voice: {} as any, styleProfile: null, tone: "direct", length: "medium" })
    ).rejects.toThrow("Network error. Check your internet connection.")
  })
})

describe("dispatchGenerate", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetAuthSession.mockReset()
    mockGetDeviceId.mockReset().mockResolvedValue("device-123")
    mockRunAI.mockReset().mockResolvedValue("byok text")
    mockGenerateFromImage.mockReset().mockResolvedValue("byok image text")
    vi.stubGlobal("fetch", vi.fn())
    vi.stubGlobal("crypto", { randomUUID: () => "req-uuid-2" })
  })

  it("routes non-included (Pro/Founder BYOK) users through generate() unchanged", async () => {
    const store = { ...baseStore, apiKey: "AIzaSomeKey", plan: "pro", subscriptionStatus: "active", aiIncluded: false } as AmintaStore
    const text = await dispatchGenerate(store, {
      generationMode: "tweet",
      input: "topic",
      voice: {} as any,
      styleProfile: null,
      tone: "direct",
      length: "medium",
    })
    expect(text).toBe("byok text")
    expect(mockRunAI).toHaveBeenCalledWith(
      "AIzaSomeKey", "gemini-3.5-flash", expect.any(Array),
      { structuredText: true, generationType: "tweet" }
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  // Security-critical: BYOK is Pro/Founder only (lib/entitlements.ts's
  // canUseByok()) — a Free user's stored key, however it got there, must
  // never reach a provider call. Plan entitlement wins over presence of a
  // key. See extension/lib/entitlements.test.ts for the effectiveApiKey()
  // unit coverage this call site relies on.
  it("Free plan + a stale/manually-set BYOK key: the key is NEVER passed to generate()", async () => {
    const store = { ...baseStore, apiKey: "AIzaSomeStaleKey", plan: "free", subscriptionStatus: null, aiIncluded: false } as AmintaStore
    await dispatchGenerate(store, {
      generationMode: "tweet",
      input: "topic",
      voice: {} as any,
      styleProfile: null,
      tone: "direct",
      length: "medium",
    })
    expect(mockRunAI).toHaveBeenCalledWith(
      "", "gemini-3.5-flash", expect.any(Array),
      { structuredText: true, generationType: "tweet" }
    )
  })

  it("routes aiIncluded=true (Pro/Founder) users through the backend even with no apiKey set", async () => {
    mockGetAuthSession.mockResolvedValue(SESSION)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse(200, { text: "backend text" }))

    const store = { ...baseStore, apiKey: "", plan: "pro", subscriptionStatus: "active", aiIncluded: true } as AmintaStore
    const text = await dispatchGenerate(store, {
      generationMode: "tweet",
      input: "topic",
      voice: {} as any,
      styleProfile: null,
      tone: "direct",
      length: "medium",
    })

    expect(text).toBe("backend text")
    expect(mockRunAI).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The exact scenario the client-entitlement-mismatch audit finding was
  // about: plan stays 'free' server-side for gifted access (see
  // landing/supabase-setup.sql section 9's ai_included_override), so
  // storeHasProAccess()-based routing would incorrectly keep this user on
  // BYOK forever even though the backend authorizes them. aiIncluded is the
  // one field that carries that override to the client.
  it("routes gifted users (plan=free, aiIncluded=true from ai_included_override) through the backend", async () => {
    mockGetAuthSession.mockResolvedValue(SESSION)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse(200, { text: "backend text" }))

    const store = { ...baseStore, apiKey: "", plan: "free", subscriptionStatus: null, aiIncluded: true } as AmintaStore
    const text = await dispatchGenerate(store, {
      generationMode: "tweet",
      input: "topic",
      voice: {} as any,
      styleProfile: null,
      tone: "direct",
      length: "medium",
    })

    expect(text).toBe("backend text")
    expect(mockRunAI).not.toHaveBeenCalled()
  })

  // providerMode is the scaffold for a future "Use my own API key" toggle
  // for aiIncluded users — dispatchGenerate must already honor it today,
  // with no wiring changes needed once a settings UI exists to set it.
  it("routes aiIncluded=true users back to BYOK when providerMode is explicitly 'byok'", async () => {
    const store = { ...baseStore, apiKey: "AIzaSomeKey", plan: "pro", subscriptionStatus: "active", aiIncluded: true, providerMode: "byok" } as AmintaStore
    const text = await dispatchGenerate(store, {
      generationMode: "tweet",
      input: "topic",
      voice: {} as any,
      styleProfile: null,
      tone: "direct",
      length: "medium",
    })
    expect(text).toBe("byok text")
    expect(mockRunAI).toHaveBeenCalledWith(
      "AIzaSomeKey", "gemini-3.5-flash", expect.any(Array),
      { structuredText: true, generationType: "tweet" }
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it("routes non-included users with images through generateFromImage", async () => {
    const store = { ...baseStore, apiKey: "AIzaSomeKey", plan: "pro", subscriptionStatus: "active", aiIncluded: false } as AmintaStore
    const text = await dispatchGenerate(store, {
      generationMode: "reply",
      input: "topic",
      voice: {} as any,
      styleProfile: null,
      tone: "direct",
      length: "medium",
      images: ["data:image/jpeg;base64,abc"],
    })
    expect(text).toBe("byok image text")
    expect(mockGenerateFromImage).toHaveBeenCalledWith(
      "AIzaSomeKey", "gemini-3.5-flash", expect.any(Array), ["data:image/jpeg;base64,abc"],
      { structuredText: true, generationType: "reply" }
    )
  })
})

// Regression coverage for the live-QA failure: "Couldn't generate distinct
// threads" on a plain sparse topic ("solana summit serbia") turned out to
// be a token-budget bug (the shared 400-token default silently truncating
// Thread Creator's 3-option JSON once posts were asked to be developed),
// not a distinctness rejection — there is no distinctness check anywhere
// in this pipeline. These tests guard the actual fix: BYOK thread calls
// request a real output budget instead of the tweet/reply/polish default.
describe("runThreadGenerate — token/deadline budget", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockRunAI.mockReset().mockResolvedValue(JSON.stringify({
      threads: [
        { angle: "Personal anticipation", posts: ["Heading to the summit next week, ngl a little nervous.", "Never been to one of these in person before."] },
        { angle: "Ecosystem observation", posts: ["Something's shifting with builders in this region.", "Worth paying attention to before it's obvious."] },
      ],
    }))
  })

  const store = { apiKey: "AIzaSomeKey", model: "gemini-3.5-flash", plan: "pro", subscriptionStatus: "active", aiIncluded: false, providerMode: "included" } as any

  it("BYOK thread generation requests a real output budget, not the 400-token default", async () => {
    await runThreadGenerate(store, { input: "solana summit serbia", voice: {} as any, styleProfile: null, tone: "direct", length: "medium", postCount: 2 })

    expect(mockRunAI).toHaveBeenCalledTimes(1)
    const [, , , options] = mockRunAI.mock.calls[0]
    expect(options).toMatchObject({
      generationType: "thread",
      maxOutputTokens: THREAD_MAX_OUTPUT_TOKENS,
      totalDeadlineMs: THREAD_DEADLINE_MS,
    })
  })

  it("the thread token budget is comfortably above what the shared single-post default would allow", () => {
    // The bug this regresses: a single fixed 400-token cap applied to a
    // 3-option, Medium-depth thread response. This asserts the fix chose a
    // real, materially larger budget — not just a token bump that still
    // wouldn't fit 3 developed threads.
    expect(THREAD_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(1500)
  })

  it("the thread deadline is longer than the interactive single-post default (15s), since ~2000 tokens takes longer to generate", () => {
    expect(THREAD_DEADLINE_MS).toBeGreaterThan(15_000)
  })

  it("parses the recovered threads normally once the real budget prevents truncation", async () => {
    const threads = await runThreadGenerate(store, { input: "solana summit serbia", voice: {} as any, styleProfile: null, tone: "direct", length: "medium", postCount: 2 })
    expect(threads).toHaveLength(2)
    expect(threads[0].angle).toBe("Personal anticipation")
  })
})

// Posts (how many) is independent from Length (per-post depth) — see
// lib/prompts.ts's threadPostCountGuide/threadPostDepthGuide. Covers both
// generation paths: BYOK (runAI receives the built prompt directly) and
// Included AI (the server receives postCount in the request body and the
// client still enforces the contract client-side as a safety net).
describe("runThreadGenerate — post count (Posts selector)", () => {
  const store = { apiKey: "AIzaSomeKey", model: "gemini-3.5-flash", plan: "pro", subscriptionStatus: "active", aiIncluded: false, providerMode: "included" } as any
  const baseArgs = { input: "cap table", voice: {} as any, styleProfile: null, tone: "direct" as const, length: "medium" as const }

  function threadsResponse(postsPerOption: number, optionCount = 3): string {
    return JSON.stringify({
      threads: Array.from({ length: optionCount }, (_, i) => ({
        angle: `Angle ${i + 1}`,
        posts: Array.from({ length: postsPerOption }, (_, j) => `Option ${i + 1} post ${j + 1}`),
      })),
    })
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    mockRunAI.mockReset()
    mockGetAuthSession.mockReset()
    vi.stubGlobal("fetch", vi.fn())
    vi.stubGlobal("crypto", { randomUUID: () => "req-uuid-thread" })
  })

  it("2 selected: BYOK prompt requires exactly 2 posts, and every option in the result has exactly 2", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(2))
    const threads = await runThreadGenerate(store, { ...baseArgs, postCount: 2 })

    const [, , messages] = mockRunAI.mock.calls[0]
    const system = (messages as { role: string; content: string }[]).find((m) => m.role === "system")!.content
    expect(system).toContain("POST COUNT: write EXACTLY 2 posts")

    expect(threads.length).toBeGreaterThan(0)
    expect(threads.every((t) => t.posts.length === 2)).toBe(true)
  })

  it("3 selected: exactly 3 posts per option", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(3))
    const threads = await runThreadGenerate(store, { ...baseArgs, postCount: 3 })
    expect(threads.every((t) => t.posts.length === 3)).toBe(true)
  })

  it("5 selected: exactly 5 posts per option", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(5))
    const threads = await runThreadGenerate(store, { ...baseArgs, postCount: 5 })
    expect(threads.every((t) => t.posts.length === 5)).toBe(true)
  })

  it("2 selected: a model response that over-generates (e.g. 4 posts) is rejected, never silently trimmed or accepted", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(4))
    const threads = await runThreadGenerate(store, { ...baseArgs, postCount: 2 })
    expect(threads).toHaveLength(0)
  })

  it("6+ selected: prompt asks for a 6-8 range, and a response outside that range (too many or too few) is rejected", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(10))
    const threads = await runThreadGenerate(store, { ...baseArgs, postCount: "6+" })

    const [, , messages] = mockRunAI.mock.calls[0]
    const system = (messages as { role: string; content: string }[]).find((m) => m.role === "system")!.content
    expect(system).toContain("POST COUNT: choose a sensible number of posts between 6 and 8")

    expect(threads).toHaveLength(0)
  })

  it("6+ selected: a response already within 6-8 is left alone (never trimmed below what the model chose)", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(7))
    const threads = await runThreadGenerate(store, { ...baseArgs, postCount: "6+" })
    expect(threads.every((t) => t.posts.length === 7)).toBe(true)
  })

  it("all 3 generated thread options respect the same selected post count", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(3, 3))
    const threads = await runThreadGenerate(store, { ...baseArgs, postCount: 3 })
    expect(threads).toHaveLength(3)
    expect(threads.map((t) => t.posts.length)).toEqual([3, 3, 3])
  })

  it("Medium still controls per-post depth independently of the selected post count", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(3))
    await runThreadGenerate(store, { ...baseArgs, postCount: 3, length: "medium" })
    const [, , messages] = mockRunAI.mock.calls[0]
    const system = (messages as { role: string; content: string }[]).find((m) => m.role === "system")!.content
    expect(system).toContain("PER-POST DEPTH: MEDIUM")
    expect(system).toContain("POST COUNT: write EXACTLY 3 posts")
  })

  it("defaults to 4 posts when no postCount is supplied", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(4))
    await runThreadGenerate(store, baseArgs)
    const [, , messages] = mockRunAI.mock.calls[0]
    const system = (messages as { role: string; content: string }[]).find((m) => m.role === "system")!.content
    expect(system).toContain("POST COUNT: write EXACTLY 4 posts")
  })

  it("BYOK receives the post count: it reaches the actual prompt sent to the provider", async () => {
    mockRunAI.mockResolvedValue(threadsResponse(5))
    await runThreadGenerate(store, { ...baseArgs, postCount: 5 })
    const [, , messages] = mockRunAI.mock.calls[0]
    const system = (messages as { role: string; content: string }[]).find((m) => m.role === "system")!.content
    expect(system).toContain("POST COUNT: write EXACTLY 5 posts")
  })

  it("Included AI receives the post count: it's sent to the server in the request body", async () => {
    mockGetAuthSession.mockResolvedValue(SESSION)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse(200, { text: threadsResponse(3) }))
    const includedStore = { ...store, aiIncluded: true, providerMode: "included" } as any

    await runThreadGenerate(includedStore, { ...baseArgs, postCount: 3 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.postCount).toBe(3)
    expect(mockRunAI).not.toHaveBeenCalled()
  })
})

describe("shouldUseIncludedAi", () => {
  it("is false with no aiIncluded flag regardless of plan", async () => {
    const { shouldUseIncludedAi } = await import("~lib/entitlements")
    expect(shouldUseIncludedAi({ aiIncluded: false, providerMode: "included" })).toBe(false)
  })

  it("is true for aiIncluded users defaulting to included", async () => {
    const { shouldUseIncludedAi } = await import("~lib/entitlements")
    expect(shouldUseIncludedAi({ aiIncluded: true, providerMode: "included" })).toBe(true)
  })

  it("is false for aiIncluded users who explicitly opted into byok", async () => {
    const { shouldUseIncludedAi } = await import("~lib/entitlements")
    expect(shouldUseIncludedAi({ aiIncluded: true, providerMode: "byok" })).toBe(false)
  })
})

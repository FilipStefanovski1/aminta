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
import { backendGenerate, dispatchGenerate } from "~lib/backendGenerate"
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
  model: "gemini-2.0-flash",
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

  it("routes non-aiIncluded (free/BYOK) users through generate() unchanged", async () => {
    const store = { ...baseStore, apiKey: "AIzaSomeKey", plan: "free", subscriptionStatus: null, aiIncluded: false } as AmintaStore
    const text = await dispatchGenerate(store, {
      generationMode: "tweet",
      input: "topic",
      voice: {} as any,
      styleProfile: null,
      tone: "direct",
      length: "medium",
    })
    expect(text).toBe("byok text")
    expect(mockRunAI).toHaveBeenCalledWith("AIzaSomeKey", "gemini-2.0-flash", expect.any(Array))
    expect(fetch).not.toHaveBeenCalled()
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
    expect(mockRunAI).toHaveBeenCalledWith("AIzaSomeKey", "gemini-2.0-flash", expect.any(Array))
    expect(fetch).not.toHaveBeenCalled()
  })

  it("routes non-included users with images through generateFromImage", async () => {
    const store = { ...baseStore, apiKey: "AIzaSomeKey", plan: "free", subscriptionStatus: null, aiIncluded: false } as AmintaStore
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
    expect(mockGenerateFromImage).toHaveBeenCalledWith("AIzaSomeKey", "gemini-2.0-flash", expect.any(Array), ["data:image/jpeg;base64,abc"])
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

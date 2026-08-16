// The panel showed a stale credit balance because nothing refreshed it after
// a generation: store.credits* was written only by pullFromCloud(), which
// runs on panel open / login / account switch, and /api/generate returned
// just { text }.
//
// These tests pin the replacement: the balance shown always comes from the
// server's own post-debit number, and is never derived client-side.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("~lib/auth", () => ({
  getAuthSession: vi.fn().mockResolvedValue({
    accessToken: "t", refreshToken: "r", userId: "u", email: "e",
  }),
  refreshAuthSession: vi.fn(),
}))
vi.mock("~lib/deviceId", () => ({ getDeviceId: vi.fn().mockResolvedValue("dev") }))
vi.mock("~lib/ai", () => ({
  generate: vi.fn().mockResolvedValue("byok text"),
  generateFromImage: vi.fn().mockResolvedValue("byok image"),
}))
vi.mock("~lib/storage", () => ({ setStore: vi.fn().mockResolvedValue(undefined) }))

import { setStore } from "~lib/storage"
import { backendGenerate, dispatchGenerate } from "~lib/backendGenerate"
import type { AmintaStore } from "~lib/storage"

const mockSetStore = vi.mocked(setStore)

function res(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response
}

const ARGS = {
  generationMode: "tweet" as const,
  input: "topic",
  voice: {} as never,
  styleProfile: null,
  tone: "direct" as const,
  length: "short" as const,
}

/** What the store would be patched to, or undefined if nothing was written. */
const written = () => mockSetStore.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

describe("balance comes from the server, on success", () => {
  it("persists the server's balance after a billable generation (1000 -> 999)", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      res(200, { text: "out", credits: { balance: 999, allowance: 1000, periodEnd: "2026-09-01T00:00:00.000Z", planKey: "pro" } })
    )
    await backendGenerate(ARGS)
    expect(written()).toEqual({
      creditsBalance: 999,
      creditsAllowance: 1000,
      creditsPeriodEnd: "2026-09-01T00:00:00.000Z",
    })
  })

  it("takes the second generation's balance from the server too (-> 998)", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      res(200, { text: "out", credits: { balance: 998, allowance: 1000, periodEnd: "2026-09-01T00:00:00.000Z", planKey: "pro" } })
    )
    await backendGenerate(ARGS)
    expect(written()?.creditsBalance).toBe(998)
  })

  it("works the same for a Free account (5 -> 4)", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      res(200, { text: "out", credits: { balance: 4, allowance: 5, periodEnd: "2026-08-17T00:00:00.000Z", planKey: "free" } })
    )
    await backendGenerate(ARGS)
    expect(written()).toMatchObject({ creditsBalance: 4, creditsAllowance: 5 })
  })

  it("reflects a server-side period reset rather than decrementing across it", async () => {
    // New period: the server reset to the full allowance and then debited one.
    vi.mocked(global.fetch).mockResolvedValue(
      res(200, { text: "out", credits: { balance: 999, allowance: 1000, periodEnd: "2026-10-01T00:00:00.000Z", planKey: "pro" } })
    )
    await backendGenerate(ARGS)
    expect(written()).toMatchObject({ creditsBalance: 999, creditsPeriodEnd: "2026-10-01T00:00:00.000Z" })
  })

  it("never writes a locally-derived number — only what the server sent", async () => {
    // A client doing `balance - 1` would land on 41 here. The server says 37
    // (another panel spent some); the server must win.
    vi.mocked(global.fetch).mockResolvedValue(
      res(200, { text: "out", credits: { balance: 37, allowance: 1000, periodEnd: "2026-09-01T00:00:00.000Z", planKey: "pro" } })
    )
    await backendGenerate(ARGS)
    expect(written()?.creditsBalance).toBe(37)
  })
})

describe("balance is left alone when it must not change", () => {
  it("writes nothing when the generation fails and is refunded", async () => {
    vi.mocked(global.fetch).mockResolvedValue(res(502, { error: "Generation failed. Please try again.", code: "PROVIDER_ERROR" }))
    await expect(backendGenerate(ARGS)).rejects.toThrow()
    expect(mockSetStore).not.toHaveBeenCalled()
  })

  it("writes nothing when the account is out of credits", async () => {
    vi.mocked(global.fetch).mockResolvedValue(res(403, { error: "out", code: "OUT_OF_CREDITS" }))
    await expect(backendGenerate(ARGS)).rejects.toThrow()
    expect(mockSetStore).not.toHaveBeenCalled()
  })

  it("writes nothing on an idempotent replay that carries no credits block", async () => {
    vi.mocked(global.fetch).mockResolvedValue(res(200, { text: "cached" }))
    await backendGenerate(ARGS)
    expect(mockSetStore).not.toHaveBeenCalled()
  })

  it("leaves credits untouched for a BYOK generation", async () => {
    const byok = {
      apiKey: "gsk_x", model: "openai/gpt-oss-120b",
      aiIncluded: false, providerMode: "byok",
    } as unknown as AmintaStore
    await dispatchGenerate(byok, ARGS)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockSetStore).not.toHaveBeenCalled()
  })
})

describe("no extra work is done to refresh", () => {
  it("uses the generation response itself — one request, no follow-up call", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      res(200, { text: "out", credits: { balance: 999, allowance: 1000, periodEnd: "2026-09-01T00:00:00.000Z", planKey: "pro" } })
    )
    await backendGenerate(ARGS)
    // One POST /api/generate. A follow-up sync would risk a second
    // reservation and doubles the latency before the number updates.
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1)
    expect(mockSetStore).toHaveBeenCalledTimes(1)
  })
})

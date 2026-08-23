import { beforeEach, describe, expect, it, vi } from "vitest"

import { getStore } from "~lib/storage"
import { getActiveXIdentity } from "~lib/activeXIdentity"
import { assertActiveXAccountMatchesConnectedAccount } from "~lib/xAccountGuard"

vi.mock("~lib/storage", () => ({
  getStore: vi.fn(),
}))
vi.mock("~lib/activeXIdentity", () => ({
  getActiveXIdentity: vi.fn(),
}))

const mockGetStore = vi.mocked(getStore)
const mockGetActive = vi.mocked(getActiveXIdentity)

function store(xConnected: boolean, xUsername: string) {
  return { xConnected, xUsername } as Awaited<ReturnType<typeof getStore>>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("assertActiveXAccountMatchesConnectedAccount", () => {
  it("allows when the connected and active usernames match", async () => {
    mockGetStore.mockResolvedValue(store(true, "filiplesterr"))
    mockGetActive.mockReturnValue({ username: "filiplesterr" })
    expect(await assertActiveXAccountMatchesConnectedAccount()).toEqual({ ok: true })
  })

  it("blocks when the active account is a different X account", async () => {
    mockGetStore.mockResolvedValue(store(true, "filiplesterr"))
    mockGetActive.mockReturnValue({ username: "differentaccount" })
    const result = await assertActiveXAccountMatchesConnectedAccount()
    expect(result.ok).toBe(false)
    expect(result.error).toContain("@filiplesterr")
    expect(result.error).toContain("@differentaccount")
  })

  it("allows via normalized-username fallback when only usernames are available", async () => {
    mockGetStore.mockResolvedValue(store(true, "FilipLesterr"))
    mockGetActive.mockReturnValue({ username: "@filiplesterr" })
    expect(await assertActiveXAccountMatchesConnectedAccount()).toEqual({ ok: true })
  })

  it("blocks when the active X identity can't be determined", async () => {
    mockGetStore.mockResolvedValue(store(true, "filiplesterr"))
    mockGetActive.mockReturnValue(null)
    const result = await assertActiveXAccountMatchesConnectedAccount()
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/couldn't verify/i)
  })

  it("allows when Aminta has no connected X identity at all — nothing to protect", async () => {
    mockGetStore.mockResolvedValue(store(false, ""))
    mockGetActive.mockReturnValue({ username: "anyone" })
    expect(await assertActiveXAccountMatchesConnectedAccount()).toEqual({ ok: true })
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("~lib/auth", () => ({
  getAuthSession: vi.fn().mockResolvedValue({ accessToken: "t", refreshToken: "r", userId: "u", email: "e" }),
  refreshAuthSession: vi.fn(),
}))
vi.mock("~lib/storage", () => ({
  getStore: vi.fn().mockResolvedValue({ xConnected: true }),
  setStore: vi.fn().mockResolvedValue(undefined),
}))

import { fetchRecentXPosts } from "~lib/voiceRefresh"

function res(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
})

describe("fetchRecentXPosts — manual-training picker, not Voice Refresh", () => {
  it("returns up to 3 posts from the lightweight preview endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(
      res(200, { posts: [{ id: "1", text: "shipped this at 2am" }, { id: "2", text: "another real post" }] })
    )

    const posts = await fetchRecentXPosts()

    expect(posts).toEqual([{ id: "1", text: "shipped this at 2am" }, { id: "2", text: "another real post" }])
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("https://www.amintaapp.com/api/x/recent-posts")
  })

  it("returns an empty array when the server sends no posts field", async () => {
    vi.mocked(fetch).mockResolvedValue(res(200, {}))
    expect(await fetchRecentXPosts()).toEqual([])
  })

  it("throws the server's error message on failure (e.g. X not connected)", async () => {
    vi.mocked(fetch).mockResolvedValue(res(400, { error: "Connect your X account first.", code: "X_NOT_CONNECTED" }))
    await expect(fetchRecentXPosts()).rejects.toThrow("Connect your X account first.")
  })
})

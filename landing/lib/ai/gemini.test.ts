// Regression guard: app/api/generate/route.ts's thread branch requests a
// real output budget (maxOutputTokens: 2000, totalDeadlineMs: 30_000)
// instead of the 400-token single-post default — the actual fix for the
// live-QA failure ("Couldn't generate distinct threads" on a plain sparse
// topic, root-caused to token-budget truncation, not a distinctness
// rejection). This tests that callGemini() actually forwards a custom
// maxOutputTokens into the request body, since that's the only thing that
// makes route.ts's override meaningful.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { callGemini } from "./gemini"

function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as unknown as Response
}

describe("callGemini — output token budget is configurable, not hardcoded", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GEMINI_API_KEY
  })

  it("uses the 400-token default when no override is passed (tweet/reply/polish)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("hello"))
    vi.stubGlobal("fetch", fetchMock)

    await callGemini([{ role: "user", content: "hi" }])

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.generationConfig.maxOutputTokens).toBe(400)
  })

  it("uses a caller-supplied maxOutputTokens when passed (the actual thread fix)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('{"threads":[]}'))
    vi.stubGlobal("fetch", fetchMock)

    await callGemini([{ role: "user", content: "hi" }], { maxOutputTokens: 2000, totalDeadlineMs: 30_000 })

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.generationConfig.maxOutputTokens).toBe(2000)
  })
})

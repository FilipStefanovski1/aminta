import { beforeEach, describe, expect, it, vi } from "vitest"

import { generateReply, type GenerateReplyDeps } from "~lib/replyGeneration"
import type { VoiceProfile } from "~lib/storage"

function baseVoice(): VoiceProfile {
  return { niche: "general", tone: "casual", examples: "", voiceStyle: "casual", voiceInspiration: "nobody", customRules: "" }
}

function mockDeps(overrides: Partial<GenerateReplyDeps> = {}): GenerateReplyDeps & {
  isGroqKeyMock: ReturnType<typeof vi.fn>
  fetchImageAsDataUrlMock: ReturnType<typeof vi.fn>
  generateTextMock: ReturnType<typeof vi.fn>
  generateFromImagesMock: ReturnType<typeof vi.fn>
} {
  // Overrides are merged BEFORE the *Mock tracking aliases are captured, so
  // an override always ends up as the exact same function instance the test
  // asserts on — otherwise `mockDeps({ generateFromImages: someMock })`
  // would silently track a different (default) mock than the one actually
  // injected.
  const merged: GenerateReplyDeps = {
    isGroqKey: vi.fn().mockReturnValue(false),
    fetchImageAsDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA"),
    generateText: vi.fn().mockResolvedValue("text-only reply"),
    generateFromImages: vi.fn().mockResolvedValue("multimodal reply"),
    ...overrides,
  }
  return {
    ...merged,
    isGroqKeyMock: merged.isGroqKey as ReturnType<typeof vi.fn>,
    fetchImageAsDataUrlMock: merged.fetchImageAsDataUrl as ReturnType<typeof vi.fn>,
    generateTextMock: merged.generateText as ReturnType<typeof vi.fn>,
    generateFromImagesMock: merged.generateFromImages as ReturnType<typeof vi.fn>,
  }
}

const call = (deps: ReturnType<typeof mockDeps>, imageUrls: string[], input = "someone's post") =>
  generateReply("AIzaSomeKey", "gemini-2.0-flash", baseVoice(), input, imageUrls, null, "direct", "medium", deps)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("generateReply", () => {
  it("text-only post: never touches image deps, calls generateText once", async () => {
    const deps = mockDeps()
    const result = await call(deps, [])

    expect(result).toEqual({
      text: "text-only reply",
      usedMultimodal: false,
      imagesDetected: 0,
      imagesFetched: 0,
      fellBackToText: false,
    })
    expect(deps.fetchImageAsDataUrlMock).not.toHaveBeenCalled()
    expect(deps.generateFromImagesMock).not.toHaveBeenCalled()
    expect(deps.generateTextMock).toHaveBeenCalledTimes(1)
  })

  it("single-image post: fetches the one image and uses the multimodal path", async () => {
    const deps = mockDeps()
    const result = await call(deps, ["https://pbs.twimg.com/media/IMG1?name=large"])

    expect(deps.fetchImageAsDataUrlMock).toHaveBeenCalledTimes(1)
    expect(deps.generateFromImagesMock).toHaveBeenCalledTimes(1)
    expect(deps.generateFromImagesMock.mock.calls[0][3]).toEqual(["data:image/jpeg;base64,AAAA"])
    expect(deps.generateTextMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      text: "multimodal reply",
      usedMultimodal: true,
      imagesDetected: 1,
      imagesFetched: 1,
      fellBackToText: false,
    })
  })

  it("four-image post: fetches all four and passes all four through", async () => {
    const deps = mockDeps()
    const urls = [1, 2, 3, 4].map((n) => `https://pbs.twimg.com/media/IMG${n}?name=large`)
    const result = await call(deps, urls)

    expect(deps.fetchImageAsDataUrlMock).toHaveBeenCalledTimes(4)
    expect(deps.generateFromImagesMock.mock.calls[0][3]).toHaveLength(4)
    expect(result.imagesDetected).toBe(4)
    expect(result.imagesFetched).toBe(4)
    expect(result.usedMultimodal).toBe(true)
  })

  it("unsupported vision provider (Groq): skips fetching entirely, falls back to text-only", async () => {
    const deps = mockDeps({ isGroqKey: vi.fn().mockReturnValue(true) })
    const result = await call(deps, ["https://pbs.twimg.com/media/IMG1?name=large"])

    expect(deps.fetchImageAsDataUrlMock).not.toHaveBeenCalled()
    expect(deps.generateFromImagesMock).not.toHaveBeenCalled()
    expect(deps.generateTextMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      text: "text-only reply",
      usedMultimodal: false,
      imagesDetected: 1,
      imagesFetched: 0,
      fellBackToText: true,
    })
  })

  it("failed image fetching (all fetches return null): falls back to text-only without calling generateFromImages", async () => {
    const deps = mockDeps({ fetchImageAsDataUrl: vi.fn().mockResolvedValue(null) })
    const result = await call(deps, ["https://pbs.twimg.com/media/IMG1?name=large", "https://pbs.twimg.com/media/IMG2?name=large"])

    expect(deps.generateFromImagesMock).not.toHaveBeenCalled()
    expect(deps.generateTextMock).toHaveBeenCalledTimes(1)
    expect(result.fellBackToText).toBe(true)
    expect(result.imagesFetched).toBe(0)
    expect(result.usedMultimodal).toBe(false)
  })

  it("partial fetch failure: still goes multimodal with whichever images succeeded", async () => {
    const fetchImageAsDataUrl = vi
      .fn()
      .mockResolvedValueOnce("data:image/jpeg;base64,ONE")
      .mockResolvedValueOnce(null)
    const deps = mockDeps({ fetchImageAsDataUrl })
    const result = await call(deps, ["https://pbs.twimg.com/media/IMG1", "https://pbs.twimg.com/media/IMG2"])

    expect(deps.generateFromImagesMock).toHaveBeenCalledTimes(1)
    expect(deps.generateFromImagesMock.mock.calls[0][3]).toEqual(["data:image/jpeg;base64,ONE"])
    expect(result.imagesDetected).toBe(2)
    expect(result.imagesFetched).toBe(1)
    expect(result.usedMultimodal).toBe(true)
  })

  it("successful fallback to text-only when the multimodal generation call itself fails", async () => {
    const deps = mockDeps({ generateFromImages: vi.fn().mockRejectedValue(new Error("provider error")) })
    const result = await call(deps, ["https://pbs.twimg.com/media/IMG1?name=large"])

    expect(deps.generateFromImagesMock).toHaveBeenCalledTimes(1)
    expect(deps.generateTextMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      text: "text-only reply",
      usedMultimodal: false,
      imagesDetected: 1,
      imagesFetched: 1,
      fellBackToText: true,
    })
  })
})

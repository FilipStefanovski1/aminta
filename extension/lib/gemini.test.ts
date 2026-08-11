import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { callGemini } from "~lib/gemini"
import type { ChatMessage } from "~lib/openrouter"

const BUSY_MESSAGE = "The AI is busy right now. Try again in a moment."

function geminiResponse(text: string) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  }
}

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: headers ? new Headers(headers) : undefined,
  } as Response
}

const MESSAGES: ChatMessage[] = [
  { role: "system", content: "You write posts." },
  { role: "user", content: "Write something." },
]

describe("callGemini", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  it("sends thinkingConfig.thinkingLevel = minimal and no temperature override", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, geminiResponse("a real post")))
    await callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)

    const [, requestInit] = fetchMock.mock.calls[0]
    const body = JSON.parse(requestInit.body as string)
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" })
    expect(body.generationConfig.thinkingBudget).toBeUndefined()
    expect(body.generationConfig.temperature).toBeUndefined()
  })

  it("requests structured output and returns only the extracted text — final output contains only the generated post", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, geminiResponse(JSON.stringify({ text: "a genuinely good post" }))))
    const result = await callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { structuredText: true })

    const [, requestInit] = fetchMock.mock.calls[0]
    const body = JSON.parse(requestInit.body as string)
    expect(body.generationConfig.responseMimeType).toBe("application/json")
    expect(body.generationConfig.responseSchema).toEqual({
      type: "OBJECT",
      properties: { text: { type: "STRING" } },
      required: ["text"],
    })
    // additionalProperties is deliberately absent — Gemini's v1beta REST API
    // rejects it with a 400 despite being documented elsewhere.
    expect(body.generationConfig.responseSchema.additionalProperties).toBeUndefined()
    expect(result).toBe("a genuinely good post")
    expect(result).not.toContain("{")
    expect(result).not.toContain("}")
  })

  it("trims whitespace from the structured text field", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, geminiResponse(JSON.stringify({ text: "  spaced out post  " }))))
    const result = await callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { structuredText: true })
    expect(result).toBe("spaced out post")
  })

  it("falls back safely to raw text when the structured response is malformed JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, geminiResponse("not valid json at all")))
    const result = await callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { structuredText: true })
    expect(result).toBe("not valid json at all")
    expect(console.warn).toHaveBeenCalled()
  })

  it("falls back safely when structured JSON is valid but missing the text field", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, geminiResponse(JSON.stringify({ confidence: "high" }))))
    const result = await callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { structuredText: true })
    expect(result).toBe(JSON.stringify({ confidence: "high" }))
  })

  it("does not request structured output for style_profile-style raw calls", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, geminiResponse('{"confidence":"balanced"}')))
    await callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)

    const [, requestInit] = fetchMock.mock.calls[0]
    const body = JSON.parse(requestInit.body as string)
    expect(body.generationConfig.responseMimeType).toBeUndefined()
    expect(body.generationConfig.responseSchema).toBeUndefined()
  })

  it("throws a clean, retryable error on empty model response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { candidates: [{ content: { parts: [{ text: "" }] } }] }))
    await expect(callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)).rejects.toThrow(
      "Empty response from Gemini. Try again."
    )
  })

  it("throws a clean error on a non-deadline timeout", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "TimeoutError"))
    await expect(callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)).rejects.toThrow(
      "Gemini took too long to respond. Try again in a moment."
    )
  })

  it("passes one AbortSignal shared across the whole operation, not a fresh per-attempt timeout", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, geminiResponse("ok")))
    await callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)
    const [, requestInit] = fetchMock.mock.calls[0]
    expect(requestInit.signal).toBeInstanceOf(AbortSignal)
  })
})

describe("callGemini retry policy (interactive-safe: max 2 attempts)", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([429, 500, 502, 503, 504])(
    "retries a transient %d exactly once and succeeds if the provider recovers",
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(status, { error: { message: "busy" } }))
        .mockResolvedValueOnce(jsonResponse(200, geminiResponse("recovered post")))

      const onRetry = vi.fn()
      const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { onRetry })
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe("recovered post")
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(2, 2)
    }
  )

  it("does not retry a 400 (invalid key)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "API key not valid" } }))
    const onRetry = vi.fn()
    await expect(
      callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { onRetry })
    ).rejects.toThrow("Invalid Google key. Get a free one at aistudio.google.com/apikey.")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it("does not retry a 404 (unknown/retired model)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, {}))
    const onRetry = vi.fn()
    await expect(
      callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { onRetry })
    ).rejects.toThrow("The selected Gemini model is no longer available. Please choose another Gemini model from Settings.")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it("does not retry a network error or timeout", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "TimeoutError"))
    const onRetry = vi.fn()
    await expect(
      callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { onRetry })
    ).rejects.toThrow("Gemini took too long to respond. Try again in a moment.")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it("caps at exactly 2 HTTP attempts total (initial + one retry), never more", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: { message: "overloaded" } }))
    const onRetry = vi.fn()

    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { onRetry })
    // Swallow the rejection early so an unhandled-rejection warning doesn't
    // fire while the fake-timer-driven retry is still in flight.
    const assertion = expect(promise).rejects.toThrow(BUSY_MESSAGE)
    await vi.runAllTimersAsync()
    await assertion

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(2, 2)
  })

  it("uses a short jittered delay (750-1500ms) before the single retry, not a multi-step backoff ladder", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, geminiResponse("ok")))

    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)
    // Below the minimum jitter — retry must not have fired yet.
    await vi.advanceTimersByTimeAsync(700)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Comfortably past the maximum jitter — retry must have fired by now.
    await vi.advanceTimersByTimeAsync(900)
    const result = await promise
    expect(result).toBe("ok")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("never exposes the raw status code or provider error text to the caller", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: { message: "quota exceeded for project xyz-123" } }))
    let caught: Error | undefined
    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES).catch((e) => {
      caught = e as Error
    })
    await vi.runAllTimersAsync()
    await promise

    expect(caught?.message).not.toContain("503")
    expect(caught?.message).not.toContain("quota exceeded")
    expect(caught?.message).toBe(BUSY_MESSAGE)
  })
})

describe("callGemini 429 rate-limit handling", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("respects a Retry-After header given in seconds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": "3" }))
      .mockResolvedValueOnce(jsonResponse(200, geminiResponse("ok after rate limit")))

    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)
    // Only 2.9s elapsed — the 3s Retry-After delay shouldn't have fired yet.
    await vi.advanceTimersByTimeAsync(2900)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    const result = await promise
    expect(result).toBe("ok after rate limit")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("respects a Retry-After header given as an HTTP date", async () => {
    const retryAt = new Date(Date.now() + 4000).toUTCString()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": retryAt }))
      .mockResolvedValueOnce(jsonResponse(200, geminiResponse("ok after date retry")))

    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toBe("ok after date retry")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("caps an excessive Retry-After so it can't eat the whole deadline", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": "3600" }))
      .mockResolvedValueOnce(jsonResponse(200, geminiResponse("ok after capped delay")))

    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)
    // The cap is 5s — well under the 3600s the header asked for.
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise
    expect(result).toBe("ok after capped delay")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("falls back to a short jittered delay when Retry-After is absent", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(200, geminiResponse("ok after fallback delay")))

    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)
    await vi.advanceTimersByTimeAsync(700)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(900)
    const result = await promise
    expect(result).toBe("ok after fallback delay")
  })

  it("retries 429 only once — a second consecutive 429 fails immediately with the generic busy message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { error: { message: "quota exceeded" } }))
    let caught: Error | undefined
    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES).catch((e) => {
      caught = e as Error
    })
    await vi.runAllTimersAsync()
    await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(caught?.message).toBe(BUSY_MESSAGE)
    expect(caught?.message).not.toContain("429")
  })
})

describe("callGemini total deadline (production blocker: never leaves the UI waiting anywhere near a minute)", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("aborts a hung fetch and settles by the 15s default deadline, without a second HTTP attempt", async () => {
    // Simulates a provider that never responds at all (the worst case a
    // per-attempt-only timeout used to fail to bound). The mock fetch only
    // ever settles in response to the shared AbortSignal firing — exactly
    // how a real fetch() behaves when its controller aborts.
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"))
        })
      })
    })

    let caught: Error | undefined
    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES).catch((e) => {
      caught = e as Error
    })

    // Advancing exactly the default deadline is enough to settle the whole
    // operation — proves it doesn't wait any longer than this to give up.
    await vi.advanceTimersByTimeAsync(15_000)
    await promise

    expect(caught?.message).toBe(BUSY_MESSAGE)
    // A deadline abort is terminal — it must not trigger a second attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("respects a custom totalDeadlineMs and cancels a pending retry delay early — no second HTTP attempt", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, {}))
    let caught: Error | undefined
    // Deadline fires well before the 750-1500ms retry delay could complete.
    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES, { totalDeadlineMs: 500 }).catch((e) => {
      caught = e as Error
    })

    await vi.advanceTimersByTimeAsync(500)
    await promise

    expect(caught?.message).toBe(BUSY_MESSAGE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("clears its deadline timer on success — no lingering timer left behind", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, geminiResponse("ok")))
    await callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("clears its deadline timer on a non-retryable failure — no lingering timer left behind", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "API key not valid" } }))
    await expect(callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES)).rejects.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("settles well within the deadline when both attempts fail fast (no unnecessary waiting for the deadline itself)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0) // pins the jittered delay to its minimum, 750ms
    fetchMock.mockResolvedValue(jsonResponse(503, {}))

    let caught: Error | undefined
    const promise = callGemini("AIzaKey", "gemini-3.5-flash-lite", MESSAGES).catch((e) => {
      caught = e as Error
    })

    // Both attempts plus the 750ms jitter comfortably finish well before the
    // 15s deadline — advancing only 1s is enough for the whole operation.
    await vi.advanceTimersByTimeAsync(1_000)
    await promise

    expect(caught?.message).toBe(BUSY_MESSAGE)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The 15s deadline timer must be cleared immediately once attempts are
    // exhausted, not left running for the remaining ~14s.
    expect(vi.getTimerCount()).toBe(0)
  })
})

import { describe, expect, it, vi } from "vitest"
import { CONNECTIVITY_ERROR_MESSAGE, TIMEOUT_ERROR_MESSAGE, classifyFetchError } from "~lib/generationErrors"

describe("classifyFetchError", () => {
  it("classifies an AbortError (our own deadline firing) as a timeout, not a connectivity failure", () => {
    const err = classifyFetchError(new DOMException("aborted", "AbortError"))
    expect(err.message).toBe(TIMEOUT_ERROR_MESSAGE)
  })

  it("classifies any other fetch rejection as a connectivity failure", () => {
    const err = classifyFetchError(new TypeError("Failed to fetch"))
    expect(err.message).toBe(CONNECTIVITY_ERROR_MESSAGE)
  })

  it("never throws itself, even on a non-Error rejection", () => {
    expect(() => classifyFetchError("some string rejection")).not.toThrow()
    expect(() => classifyFetchError(undefined)).not.toThrow()
    expect(classifyFetchError(null).message).toBe(CONNECTIVITY_ERROR_MESSAGE)
  })

  it("logs the real underlying cause for dev diagnosis instead of swallowing it silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const original = new TypeError("Failed to fetch")
    classifyFetchError(original)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("generation request failed"), original)
    warn.mockRestore()
  })

  it("does not log for a timeout — that's an expected, already-explained outcome", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    classifyFetchError(new DOMException("aborted", "AbortError"))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

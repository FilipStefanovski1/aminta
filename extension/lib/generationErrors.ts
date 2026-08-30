// Shared network-failure classification for every generation call site
// (Included AI backend, Gemini, OpenRouter/Groq) so a real connectivity
// failure and a request that simply took too long never collapse into the
// same misleading "check your internet" message — see backendGenerate.ts's
// postGenerate, gemini.ts's attemptOnce, and openrouter.ts's
// callOpenAICompat, all of which now throw this same pair of messages for
// their fetch-level failure case.

export const CONNECTIVITY_ERROR_MESSAGE = "Couldn't connect. Check your connection and try again."
export const TIMEOUT_ERROR_MESSAGE = "Aminta took too long to respond. Try again."

function isAbortError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { name?: unknown }).name === "AbortError"
}

/**
 * Turns a raw `fetch()` rejection into a user-facing Error. A deliberate
 * abort (our own request-deadline timer firing) is a timeout, not a
 * connectivity problem — everything else genuinely is one. The original
 * error is logged (never shown to the user, never containing secrets) so a
 * real cause is still visible in dev tools instead of being silently
 * swallowed into one generic string.
 */
export function classifyFetchError(e: unknown): Error {
  if (isAbortError(e)) return new Error(TIMEOUT_ERROR_MESSAGE)
  console.warn("[Aminta] generation request failed:", e)
  return new Error(CONNECTIVITY_ERROR_MESSAGE)
}

// Direct call to Google AI Studio (Gemini) — free tier, no OpenRouter needed.
import type { ChatMessage, ContentPart } from "~lib/openrouter"

function toGeminiParts(content: string | ContentPart[]): object[] {
  if (typeof content === "string") return [{ text: content }]
  return content.map((p) => {
    if (p.type === "text") return { text: p.text }
    // image_url — extract base64 from data URL
    const url = p.image_url.url
    const [header, data] = url.split(",")
    const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg"
    return { inline_data: { mime_type: mimeType, data } }
  })
}

// Strict schema for post/reply/polish/template generation — forces the
// model's final answer into exactly `{ "text": "..." }`, so meta-commentary,
// a style-profile description, or any other freeform aside structurally
// cannot appear as the top-level response the way it could when the model
// was only ever *asked* (via prompt text) to return plain text. Never used
// for style_profile extraction, which keeps its own existing multi-field
// JSON contract (lib/styleProfile.ts's buildExtractionMessages/parseStyleProfile).
//
// No `additionalProperties` — despite being documented, Gemini's v1beta
// generateContent REST API rejects it with a 400 ("Unknown name
// 'additionalProperties' at 'generation_config.response_schema': Cannot
// find field."). `properties`/`required` alone already constrain the model
// to the one field we ask for; this isn't a validation gap, just a field
// this API version doesn't accept.
const TEXT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: { text: { type: "STRING" } },
  required: ["text"],
}

// Provider-agnostic on purpose — the UI never names a specific AI vendor,
// even though the retry logs below (which the user never sees) do.
const GEMINI_BUSY_MESSAGE = "The AI is busy right now. Try again in a moment."

export interface CallGeminiOptions {
  // Requests the schema above and safely unwraps `{ text }` from the
  // response. Defaults to false so style_profile's raw-JSON-via-prompt
  // extraction (which calls this same function) is untouched.
  structuredText?: boolean
  // Deadline for the ENTIRE generation operation — every attempt plus every
  // retry delay combined, not a per-attempt timeout. A single AbortController
  // tied to this deadline is shared across all attempts (see callGemini
  // below) so a stuck/overloaded provider can never hold an interactive
  // X-writing flow for anywhere near this long, let alone multiples of it.
  totalDeadlineMs?: number
  // Label only, for the latency log below — never sent to the provider.
  generationType?: string
  // Called immediately before the single retry attempt (never before the
  // first attempt) so a caller can show "Retrying automatically…" instead of
  // leaving a raw provider error on screen mid-retry.
  onRetry?: (attempt: number, maxAttempts: number) => void
  // Defaults to 400 (fine for a single tweet/reply/polish). Thread Creator
  // asks for 3 developed thread options in one JSON response and needs far
  // more room — see lib/backendGenerate.ts's THREAD_MAX_OUTPUT_TOKENS. A
  // fixed 400 regardless of task was silently truncating thread JSON
  // mid-response once posts were asked to be developed (Medium-depth fix),
  // producing invalid JSON that failed to parse — not a distinctness
  // rejection, an output-budget bug.
  maxOutputTokens?: number
}

const DEFAULT_MAX_OUTPUT_TOKENS = 400

// Whole-operation deadline. Interactive post/reply/polish generation must
// never leave the UI's loading state waiting anywhere near a minute — 15s
// covers one attempt plus one short retry with real margin, and is enforced
// by a single shared AbortController (not a fresh per-attempt timeout).
const TOTAL_DEADLINE_MS = 15_000

// Interactive-safe retry budget: the initial attempt plus exactly one retry.
// Repeatedly hammering a provider that already said "busy" (5xx) or "slow
// down" (429) is the wrong response for a user waiting on a compose button.
const MAX_ATTEMPTS = 2

// Short jittered delay before the single retry — long enough to give a
// momentary provider hiccup a chance to clear, short enough that two
// attempts still comfortably fit inside TOTAL_DEADLINE_MS.
const RETRY_DELAY_MIN_MS = 750
const RETRY_DELAY_MAX_MS = 1500

// A 429's own Retry-After is respected when present, but capped so it can
// never eat the whole deadline by itself and starve the retry of any time
// to actually run.
const RATE_LIMIT_MAX_DELAY_MS = 5_000

function jitteredDelay(): number {
  return RETRY_DELAY_MIN_MS + Math.random() * (RETRY_DELAY_MAX_MS - RETRY_DELAY_MIN_MS)
}

// Thrown when the shared operation deadline elapses — either mid-fetch (the
// shared AbortController fired) or while waiting out a retry delay. Always
// maps to the same generic busy message; never retried further.
class DeadlineExceededError extends Error {
  constructor() {
    super("generation deadline exceeded")
  }
}

// Sleep that resolves early (by rejecting) the instant the shared deadline
// fires, instead of blocking a retry delay past a operation that has already
// been cancelled.
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DeadlineExceededError())
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      cleanup()
      reject(new DeadlineExceededError())
    }
    function cleanup() {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
    }
    signal.addEventListener("abort", onAbort)
  })
}

// Parses Retry-After per RFC 9110 — either a delay in seconds or an HTTP
// date. Returns undefined if the header is missing or unparseable, in which
// case the caller falls back to a short jittered delay.
function parseRetryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, RATE_LIMIT_MAX_DELAY_MS)
  }
  const dateMs = Date.parse(header)
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(0, dateMs - Date.now()), RATE_LIMIT_MAX_DELAY_MS)
  }
  return undefined
}

// Thrown only for the retryable 5xx statuses, and only once the single
// retry has also failed — carries just enough for the final log line, never
// anything sensitive.
class TransientGeminiError extends Error {
  constructor(public status: number) {
    super(`transient Gemini error ${status}`)
  }
}

// Thrown only for 429 — carries the provider's requested delay (if any) so
// the retry loop can respect it instead of using the default jittered delay.
class RateLimitedError extends Error {
  constructor(public retryAfterMs: number | undefined) {
    super("rate limited (429)")
  }
}

// Attaches an HTTP status to a plain Error without changing its message or
// type — existing callers/tests match on `.message`, this is purely so the
// dev-only diagnostic log below can report the real status for non-retryable
// failures (invalid key, unknown model) alongside everything else.
function withStatus(status: number, err: Error): Error {
  ;(err as Error & { status?: number }).status = status
  return err
}

// Parses a structured `{ "text": "..." }` response safely. Falls back to
// treating the raw provider text as the answer (the pre-structured-output
// behavior) if it isn't valid JSON or doesn't have a string `text` field —
// never throws, never surfaces the raw JSON to the caller/user, and logs
// the failure reason (not the content) so a schema regression is visible
// in the console without leaking anything sensitive.
function extractStructuredText(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
      return parsed.text.trim()
    }
    throw new Error("response JSON did not match the expected { text } shape")
  } catch (err) {
    console.warn(
      "[Aminta] Gemini structured response failed to parse — falling back to raw text",
      err instanceof Error ? err.message : "unknown error"
    )
    return raw.trim()
  }
}

// True only in an unpacked/dev-loaded extension (no `update_url` in the
// manifest — that key is only ever injected by the Chrome Web Store on a
// published install). Gates the verbose per-attempt diagnostic log so
// production users never see it, matching this repo's existing dev-flag
// convention. Never throws even if chrome.runtime is unavailable (e.g. under
// vitest).
function isDevBuild(): boolean {
  try {
    return typeof chrome !== "undefined" && !("update_url" in chrome.runtime.getManifest())
  } catch {
    return false
  }
}

// Single diagnostic line per attempt — dev-only, never shipped to real
// users. Exists to answer "is this a provider failure or an Aminta bug"
// without ever logging the prompt, the response text, or the API key.
function logDevAttempt(fields: {
  model: string
  attempt: number
  maxAttempts: number
  status: number | undefined
  apiMs: number
  totalMs: number
  aborted: boolean
  category: "success" | "transient_5xx" | "rate_limited" | "non_retryable" | "deadline_exceeded"
}) {
  if (!isDevBuild()) return
  console.log("[Aminta][dev] Gemini generation attempt", fields)
}

// One HTTP attempt. Returns the parsed response on success. Throws
// TransientGeminiError/RateLimitedError for a retryable status (caller
// decides whether to retry or give up); throws a normal Error with the
// existing user-facing message for everything else (invalid key, unknown
// model, network/timeout) — those messages and behavior are unchanged.
// `signal` is the ONE AbortController shared across every attempt of this
// generation call — not a fresh per-attempt timeout — so a slow provider can
// never be retried into blowing past the total deadline.
async function attemptOnce(
  apiKey: string,
  model: string,
  body: object,
  signal: AbortSignal
): Promise<{ data: Record<string, unknown>; apiMs: number }> {
  let res: Response
  const apiStartedAt = Date.now()
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey.trim()
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal
      }
    )
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new DeadlineExceededError()
    }
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error("Gemini took too long to respond. Try again in a moment.")
    }
    throw new Error("Network error. Check your internet connection.")
  }
  const apiMs = Date.now() - apiStartedAt

  if (!res.ok) {
    if (res.status === 429) {
      throw new RateLimitedError(parseRetryAfterMs(res.headers?.get?.("Retry-After")))
    }
    if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
      throw new TransientGeminiError(res.status)
    }

    let detail = ""
    try {
      const err = await res.json()
      detail = err?.error?.message ?? ""
    } catch {
      // ignore parse failure
    }
    if (res.status === 400 && /API key not valid/i.test(detail)) {
      throw withStatus(res.status, new Error(
        "Invalid Google key. Get a free one at aistudio.google.com/apikey."
      ))
    }
    if (res.status === 404) {
      // Google returns 404 for a model ID that's retired, restricted to
      // other keys, or simply doesn't exist — not a transient error, and
      // "try again" would just repeat the same failure. Specific, actionable
      // message instead of the generic `Gemini error ${status}` below.
      throw withStatus(res.status, new Error(
        "The selected Gemini model is no longer available. Please choose another Gemini model from Settings."
      ))
    }
    throw withStatus(res.status, new Error(`Gemini error ${res.status}. ${detail}`.trim()))
  }

  const data = await res.json()
  return { data, apiMs }
}

export async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options: CallGeminiOptions = {}
): Promise<string> {
  const {
    structuredText = false,
    totalDeadlineMs = TOTAL_DEADLINE_MS,
    generationType,
    onRetry,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS
  } = options

  if (!apiKey.trim()) {
    throw new Error("Missing API key. Add your Google AI Studio key in Settings.")
  }

  const prepStartedAt = Date.now()

  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n")

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGeminiParts(m.content)
    }))

  const body = {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: {
      maxOutputTokens,
      // Gemini 3 series: lowest thinking level for a simple writing task —
      // cuts latency and avoids the model's own reasoning/analysis bleeding
      // into the visible answer. Never combined with the legacy
      // thinking_budget field (Google 400s if both are present).
      thinkingConfig: { thinkingLevel: "minimal" },
      // No `temperature` override — Gemini 3's recommended default (1.0) is
      // what we want; Google explicitly warns lower values can cause
      // looping/degraded output on these models, and nothing here has ever
      // proven a lower value necessary.
      ...(structuredText
        ? { responseMimeType: "application/json", responseSchema: TEXT_RESPONSE_SCHEMA }
        : {}),
    }
  }

  const prepMs = Date.now() - prepStartedAt

  // ONE controller/deadline for the whole operation — every attempt and
  // every retry delay shares it. This replaces the old per-attempt
  // AbortSignal.timeout(): a fresh timeout on every retry is exactly what
  // let a stuck/overloaded provider hold the UI for minutes.
  const controller = new AbortController()
  const deadlineTimer = setTimeout(() => controller.abort(), totalDeadlineMs)

  let apiMs = 0
  let data: Record<string, unknown> | undefined
  let lastStatus: number | undefined
  let attemptNumber = 0
  const opStartedAt = Date.now()

  try {
    while (true) {
      attemptNumber++
      const attemptStartedAt = Date.now()

      if (controller.signal.aborted) {
        const totalMs = Date.now() - opStartedAt
        logDevAttempt({ model, attempt: attemptNumber, maxAttempts: MAX_ATTEMPTS, status: lastStatus, apiMs: 0, totalMs, aborted: true, category: "deadline_exceeded" })
        console.warn("[Aminta] Gemini generation deadline exceeded", { model, attempt: attemptNumber, totalMs })
        throw new Error(GEMINI_BUSY_MESSAGE)
      }

      try {
        const result = await attemptOnce(apiKey, model, body, controller.signal)
        data = result.data
        apiMs = result.apiMs
        const totalMs = Date.now() - opStartedAt
        logDevAttempt({ model, attempt: attemptNumber, maxAttempts: MAX_ATTEMPTS, status: 200, apiMs: result.apiMs, totalMs, aborted: false, category: "success" })
        break
      } catch (e) {
        const attemptApiMs = Date.now() - attemptStartedAt
        const totalMs = Date.now() - opStartedAt

        if (e instanceof DeadlineExceededError) {
          logDevAttempt({ model, attempt: attemptNumber, maxAttempts: MAX_ATTEMPTS, status: lastStatus, apiMs: attemptApiMs, totalMs, aborted: true, category: "deadline_exceeded" })
          console.warn("[Aminta] Gemini generation deadline exceeded", { model, attempt: attemptNumber, totalMs })
          throw new Error(GEMINI_BUSY_MESSAGE)
        }

        if (e instanceof RateLimitedError || e instanceof TransientGeminiError) {
          const status = e instanceof RateLimitedError ? 429 : e.status
          const category = e instanceof RateLimitedError ? "rate_limited" as const : "transient_5xx" as const
          lastStatus = status
          logDevAttempt({ model, attempt: attemptNumber, maxAttempts: MAX_ATTEMPTS, status, apiMs: attemptApiMs, totalMs, aborted: false, category })

          if (attemptNumber >= MAX_ATTEMPTS) {
            console.warn("[Aminta] Gemini retries exhausted", { status, model, attempts: attemptNumber, totalMs })
            throw new Error(GEMINI_BUSY_MESSAGE)
          }

          const delayMs = e instanceof RateLimitedError
            ? (e.retryAfterMs ?? jitteredDelay())
            : jitteredDelay()

          onRetry?.(attemptNumber + 1, MAX_ATTEMPTS)
          // Non-sensitive only: retry count, status, model, delay — never the prompt.
          console.warn("[Aminta] Gemini transient error — retrying", {
            attempt: attemptNumber,
            status,
            model,
            delayMs,
          })

          try {
            await sleep(delayMs, controller.signal)
          } catch {
            const abortedTotalMs = Date.now() - opStartedAt
            logDevAttempt({ model, attempt: attemptNumber, maxAttempts: MAX_ATTEMPTS, status, apiMs: 0, totalMs: abortedTotalMs, aborted: true, category: "deadline_exceeded" })
            console.warn("[Aminta] Gemini generation deadline exceeded during retry delay", { model, totalMs: abortedTotalMs })
            throw new Error(GEMINI_BUSY_MESSAGE)
          }
          continue
        }

        // Non-retryable — invalid key, unknown model, network error. Log the
        // failure category for diagnosis, then rethrow the existing specific
        // message unchanged; never retried regardless of attempts remaining.
        logDevAttempt({ model, attempt: attemptNumber, maxAttempts: MAX_ATTEMPTS, status: (e as Error & { status?: number }).status, apiMs: attemptApiMs, totalMs, aborted: false, category: "non_retryable" })
        throw e
      }
    }
  } finally {
    clearTimeout(deadlineTimer)
  }

  if (!data) {
    // Unreachable in practice (the loop above either returns data or
    // throws), but keeps the type-checker honest about `data` being defined
    // below.
    throw new Error(GEMINI_BUSY_MESSAGE)
  }

  const parseStartedAt = Date.now()
  const rawText = (data?.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim()

  if (!rawText) {
    const blocked = (data?.promptFeedback as { blockReason?: string } | undefined)?.blockReason
    if (blocked) {
      throw new Error(`Blocked by safety filter (${blocked}). Try different input.`)
    }
    throw new Error("Empty response from Gemini. Try again.")
  }

  const text = structuredText ? extractStructuredText(rawText) : rawText
  const parseMs = Date.now() - parseStartedAt

  // Non-sensitive timing/metadata only — never the prompt, the response
  // text, or the API key.
  console.log("[Aminta] Gemini generation latency", {
    generationType: generationType ?? "unknown",
    model,
    attempts: attemptNumber,
    prepMs,
    apiMs,
    parseMs,
    totalMs: prepMs + apiMs + parseMs,
  })

  return text
}

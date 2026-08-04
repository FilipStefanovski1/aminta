// TEMPORARY — Included AI production-config health check. Will be deleted
// immediately after this debugging session; not part of the permanent
// internal-endpoint surface (compare app/api/internal/cleanup, which is a
// real scheduled job with CRON_SECRET auth — this one intentionally has
// none, per explicit instruction, for zero-friction manual debugging).
//
// UNAUTHENTICATED BY DESIGN (explicit instruction) — this means anyone who
// finds this URL can trigger one real Gemini call on the production key
// while this file exists, and that call is NOT written to ai_usage_log, so
// it does not count against the spend-cap tracking in lib/ai/config.ts.
// Low blast radius (one tiny fixed prompt, no user input accepted) but not
// zero — delete this route as soon as the investigation is done.
//
// Verifies, independent of any user request:
//   1. GEMINI_API_KEY exists in the production runtime.
//   2. The model this backend is actually configured to call.
//   3. That model + key can complete one minimal real Gemini request.
//
// Never returns or logs the API key, the prompt, or any generated text —
// only the model name, the HTTP status, latency, and a sanitized
// (message-only) error string when the call fails.
import { NextResponse } from "next/server"
import { GEMINI_INCLUDED_MODEL } from "@/lib/ai/config"

export const runtime = "nodejs"

export async function GET() {
  const apiKeyPresent = !!process.env.GEMINI_API_KEY
  // Exactly the requested log line — boolean only, never the key itself.
  console.log("[Included AI][HEALTH] GEMINI_API_KEY present:", apiKeyPresent)

  if (!apiKeyPresent) {
    return NextResponse.json({
      model: GEMINI_INCLUDED_MODEL,
      status: null,
      latencyMs: 0,
      error: "GEMINI_API_KEY is not set in this environment.",
    })
  }

  const apiKey = process.env.GEMINI_API_KEY!
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_INCLUDED_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: [{ role: "user", parts: [{ text: "Reply with exactly: ok" }] }],
    generationConfig: { maxOutputTokens: 10 },
  }

  const startedAt = Date.now()
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    const latencyMs = Date.now() - startedAt
    return NextResponse.json({
      model: GEMINI_INCLUDED_MODEL,
      status: null,
      latencyMs,
      error: e instanceof Error ? e.message : "Unknown network error calling Gemini.",
    })
  }
  const latencyMs = Date.now() - startedAt

  if (!res.ok) {
    let sanitizedError = `HTTP ${res.status} with no parseable error body`
    try {
      const errBody = await res.json()
      sanitizedError = errBody?.error?.message ?? sanitizedError
    } catch {
      // ignore parse failure — keep the generic message above
    }
    return NextResponse.json({
      model: GEMINI_INCLUDED_MODEL,
      status: res.status,
      latencyMs,
      error: sanitizedError,
    })
  }

  // Deliberately do not read/return the response text — this endpoint only
  // confirms reachability + key validity + model validity, never content.
  return NextResponse.json({
    model: GEMINI_INCLUDED_MODEL,
    status: res.status,
    latencyMs,
    error: null,
  })
}

#!/usr/bin/env node
// Isolated Gemini provider health check — bypasses Aminta's app code
// entirely (no lib/gemini.ts, no retry logic, no UI) so a 503/429/etc. can
// be confirmed as a Gemini-side condition independent of anything in this
// repo. Sends the simplest possible request against the exact model +
// key you give it and reports status/latency/response.
//
// Usage:
//   GEMINI_API_KEY=your_key node scripts/gemini-health-check.js
//   GEMINI_API_KEY=your_key GEMINI_MODEL=gemini-3.5-flash-lite node scripts/gemini-health-check.js
//
// Never commit a real key. Pass it as an env var only; nothing here reads
// from or writes to any config file.

const apiKey = process.env.GEMINI_API_KEY
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash"

if (!apiKey) {
  console.error("Missing GEMINI_API_KEY. Usage: GEMINI_API_KEY=... node scripts/gemini-health-check.js")
  process.exit(1)
}

async function main() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: [{ role: "user", parts: [{ text: "Reply with exactly: ok" }] }],
    generationConfig: { maxOutputTokens: 10 },
  }

  const startedAt = Date.now()
  let res
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    const latencyMs = Date.now() - startedAt
    console.log(JSON.stringify({
      model,
      status: null,
      latencyMs,
      error: e instanceof Error ? e.message : "unknown network error",
    }, null, 2))
    process.exit(1)
  }
  const latencyMs = Date.now() - startedAt

  let json
  try {
    json = await res.json()
  } catch {
    json = null
  }

  if (!res.ok) {
    console.log(JSON.stringify({
      model,
      status: res.status,
      latencyMs,
      // Sanitized — Google's error body can echo the key/project in some
      // cases, so only the message field is surfaced, never the raw body.
      error: json?.error?.message ?? `HTTP ${res.status} with no parseable error body`,
    }, null, 2))
    process.exit(res.status === 503 || res.status === 429 ? 2 : 1)
  }

  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim()
  console.log(JSON.stringify({
    model,
    status: res.status,
    latencyMs,
    response: text ?? "(empty response)",
  }, null, 2))
}

main()

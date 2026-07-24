// SOURCE OF TRUTH: extension/lib/gemini.ts
//
// Intentional duplicate for app/api/generate/route.ts — see
// lib/ai/prompts.ts's header comment for why (no shared package between
// extension/ and landing/). Diff against the extension version before
// shipping a change to either.
//
// Included AI only calls Gemini — this is the ONE provider this backend
// talks to. BYOK's Groq/OpenRouter calls never happen server-side; those
// stay entirely client-side in the extension, untouched by this work.
import type { ChatMessage, ContentPart } from "./prompts"

const GEMINI_MODEL = "gemini-2.0-flash"
const MAX_OUTPUT_TOKENS = 400

function toGeminiParts(content: string | ContentPart[]): object[] {
  if (typeof content === "string") return [{ text: content }]
  return content.map((p) => {
    if (p.type === "text") return { text: p.text }
    const url = p.image_url.url
    const [header, data] = url.split(",")
    const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg"
    return { inline_data: { mime_type: mimeType, data } }
  })
}

export interface GeminiResult {
  text: string
  model: string
  // Real usage from Gemini's usageMetadata when the provider includes it —
  // preferred over the char-count heuristic in lib/ai/quota.ts's
  // estimateCostUsd() for spend tracking. Undefined only if Gemini omits
  // usageMetadata entirely (not expected, but not relied upon either).
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export async function callGemini(messages: ChatMessage[], timeoutMs = 55_000): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error("Included AI is misconfigured (missing server API key).")
  }

  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n")

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: "user", parts: toGeminiParts(m.content) }))

  const body = {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: { temperature: 0.9, maxOutputTokens: MAX_OUTPUT_TOKENS },
  }

  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      }
    )
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error("Generation took too long. Try again in a moment.")
    }
    throw new Error("Network error calling the AI provider.")
  }

  if (!res.ok) {
    let detail = ""
    try {
      const err = await res.json()
      detail = err?.error?.message ?? ""
    } catch {
      // ignore parse failure
    }
    // Detailed provider errors (which can include project/quota/key-shape
    // hints) go to server logs only — the client gets a generic message.
    // See route.ts's errorResponse()/logProviderError() for the log side.
    console.error("[Included AI] Gemini provider error", { status: res.status, detail })
    throw new Error("The AI provider returned an error. Please try again.")
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim()

  if (!text) {
    const blocked = data?.promptFeedback?.blockReason
    if (blocked) throw new Error(`Blocked by safety filter (${blocked}). Try different input.`)
    throw new Error("Empty response from the provider. Try again.")
  }

  const usage = data?.usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    | undefined

  return {
    text,
    model: GEMINI_MODEL,
    inputTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
    totalTokens: usage?.totalTokenCount,
  }
}

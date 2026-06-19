// Direct call to Google AI Studio (Gemini) — free tier, no OpenRouter needed.
import type { ChatMessage } from "~lib/openrouter"

export async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<string> {
  if (!apiKey.trim()) {
    throw new Error("Missing API key. Add your Google AI Studio key in Settings.")
  }

  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n")

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }))

  const body = {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: { temperature: 0.9, maxOutputTokens: 400 }
  }

  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey.trim()
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    )
  } catch {
    throw new Error("Network error — check your internet connection.")
  }

  if (!res.ok) {
    let detail = ""
    try {
      const err = await res.json()
      detail = err?.error?.message ?? ""
    } catch {
      // ignore parse failure
    }
    if (res.status === 400 && /API key not valid/i.test(detail)) {
      throw new Error(
        "Invalid Google key. Get a free one at aistudio.google.com/apikey."
      )
    }
    if (res.status === 429) {
      throw new Error(
        `Rate limited (429). ${detail || "Free tier limit — wait ~30s and retry, or switch model in Settings."}`
      )
    }
    throw new Error(`Gemini error ${res.status}. ${detail}`.trim())
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim()

  if (!text) {
    const blocked = data?.promptFeedback?.blockReason
    if (blocked) {
      throw new Error(`Blocked by safety filter (${blocked}). Try different input.`)
    }
    throw new Error("Empty response from Gemini. Try again.")
  }
  return text
}

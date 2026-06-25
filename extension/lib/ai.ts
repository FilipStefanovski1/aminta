// Single entry point. Routes by API key prefix:
//   AIza… / AQ.…  → Google AI Studio (Gemini)
//   gsk_…         → Groq (free tier)
//   else          → OpenRouter
import { callGemini } from "~lib/gemini"
import { callGroq, callOpenRouter, type ChatMessage } from "~lib/openrouter"

export type { ChatMessage }

export function isGoogleKey(key: string): boolean {
  const k = key.trim()
  return k.startsWith("AIza") || k.startsWith("AQ.")
}

export function isGroqKey(key: string): boolean {
  return key.trim().startsWith("gsk_")
}

const GEMINI_DEFAULT = "gemini-2.0-flash"
const GROQ_DEFAULT = "llama-3.3-70b-versatile"

// Guard against stale / wrong-provider model names.
function normalizeGeminiModel(model: string): string {
  if (!model || model.includes("/") || model.includes("1.5")) return GEMINI_DEFAULT
  return model
}

function normalizeGroqModel(model: string): string {
  // Groq models have no "/" and no ":free" suffix.
  if (!model || model.includes("/") || model.includes(":")) return GROQ_DEFAULT
  return model
}

export function generate(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<string> {
  if (isGoogleKey(apiKey)) {
    return callGemini(apiKey, normalizeGeminiModel(model), messages)
  }
  if (isGroqKey(apiKey)) {
    return callGroq(apiKey, normalizeGroqModel(model), messages)
  }
  return callOpenRouter(apiKey, model, messages)
}

// Generate from an image — injects the image into the last user message as a vision part.
export function generateFromImage(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  imageDataUrl: string
): Promise<string> {
  if (isGroqKey(apiKey)) {
    throw new Error("Vision isn't supported with Groq keys. Switch to a Gemini or OpenRouter key in Settings.")
  }

  const visionMessages: ChatMessage[] = messages.map((m, i) => {
    if (m.role === "user" && i === messages.length - 1) {
      const text = typeof m.content === "string" ? m.content : ""
      return {
        ...m,
        content: [
          { type: "image_url" as const, image_url: { url: imageDataUrl, detail: "low" as const } },
          { type: "text" as const, text },
        ],
      }
    }
    return m
  })

  if (isGoogleKey(apiKey)) {
    return callGemini(apiKey, normalizeGeminiModel(model), visionMessages)
  }
  return callOpenRouter(apiKey, model, visionMessages)
}

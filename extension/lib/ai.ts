// Single entry point. Routes by API key prefix:
//   AIza… / AQ.…  → Google AI Studio (Gemini)
//   gsk_…         → Groq (free tier)
//   else          → OpenRouter
import { callGemini, type CallGeminiOptions } from "~lib/gemini"
import { callGroq, callOpenRouter, type ChatMessage } from "~lib/openrouter"

export type { ChatMessage }
export type { CallGeminiOptions as GenerateOptions }

export function isGoogleKey(key: string): boolean {
  const k = key.trim()
  return k.startsWith("AIza") || k.startsWith("AQ.")
}

export function isGroqKey(key: string): boolean {
  return key.trim().startsWith("gsk_")
}

export const GEMINI_DEFAULT = "gemini-3.5-flash"
export const GROQ_DEFAULT = "llama-3.3-70b-versatile"

// Whitelist, not a blacklist — Google has already fully shut down
// gemini-2.0-flash/-lite and restricted gemini-2.5-flash to pre-existing
// keys only (404s for new ones), and there's no reason to expect that to
// stop happening. Listing what's actually supported means any stale,
// invalid, typo'd, or future-retired model ID falls back to GEMINI_DEFAULT
// automatically — nothing to add here when Google retires the next one.
export const SUPPORTED_GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"]

export const DEPRECATED_GROQ_IDS = new Set([
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
  "gpt-oss-120b",
  "qwen-3.6-27b",
  "llama-4-maverick-17b-128e-instruct",
  "llama-4-scout-17b-16e-instruct",
  "qwen-qwq-32b",
])

function normalizeGeminiModel(model: string): string {
  return SUPPORTED_GEMINI_MODELS.includes(model) ? model : GEMINI_DEFAULT
}

function normalizeGroqModel(model: string): string {
  // Groq models have no "/" and no ":free" suffix.
  if (!model || model.includes("/") || model.includes(":")) return GROQ_DEFAULT
  if (DEPRECATED_GROQ_IDS.has(model)) return GROQ_DEFAULT
  return model
}

// Deliberately returns the raw provider text, uncleaned — this function is
// shared by post/reply/polish generation AND style-profile JSON extraction
// (lib/styleProfile.ts's extractStyleProfile()), and text cleanup (label/
// quote stripping, punctuation normalization) is only valid for the former.
// Post-generation call sites (lib/backendGenerate.ts's dispatchGenerate(),
// lib/replyGeneration.ts, TemplatesModal.tsx's generate-mode deps) apply
// lib/textCleanup.ts's cleanGenerationOutput() themselves.
export function generate(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options?: CallGeminiOptions
): Promise<string> {
  if (isGoogleKey(apiKey)) {
    return callGemini(apiKey, normalizeGeminiModel(model), messages, options)
  }
  if (isGroqKey(apiKey)) {
    return callGroq(apiKey, normalizeGroqModel(model), messages)
  }
  return callOpenRouter(apiKey, model, messages)
}

// Generate from one or more images — injects them into the last user
// message as vision parts, all images first then the caption text (so a
// multi-image reply sees every photo before the text framing them).
export function generateFromImage(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  imageDataUrls: string[],
  options?: CallGeminiOptions
): Promise<string> {
  if (isGroqKey(apiKey)) {
    throw new Error("Vision isn't supported with Groq keys. Switch to a Gemini or OpenRouter key in Settings.")
  }
  if (imageDataUrls.length === 0) {
    throw new Error("No images to send.")
  }

  const visionMessages: ChatMessage[] = messages.map((m, i) => {
    if (m.role === "user" && i === messages.length - 1) {
      const text = typeof m.content === "string" ? m.content : ""
      return {
        ...m,
        content: [
          ...imageDataUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "low" as const },
          })),
          { type: "text" as const, text },
        ],
      }
    }
    return m
  })

  if (isGoogleKey(apiKey)) {
    return callGemini(apiKey, normalizeGeminiModel(model), visionMessages, options)
  }
  return callOpenRouter(apiKey, model, visionMessages)
}

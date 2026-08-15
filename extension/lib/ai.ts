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
// Groq retired llama-3.3-70b-versatile on 2026-08-16. Its official
// replacement per console.groq.com/docs/deprecations is openai/gpt-oss-120b
// (verified 2026-08-14). Note the vendor-prefixed ID format Groq now uses —
// see SUPPORTED_GROQ_MODELS below for why that matters.
export const GROQ_DEFAULT = "openai/gpt-oss-120b"

// Whitelist, not a blacklist — Google has already fully shut down
// gemini-2.0-flash/-lite and restricted gemini-2.5-flash to pre-existing
// keys only (404s for new ones), and there's no reason to expect that to
// stop happening. Listing what's actually supported means any stale,
// invalid, typo'd, or future-retired model ID falls back to GEMINI_DEFAULT
// automatically — nothing to add here when Google retires the next one.
export const SUPPORTED_GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"]

// Whitelist, for exactly the reasons given for Gemini above — and Groq has
// proven the point harder: an audit on 2026-08-14 found ALL THREE models
// previously offered here were dead or dying (llama3-70b-8192 and
// llama3-8b-8192 shut down 2025-08-30, llama-3.3-70b-versatile on
// 2026-08-16), and the old blacklist had silently gone stale against them.
//
// Groq's current IDs are vendor-prefixed ("openai/...", "qwen/..."), which
// is why normalizeGroqModel can no longer reject a model just because it
// contains "/" — that heuristic existed to catch an OpenRouter model string
// left over from a provider switch, and a whitelist covers that case
// correctly without also rejecting Groq's own legitimate IDs.
export const SUPPORTED_GROQ_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b"]

function normalizeGeminiModel(model: string): string {
  return SUPPORTED_GEMINI_MODELS.includes(model) ? model : GEMINI_DEFAULT
}

function normalizeGroqModel(model: string): string {
  return SUPPORTED_GROQ_MODELS.includes(model) ? model : GROQ_DEFAULT
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

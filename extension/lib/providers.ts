// Single source of truth for every AI provider Aminta actually supports.
// Add a new provider here and it shows up everywhere (Settings key hint,
// "Get an API Key" row, model list) with no other code changes.
import { isGoogleKey, isGroqKey } from "./ai"
import { GOOGLE_MODELS, GROQ_MODELS, OPENROUTER_MODELS } from "~components/ApiKeyForm"

interface Model {
  id: string
  label: string
  badge?: string
  badgeColor?: string
}

export interface ProviderInfo {
  id: "groq" | "google" | "openrouter"
  name: string
  url: string
  free: boolean
  dot: string
  models: Model[]
  isKey: (key: string) => boolean
}

// Order matters: detectProvider() returns the first match, and OpenRouter's
// isKey is an unconditional catch-all — it must stay last.
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "groq",
    name: "Groq",
    url: "https://console.groq.com/keys",
    free: true,
    dot: "#f97316",
    models: GROQ_MODELS,
    isKey: isGroqKey,
  },
  {
    id: "google",
    name: "Google AI Studio",
    url: "https://aistudio.google.com/apikey",
    free: true,
    dot: "#4a90d9",
    models: GOOGLE_MODELS,
    isKey: isGoogleKey,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    url: "https://openrouter.ai/keys",
    free: false,
    dot: "#a78bfa",
    models: OPENROUTER_MODELS,
    isKey: () => true,
  },
]

export function detectProvider(key: string): ProviderInfo {
  return PROVIDERS.find(p => p.isKey(key)) ?? PROVIDERS[PROVIDERS.length - 1]
}

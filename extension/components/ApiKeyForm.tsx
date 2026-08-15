import { useEffect, useState } from "react"

import { isGoogleKey, isGroqKey } from "~lib/ai"
import type { AmintaStore } from "~lib/storage"

export const OPENROUTER_MODELS = [
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
  { id: "openai/gpt-4o-mini",                     label: "GPT-4o Mini" },
  { id: "anthropic/claude-3.5-haiku",             label: "Claude 3.5 Haiku" },
]
// gemini-2.0-flash/-lite were shut down by Google (June 2026) and
// gemini-2.5-flash is restricted to pre-existing keys only — new API keys
// get a 404 from all three. Only currently-available, non-alias, stable
// model IDs are listed here; gemini-3.5-flash is first/default (see
// lib/ai.ts's GEMINI_DEFAULT, which this list's order doesn't drive but
// should stay consistent with).
export const GOOGLE_MODELS = [
  { id: "gemini-3.5-flash",      label: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
]
// Must stay in sync with lib/ai.ts's SUPPORTED_GROQ_MODELS — anything not in
// that whitelist is normalized away to GROQ_DEFAULT at call time, so offering
// it here would show the user a model they can't actually use.
export const GROQ_MODELS = [
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", badge: "★ Recommended", badgeColor: "#74f7b5" },
  { id: "qwen/qwen3.6-27b",    label: "Qwen 3.6 27B", badge: "Fast",          badgeColor: "#666672" },
]

export const SELECT_STYLE: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  backgroundColor: "#1a1a1a",
  color: "#e7e7ef",
  border: "2px solid #252a38",
  borderRadius: 8,
  padding: "10px 36px 10px 12px",
  fontFamily: "'Press Start 2P', monospace",
  fontSize: 8,
  width: "100%",
  outline: "none",
  cursor: "pointer",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23555'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
}

interface Props {
  initial: AmintaStore
  onSave: (patch: Partial<AmintaStore>) => Promise<void> | void
}

export default function ApiKeyForm({ initial, onSave }: Props) {
  const [key,   setKey]   = useState(initial.apiKey ?? "")
  const [model, setModel] = useState(initial.model  ?? "")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const isGoogle = isGoogleKey(key)
  const isGroq   = isGroqKey(key)
  const models   = isGoogle ? GOOGLE_MODELS : isGroq ? GROQ_MODELS : OPENROUTER_MODELS

  useEffect(() => {
    if (!models.find(m => m.id === model)) setModel(models[0].id)
  }, [isGoogle, isGroq]) // eslint-disable-line react-hooks/exhaustive-deps

  const providerLabel = isGroq
    ? "Groq · free tier"
    : isGoogle
      ? "Google AI Studio · free tier"
      : "OpenRouter"

  const providerHint = isGroq
    ? "console.groq.com/keys"
    : isGoogle
      ? "aistudio.google.com/apikey"
      : "openrouter.ai/keys"

  const modelLabel = isGroq
    ? "Model (Groq · free)"
    : isGoogle
      ? "Model (Google)"
      : "Model (OpenRouter)"

  const save = async () => {
    setError("")
    if (!key.trim()) { setError("Paste an API key first."); return }
    const m = models.find(x => x.id === model)?.id ?? models[0].id
    await onSave({ apiKey: key.trim(), model: m })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="space-y-5">

      {/* API key */}
      <div className="space-y-2">
        <label className="font-pixel text-[7px] text-mint uppercase tracking-widest block">
          API Key
        </label>
        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="gsk_…  ·  AIza…  ·  sk-or-…"
          className="input-pixel w-full rounded-lg px-3 py-2.5 text-sm"
        />
        <p className="font-pixel text-[6px] text-[#444] leading-relaxed">
          {providerLabel} · {providerHint}<br />
          Stored locally only.
        </p>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="font-pixel text-[7px] text-mint uppercase tracking-widest block">
          {modelLabel}
        </label>
        <select
          value={models.find(m => m.id === model)?.id ?? models[0].id}
          onChange={e => setModel(e.target.value)}
          style={SELECT_STYLE}>
          {models.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        {isGroq && (() => {
          const gm = GROQ_MODELS.find(m => m.id === model) ?? GROQ_MODELS[0]
          return (
            <p className="font-pixel text-[6px] mt-1.5" style={{ color: gm.badgeColor }}>
              {gm.badge}
            </p>
          )
        })()}
      </div>

      {error && <p className="font-pixel text-[7px] text-red-400">{error}</p>}

      <button
        onClick={save}
        className="btn-pixel w-full bg-mint text-black py-3 rounded-lg font-pixel text-[9px]">
        {saved ? "Saved ✓" : "Save"}
      </button>

    </div>
  )
}

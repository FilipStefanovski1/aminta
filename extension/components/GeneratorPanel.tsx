import { useRef, useState } from "react"

import { generate as runAI, generateFromImage, isGroqKey } from "~lib/ai"
import { backendGenerate, dispatchGenerate } from "~lib/backendGenerate"
import type { CompanionEvent } from "~lib/companion"
import { todayLocal } from "~lib/dates"
import { getStageTint } from "~lib/evolution"
import { shouldUseIncludedAi } from "~lib/entitlements"
import { fetchImageAsDataUrl } from "~lib/images"
import { readActivePost } from "~lib/messaging"
import { incrementMissionGenerates } from "~lib/missions"
import type { Mode, OutputLength, Platform, Tone } from "~lib/prompts"
import { generateReply } from "~lib/replyGeneration"
import { getOrBuildStyleProfile } from "~lib/styleProfile"
import type { AmintaStore, TemplateMode } from "~lib/storage"
import type { RunTemplateContext } from "~lib/templates"
import { C } from "~lib/theme"
import { incrementGenerations } from "~lib/xp"

import OutputCard from "~components/OutputCard"
import TemplatesModal from "~components/TemplatesModal"
import { Sprite } from "~components/ui"

// ─── Mode config ───────────────────────────────────────────────────────────────

const MODE_CONFIG: { id: Mode; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    id: "tweet",
    label: "Post",
    sub: "Create a new post",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    id: "reply",
    label: "Reply",
    sub: "Reply to someone",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "polish",
    label: "Polish",
    sub: "Improve your draft",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
]

// X is the only supported platform — kept as an explicit constant (rather
// than React state) purely so call sites that still expect a `Platform`
// value (buildMessages, readActivePost, OutputCard, template run context)
// don't need a separate single-value special case.
const PLATFORM: Platform = "x"

// ─── Tone config ──────────────────────────────────────────────────────────────

const TONE_CONFIG: { id: Tone; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: "direct",
    label: "Direct",
    desc: "Short. Clear.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    id: "witty",
    label: "Witty",
    desc: "Clever. Playful.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="9" cy="10.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10.5" r="1" fill="currentColor" stroke="none" />
        <path d="M8.5 15 Q12 17.5 15.5 15" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "analytical",
    label: "Analytical",
    desc: "Logical. Data.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 20V14" />
        <path d="M10 20V8" />
        <path d="M15 20V11" />
        <path d="M20 20V4" />
        <path d="M2 20h20" />
      </svg>
    ),
  },
  {
    id: "inspiring",
    label: "Inspiring",
    desc: "Bold. Vision.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l2.2 5.6 5.8 1.9-4.3 4 1 5.9L12 16.5l-4.7 2.9 1-5.9-4.3-4 5.8-1.9L12 2z"
          stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="4.5" cy="19.5" r="1.1" fill="currentColor" opacity="0.45" />
        <circle cx="19.5" cy="5" r="0.9" fill="currentColor" opacity="0.45" />
      </svg>
    ),
  },
]

// ─── Length config ────────────────────────────────────────────────────────────

const LENGTH_CONFIG: { id: OutputLength; label: string; desc: string }[] = [
  { id: "short",  label: "Short",  desc: "1 sentence"   },
  { id: "medium", label: "Medium", desc: "2 paragraphs" },
  { id: "long",   label: "Long",   desc: "3 paragraphs" },
]

// ─── Placeholder map ─────────────────────────────────────────────────────────

const TOPIC_PLACEHOLDER: Record<Mode, string> = {
  tweet:  "A topic, angle, or spark…",
  reply:  "Paste the tweet you're replying to…",
  polish: "Paste your rough draft…",
}

// ─── Header speech bubble ─────────────────────────────────────────────────────

function HeaderBubble({ text }: { text: string }) {
  return (
    <div className="relative ml-2">
      <div
        className="px-2.5 py-2 text-[9.5px] font-medium leading-snug"
        style={{
          background: "#fff",
          border: "2px solid #000",
          boxShadow: "2px 2px 0 #000",
          color: "#000",
          maxWidth: 90,
        }}>
        {text}
      </div>
      <svg
        width="8" height="10" viewBox="0 0 8 10"
        style={{ position: "absolute", left: -7, top: 10, imageRendering: "pixelated" }}>
        <polygon points="8,0 8,10 0,5" fill="#000" />
        <polygon points="8,2 8,8 2,5" fill="#fff" />
      </svg>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  store: AmintaStore
  onTeach?: () => void
  onOpenSettings?: () => void
  onContext?: (event: CompanionEvent) => void
  onTemplatesChanged?: () => void
}

// Resize image to max 1024px on longest side and return as JPEG data URL
async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1024
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

export default function GeneratorPanel({ store, onTeach, onOpenSettings, onContext, onTemplatesChanged }: Props) {
  const [mode,     setMode]     = useState<Mode>("tweet")
  const [tone,     setTone]     = useState<Tone>("direct")
  const [length,   setLength]   = useState<OutputLength>("medium")
  const [hoveredTone, setHoveredTone] = useState<Tone | null>(null)
  const [topic,    setTopic]    = useState("")
  const [context,  setContext]  = useState("")
  const [output,   setOutput]   = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")
  const [genKey,   setGenKey]   = useState(0)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [outputImage, setOutputImage]   = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  // Images pulled from the post being replied to (distinct from
  // `imageDataUrl`, which is a user-uploaded photo for tweet mode) — see
  // pull() and lib/replyGeneration.ts.
  const [postImageUrls, setPostImageUrls]   = useState<string[]>([])
  const [analyzingImage, setAnalyzingImage] = useState(false)

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templatesPrefill, setTemplatesPrefill] = useState<{ content: string; mode: TemplateMode } | undefined>(undefined)

  const xp   = store.xp ?? 0
  const tint = getStageTint(xp)

  const FREE_DAILY_LIMIT = 5
  // aiIncluded, not hasProAccess() — hasProAccess() only knows plan==='pro'/
  // 'lifetime', so a gifted user (plan stays 'free', entitled via
  // ai_included_override) would otherwise get capped at the free daily
  // limit and never reach the 60/day Included AI quota the backend already
  // grants them. aiIncluded is synced straight from the backend's own
  // aiIncluded() and correctly covers pro/lifetime/gifted alike (see
  // lib/entitlements.ts's shouldUseIncludedAi header comment). Deliberately
  // NOT shouldUseIncludedAi(store) — this is the plan-level "unlimited
  // generations" perk, which should still apply even if the user has
  // switched providerMode to BYOK.
  const isFree = !store.aiIncluded
  const todayGenerations = store.missionDate === todayLocal() ? (store.missionGenerates ?? 0) : 0
  const atFreeLimit = isFree && todayGenerations >= FREE_DAILY_LIMIT

  const reset = () => { setError(""); setOutput(""); setOutputImage(null) }

  const pull = async () => {
    setError("")
    const res = await readActivePost(PLATFORM)
    if (res.ok) {
      if (res.text) setTopic(res.text)
      setPostImageUrls(res.imageUrls ?? [])
    } else {
      setError(res.error ?? "Couldn't read the post.")
    }
  }

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return }
    try {
      const dataUrl = await resizeImage(file)
      setImageDataUrl(dataUrl)
      setError("")
    } catch {
      setError("Couldn't load image.")
    }
  }

  const removeImage = () => {
    setImageDataUrl(null)
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  // Built lazily, right before a template is actually used — StyleProfile is
  // only fetched here (Exact/Fill templates never need it, so they never pay
  // for it), and the combined topic/context mirrors the normal generate() input.
  const getTemplateRunContext = async (): Promise<RunTemplateContext> => {
    const combined = topic.trim() + (context.trim() ? `\n\nAdditional context: ${context.trim()}` : "")
    const styleProfile = await getOrBuildStyleProfile(store)
    return {
      apiKey: store.apiKey,
      model: store.model,
      voice: store.voice,
      styleProfile,
      platform: PLATFORM,
      mode,
      tone,
      length,
      topic: combined || "Write a post about this.",
    }
  }

  const openSaveAsTemplate = (draftText: string) => {
    setTemplatesPrefill({ content: draftText, mode: "exact" })
    setTemplatesOpen(true)
  }

  const generate = async () => {
    reset()
    if (!navigator.onLine) { setError("You're offline. Check your connection and try again."); return }
    if (!store.apiKey && !shouldUseIncludedAi(store)) { setError("Add your AI key in Settings first."); return }
    if (!store.voice)  { setError("Teach Aminta your voice first. Go to Teach."); return }
    const combined = topic.trim() + (context.trim() ? `\n\nAdditional context: ${context.trim()}` : "")
    const hasPostImages = mode === "reply" && postImageUrls.length > 0
    if (!combined && !imageDataUrl && !hasPostImages) { setError("Give Aminta something to work with."); return }
    setLoading(true)
    onContext?.("generate_start")
    try {
      const styleProfile = await getOrBuildStyleProfile(store)

      // Reply to a post with attached images — routes through the
      // image-aware orchestrator (lib/replyGeneration.ts), which decides
      // whether the provider supports vision, fetches/converts the images,
      // and falls back to a normal text-only reply on any failure. The
      // generateText/generateFromImages deps below ignore the pre-built
      // `messages` array replyGeneration.ts passes them and instead close
      // over the structured fields already in scope here — for Included-AI
      // users that means the backend rebuilds the prompt itself server-side
      // (never trusting a client-built prompt string) rather than being
      // handed replyGeneration.ts's local buildMessages() output.
      if (hasPostImages) {
        setAnalyzingImage(true)
        const result = await generateReply(
          store.apiKey, store.model, store.voice, combined, postImageUrls,
          styleProfile, tone, length,
          {
            isGroqKey,
            fetchImageAsDataUrl,
            generateText: (apiKey, model, messages) =>
              shouldUseIncludedAi(store)
                ? backendGenerate({ generationMode: "reply", input: combined, voice: store.voice!, styleProfile, tone, length })
                : runAI(apiKey, model, messages),
            generateFromImages: (apiKey, model, messages, images) =>
              shouldUseIncludedAi(store)
                ? backendGenerate({ generationMode: "reply", input: combined, voice: store.voice!, styleProfile, tone, length, images, hasImages: true })
                : generateFromImage(apiKey, model, messages, images),
          }
        )
        setOutput(result.text)
        setOutputImage(null)
        setGenKey(k => k + 1)
        await incrementGenerations()
        await incrementMissionGenerates()
        onContext?.("generate_end")
        return
      }

      const topicInput = combined || "Write a post about this image."
      const text = await dispatchGenerate(store, {
        generationMode: mode,
        input: topicInput,
        voice: store.voice,
        styleProfile,
        tone,
        length,
        images: imageDataUrl ? [imageDataUrl] : undefined,
      })
      setOutput(text)
      setOutputImage(imageDataUrl)
      setGenKey(k => k + 1)
      await incrementGenerations()
      await incrementMissionGenerates()
      onContext?.("generate_end")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
      onContext?.("api_error")
    } finally {
      setLoading(false)
      setAnalyzingImage(false)
    }
  }

  const canGenerate = (!!store.apiKey || shouldUseIncludedAi(store)) && !!store.voice && (!!topic.trim() || !!imageDataUrl || postImageUrls.length > 0) && !atFreeLimit
  const topicLabel =
    mode === "reply"  ? "Who are we replying to?" :
    mode === "polish" ? "Your draft"               :
                        "What's this about?"

  return (
    // Overrides the --mint CSS var (used by .input-pixel:focus in style.css)
    // to the current evolution tint, just within this panel — everything
    // else here (mode circles, tone card, Generate button) already themes
    // to `tint`, so the textarea focus ring was the one thing still hardcoded
    // to mint regardless of level/color. Scoped locally so Settings/Train/
    // Templates keep the real mint default.
    <div className="space-y-4 pb-4" style={{ "--mint": tint } as React.CSSProperties}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2 pt-1">
        <h2 className="flex-1 text-[16px] font-semibold text-white leading-snug">
          What are we<br />creating today?
        </h2>
        <div className="flex items-start gap-0 shrink-0">
          <div style={{ marginTop: 6 }}>
            <Sprite xp={xp} size={56} float />
          </div>
          <HeaderBubble text="I'll help make it great." />
        </div>
      </div>

      {/* ── Mode + Templates, icon-only circular buttons in a row ── */}
      <div className="flex items-center justify-between px-2">
        {MODE_CONFIG.map((m) => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              onClick={() => { if (mode !== m.id) { setMode(m.id); reset(); setPostImageUrls([]) } }}
              title={m.label}
              className="flex items-center justify-center rounded-full transition-all"
              style={{
                width: 48,
                height: 48,
                backgroundColor: active ? tint : C.card,
                border: `1.5px solid ${active ? tint : C.border}`,
                color: active ? "#000" : C.textFaint,
              }}>
              {m.icon}
            </button>
          )
        })}
        <button
          onClick={() => { setTemplatesPrefill(undefined); setTemplatesOpen(true) }}
          title="Templates"
          className="flex items-center justify-center rounded-full transition-colors"
          style={{ width: 48, height: 48, backgroundColor: C.card, border: `1.5px solid ${C.border}`, color: C.textFaint }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
      </div>

      {/* ── Image upload ── (hidden for Groq keys — Groq has no vision support) */}
      {mode === "tweet" && !isGroqKey(store.apiKey ?? "") && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>
            Photo{" "}
            <span style={{ color: C.textGhost, fontWeight: 400 }}>(optional, AI will write about it)</span>
          </p>
          {imageDataUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-line/50">
              <img src={imageDataUrl} alt="Selected" className="w-full max-h-28 object-cover" />
              <button
                onClick={removeImage}
                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => imageInputRef.current?.click()}
              className="w-full rounded-xl py-3 text-[11px] font-medium border-dashed transition-colors flex items-center justify-center gap-2"
              style={{ border: `1.5px dashed ${C.border}`, color: C.textFaint }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageFile(f) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              Add photo
            </button>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }}
          />
        </div>
      )}

      {/* ── Topic input ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>{topicLabel}</p>
        <div className="relative">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder={TOPIC_PLACEHOLDER[mode]}
            className="input-pixel w-full rounded-xl px-3 py-2.5 text-sm resize-none"
            style={{ paddingBottom: "22px" }}
          />
          <span className="absolute bottom-2 right-3 text-[9px]" style={{ color: C.textGhost }}>
            {topic.length} / 120
          </span>
        </div>
        {mode === "reply" && (
          <button
            onClick={pull}
            className="w-full rounded-lg py-2 text-[11px] font-medium transition-colors"
            style={{ border: `1px solid ${C.border}`, color: C.textFaint }}>
            ↑ Pull from page
          </button>
        )}
        {mode === "reply" && postImageUrls.length > 0 && (
          <p className="text-[10px] animate-fade-in" style={{ color: tint }}>
            {postImageUrls.length} image{postImageUrls.length > 1 ? "s" : ""} found on this post — Aminta will look at {postImageUrls.length > 1 ? "them" : "it"} too.
          </p>
        )}
      </div>

      {/* ── Context input ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>
          {mode === "polish" ? "Polishing instructions" : "Additional context"}{" "}
          <span style={{ color: C.textGhost, fontWeight: 400 }}>(optional)</span>
        </p>
        <div className="relative">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            placeholder={mode === "polish" ? "e.g. make it punchier, add a hook…" : "Add key points, ideas, or notes…"}
            className="input-pixel w-full rounded-xl px-3 py-2.5 text-sm resize-none"
            style={{ paddingBottom: "22px" }}
          />
          <span className="absolute bottom-2 right-3 text-[9px]" style={{ color: C.textGhost }}>
            {context.length} / 300
          </span>
        </div>
      </div>

      {/* ── Tone ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>Tone</p>
        <div className="grid grid-cols-4 gap-1.5">
          {TONE_CONFIG.map((t) => {
            const active  = tone === t.id
            const hovered = hoveredTone === t.id && !active
            return (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                onMouseEnter={() => setHoveredTone(t.id)}
                onMouseLeave={() => setHoveredTone(null)}
                className="flex flex-col items-center gap-1.5 pt-3 pb-2.5 px-1 rounded-xl"
                style={{
                  backgroundColor: active ? tint + "14" : C.card,
                  border: `1.5px solid ${active ? tint : hovered ? tint + "55" : C.border}`,
                  transform: active ? "translateY(-2px)" : hovered ? "scale(1.02)" : "none",
                  boxShadow: active ? `0 4px 18px ${tint}22, 0 2px 6px rgba(0,0,0,0.35)` : "none",
                  transition: "transform 0.13s ease, box-shadow 0.13s ease, border-color 0.13s ease, background-color 0.13s ease",
                }}>
                <span style={{
                  color: active ? "#fff" : hovered ? tint + "cc" : C.textDim,
                  transition: "color 0.13s ease",
                  lineHeight: 1,
                }}>
                  {t.icon}
                </span>
                <span
                  className="font-semibold text-[10px] leading-none"
                  style={{ color: active ? tint : hovered ? C.text : C.textDim }}>
                  {t.label}
                </span>
                <span
                  className="text-[8px] leading-none"
                  style={{ color: active ? tint + "cc" : C.textFaint }}>
                  {t.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Length ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>Length</p>
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.border}` }}>
          {LENGTH_CONFIG.map((l, i) => {
            const active = length === l.id
            return (
              <button
                key={l.id}
                onClick={() => setLength(l.id)}
                className="flex-1 flex items-center justify-center py-2.5 transition-all"
                style={{
                  backgroundColor: active ? tint + "18" : "transparent",
                  borderRight: i < LENGTH_CONFIG.length - 1 ? `1px solid ${C.border}` : undefined,
                  color: active ? tint : C.textGhost,
                }}>
                <span className="text-[10px] font-semibold" style={{ color: active ? tint : C.textDim }}>
                  {l.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Generate ── */}
      <button
        onClick={generate}
        disabled={loading || !canGenerate}
        className={`btn-pixel w-full rounded-xl py-3.5 font-pixel text-[10px] text-black transition-opacity ${
          loading ? "cursor-wait opacity-80" : !canGenerate ? "opacity-40 cursor-not-allowed" : ""
        }`}
        style={{ backgroundColor: tint }}>
        {analyzingImage ? "Analyzing image…" : loading ? (
          <span className="dot-wave flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-black/60" />
            <span className="w-1.5 h-1.5 rounded-full bg-black/60" />
            <span className="w-1.5 h-1.5 rounded-full bg-black/60" />
          </span>
        ) : "Generate"}
      </button>

      {/* Free-plan usage counter — visible before the wall, not only at it */}
      {!loading && isFree && !atFreeLimit && !!store.apiKey && !!store.voice && (
        <p className="text-[10px] text-center animate-fade-in" style={{ color: C.textGhost }}>
          {todayGenerations}/{FREE_DAILY_LIMIT} free generations used today
        </p>
      )}

      {/* Explain why Generate is disabled */}
      {!loading && atFreeLimit && (
        <div className="animate-fade-in rounded-xl px-4 py-3 space-y-2" style={{ backgroundColor: tint + "12", border: `1px solid ${tint}30` }}>
          <p className="font-pixel text-[8px]" style={{ color: tint }}>
            {FREE_DAILY_LIMIT}/{FREE_DAILY_LIMIT} free generations used today
          </p>
          <p className="text-[11px] leading-snug" style={{ color: C.textFaint }}>
            Come back tomorrow for more free generations.
          </p>
        </div>
      )}
      {!loading && !atFreeLimit && !store.apiKey && !shouldUseIncludedAi(store) && (
        <p className="text-[11px] animate-fade-in px-1" style={{ color: C.textFaint }}>
          Add your AI key in{" "}
          <button onClick={onOpenSettings} className="underline" style={{ color: C.text }}>Settings</button>
          {" "}to start generating.
        </p>
      )}
      {!loading && !atFreeLimit && (!!store.apiKey || shouldUseIncludedAi(store)) && !store.voice && (
        <p className="text-[11px] animate-fade-in px-1" style={{ color: C.textFaint }}>
          Go to{" "}
          <button onClick={onTeach} className="underline" style={{ color: C.text }}>Train</button>
          {" "}to teach Aminta your voice first.
        </p>
      )}

      {error && <p className="text-[11px] text-red-400 animate-fade-in px-1">{error}</p>}

      {output && (
        <OutputCard
          key={genKey}
          text={output}
          mode={mode}
          platform={PLATFORM}
          imageDataUrl={outputImage}
          onRegenerate={generate}
          onSaveAsTemplate={openSaveAsTemplate}
        />
      )}

      {templatesOpen && (
        <TemplatesModal
          store={store}
          onClose={() => { setTemplatesOpen(false); setTemplatesPrefill(undefined) }}
          onChanged={onTemplatesChanged}
          getRunContext={getTemplateRunContext}
          initialView={templatesPrefill ? "editor" : "list"}
          prefill={templatesPrefill}
        />
      )}

    </div>
  )
}

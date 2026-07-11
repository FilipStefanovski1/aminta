import { useEffect, useRef, useState } from "react"

import { generate as runAI, generateFromImage, isGroqKey } from "~lib/ai"
import type { CompanionEvent } from "~lib/companion"
import { todayLocal } from "~lib/dates"
import { getStageTint } from "~lib/evolution"
import { readActivePost } from "~lib/messaging"
import { incrementMissionGenerates } from "~lib/missions"
import { buildMessages, type Mode, type OutputLength, type Platform, type Tone } from "~lib/prompts"
import type { AmintaStore } from "~lib/storage"
import { C } from "~lib/theme"
import { incrementGenerations } from "~lib/xp"

import OutputCard from "~components/OutputCard"
import { Sprite } from "~components/ui"

// ─── Platform icons ────────────────────────────────────────────────────────────

function LinkedInIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.213 5.567 5.95-5.567zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function ThreadsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 192 192" fill="currentColor">
      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1406 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" />
    </svg>
  )
}

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

// ─── Platform config ──────────────────────────────────────────────────────────

const PLATFORM_CONFIG: { id: Platform; label: string; icon: React.ReactNode; locked?: boolean }[] = [
  { id: "linkedin", label: "LinkedIn",    icon: <LinkedInIcon />, locked: true },
  { id: "x",        label: "X (Twitter)", icon: <XIcon /> },
  { id: "threads",  label: "Threads",     icon: <ThreadsIcon />, locked: true },
]

function LockIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

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
  { id: "short",  label: "Short",  desc: "Tight. Punchy." },
  { id: "medium", label: "Medium", desc: "Balanced."      },
  { id: "long",   label: "Long",   desc: "Developed."     },
]

// ─── Placeholder map ─────────────────────────────────────────────────────────

const TOPIC_PLACEHOLDER: Record<Platform, Record<Mode, string>> = {
  x: {
    tweet:  "A topic, angle, or spark…",
    reply:  "Paste the tweet you're replying to…",
    polish: "Paste your rough draft…",
  },
  linkedin: {
    tweet:  "e.g. AI tools, personal branding, growth…",
    reply:  "Paste the LinkedIn post you're commenting on…",
    polish: "Paste your draft…",
  },
  threads: {
    tweet:  "A topic, angle, or spark…",
    reply:  "Paste the post you're replying to…",
    polish: "Paste your rough draft…",
  },
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
  onXPAwarded: () => void
  onLevelUp: (level: number, stage: string) => void
  onFirstPost?: (amount: number) => void
  initialPlatform?: Platform
  onTeach?: () => void
  onOpenSettings?: () => void
  onContext?: (event: CompanionEvent) => void
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

export default function GeneratorPanel({ store, onXPAwarded, onLevelUp, onFirstPost, initialPlatform = "x", onTeach, onOpenSettings, onContext }: Props) {
  const [platform, setPlatform] = useState<Platform>(initialPlatform)
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

  useEffect(() => {
    setPlatform(initialPlatform)
  }, [initialPlatform])

  const xp   = store.xp ?? 0
  const tint = getStageTint(xp)

  const FREE_DAILY_LIMIT = 5
  const isFree = (store.plan ?? "free") === "free"
  const todayGenerations = store.missionDate === todayLocal() ? (store.missionGenerates ?? 0) : 0
  const atFreeLimit = isFree && todayGenerations >= FREE_DAILY_LIMIT

  const reset = () => { setError(""); setOutput(""); setOutputImage(null) }

  const pull = async () => {
    setError("")
    const res = await readActivePost(platform)
    if (res.ok && res.text) setTopic(res.text)
    else setError(res.error ?? "Couldn't read the post.")
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

  const generate = async () => {
    reset()
    if (!navigator.onLine) { setError("You're offline — check your connection and try again."); return }
    if (!store.apiKey) { setError("Add your AI key in Settings first."); return }
    if (!store.voice)  { setError("Teach Aminta your voice first — go to Teach."); return }
    const combined = topic.trim() + (context.trim() ? `\n\nAdditional context: ${context.trim()}` : "")
    if (!combined && !imageDataUrl) { setError("Give Aminta something to work with."); return }
    setLoading(true)
    onContext?.("generate_start")
    try {
      const topicInput = combined || "Write a post about this image."
      const messages = buildMessages(platform, mode, store.voice, topicInput, store.tweetDNA ?? [], tone, length)
      const text = imageDataUrl
        ? await generateFromImage(store.apiKey, store.model, messages, imageDataUrl)
        : await runAI(store.apiKey, store.model, messages)
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
    }
  }

  const canGenerate = !!store.apiKey && !!store.voice && (!!topic.trim() || !!imageDataUrl) && !atFreeLimit
  const topicLabel =
    mode === "reply"  ? "Who are we replying to?" :
    mode === "polish" ? "Your draft"               :
                        "What's this about?"

  return (
    <div className="space-y-4 pb-4">

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

      {/* ── Mode cards ── */}
      <div className="grid grid-cols-3 gap-2">
        {MODE_CONFIG.map((m) => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              onClick={() => { if (mode !== m.id) { setMode(m.id); reset() } }}
              className="flex flex-col items-start gap-1.5 rounded-xl p-3 text-left transition-all"
              style={{
                backgroundColor: active ? tint : C.card,
                border: `1.5px solid ${active ? tint : C.border}`,
                color: active ? "#000" : C.text,
              }}>
              <span style={{ color: active ? "#000" : C.textFaint, lineHeight: 1 }}>{m.icon}</span>
              <span className="font-semibold text-[11px]">{m.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Image upload ── (hidden for Groq keys — Groq has no vision support) */}
      {mode === "tweet" && !isGroqKey(store.apiKey ?? "") && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>
            Photo{" "}
            <span style={{ color: C.textGhost, fontWeight: 400 }}>(optional — AI will write about it)</span>
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

      {/* ── Platform pills ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>Platform</p>
        <div className="flex gap-2">
          {PLATFORM_CONFIG.map((p) => {
            const active = platform === p.id
            return (
              <button
                key={p.id}
                onClick={p.locked ? undefined : () => { setPlatform(p.id); reset() }}
                disabled={p.locked}
                title={p.locked ? "Coming soon" : undefined}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-1 justify-center transition-all text-[10px] font-medium"
                style={{
                  border: `1.5px solid ${active ? tint : C.border}`,
                  backgroundColor: active ? tint + "18" : C.card,
                  color: p.locked ? C.textGhost : active ? tint : C.textDim,
                  cursor: p.locked ? "not-allowed" : "pointer",
                  opacity: p.locked ? 0.55 : 1,
                }}>
                <span style={{ color: active ? tint : C.textGhost }}>{p.icon}</span>
                <span>{p.label}</span>
                {p.locked && <LockIcon />}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Topic input ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>{topicLabel}</p>
        <div className="relative">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder={TOPIC_PLACEHOLDER[platform][mode]}
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
                className="flex-1 flex flex-col items-center gap-0.5 py-2 transition-all"
                style={{
                  backgroundColor: active ? tint + "18" : "transparent",
                  borderRight: i < LENGTH_CONFIG.length - 1 ? `1px solid ${C.border}` : undefined,
                  color: active ? tint : C.textGhost,
                }}>
                <span className="text-[10px] font-semibold" style={{ color: active ? tint : C.textDim }}>
                  {l.label}
                </span>
                <span className="text-[8px]" style={{ color: active ? tint + "cc" : C.textFaint }}>
                  {l.desc}
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
        {loading ? (
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
      {!loading && !atFreeLimit && !store.apiKey && (
        <p className="text-[11px] animate-fade-in px-1" style={{ color: C.textFaint }}>
          Add your AI key in{" "}
          <button onClick={onOpenSettings} className="underline" style={{ color: C.text }}>Settings</button>
          {" "}to start generating.
        </p>
      )}
      {!loading && !atFreeLimit && store.apiKey && !store.voice && (
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
          platform={platform}
          currentXP={xp}
          imageDataUrl={outputImage}
          onRegenerate={generate}
          onXPAwarded={(amount, levelUp, firstPost) => {
            onXPAwarded()
            if (levelUp) onLevelUp(levelUp.level, levelUp.stage)
            else if (firstPost) onFirstPost?.(amount)
          }}
        />
      )}

    </div>
  )
}

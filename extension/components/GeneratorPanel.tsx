import { useState } from "react"

import { generate as runAI } from "~lib/ai"
import { getStageTint } from "~lib/evolution"
import { readActivePost } from "~lib/messaging"
import { incrementMissionGenerates } from "~lib/missions"
import { buildMessages, type Mode, type Platform } from "~lib/prompts"
import type { AmintaStore } from "~lib/storage"
import { C } from "~lib/theme"
import { incrementGenerations } from "~lib/xp"

import OutputCard from "~components/OutputCard"
import { Sprite } from "~components/ui"

// ─── Labels ────────────────────────────────────────────────────────────────

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "x",        label: "X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "threads",  label: "Threads" },
]

const MODES: Mode[] = ["tweet", "reply", "polish"]

// What each platform+mode is called, in the user's words.
const NOUN: Record<Platform, Record<Mode, string>> = {
  x:        { tweet: "Tweet",         reply: "Reply",   polish: "Polish" },
  linkedin: { tweet: "Post",          reply: "Comment", polish: "Polish" },
  threads:  { tweet: "Post",          reply: "Reply",   polish: "Polish" },
}

const CTA: Record<Platform, Record<Mode, string>> = {
  x:        { tweet: "Write Tweet",   reply: "Write Reply",   polish: "Polish Tweet" },
  linkedin: { tweet: "Write Post",    reply: "Write Comment", polish: "Polish Post" },
  threads:  { tweet: "Write Post",    reply: "Write Reply",   polish: "Polish Post" },
}

const PROMPT: Record<Mode, string> = {
  tweet:  "what should we post?",
  reply:  "who are we replying to?",
  polish: "paste your draft.",
}

const PLACEHOLDER: Record<Platform, Record<Mode, string>> = {
  x: {
    tweet:  "A topic, angle or spark…",
    reply:  "Paste the tweet you're replying to…",
    polish: "Paste your rough draft…",
  },
  linkedin: {
    tweet:  "A topic or story angle…",
    reply:  "Paste the post you're commenting on…",
    polish: "Paste your draft…",
  },
  threads: {
    tweet:  "A topic, angle or spark…",
    reply:  "Paste the post you're replying to…",
    polish: "Paste your rough draft…",
  },
}

// ─── Segmented control ───────────────────────────────────────────────────────

function Segmented<T extends string>({
  options,
  value,
  onChange,
  tint,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  tint: string
}) {
  return (
    <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
      {options.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className="flex-1 py-2 rounded-lg font-pixel text-[7px] transition-all"
            style={{
              backgroundColor: active ? tint : "transparent",
              color: active ? "#000" : C.textFaint,
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  store: AmintaStore
  onXPAwarded: () => void
  onLevelUp: (level: number, stage: string) => void
  initialPlatform?: Platform
}

export default function GeneratorPanel({ store, onXPAwarded, onLevelUp, initialPlatform = "x" }: Props) {
  const [platform, setPlatform] = useState<Platform>(initialPlatform)
  const [mode,     setMode]     = useState<Mode>("tweet")
  const [input,    setInput]    = useState("")
  const [output,   setOutput]   = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")
  const [genKey,   setGenKey]   = useState(0)

  const xp   = store.xp ?? 0
  const tint = getStageTint(xp)

  const reset = () => { setError(""); setOutput("") }
  const switchPlatform = (p: Platform) => { if (p !== platform) { setPlatform(p); reset() } }
  const switchMode     = (m: Mode)     => { if (m !== mode)     { setMode(m); reset() } }

  const pull = async () => {
    setError("")
    const res = await readActivePost(platform)
    if (res.ok && res.text) setInput(res.text)
    else setError(res.error ?? "Couldn't read the post.")
  }

  const generate = async () => {
    reset()
    if (!store.apiKey) { setError("Add your AI key in Settings first."); return }
    if (!store.voice)  { setError("Teach Aminta your voice first — go to Teach."); return }
    if (!input.trim()) { setError("Give Aminta something to work with."); return }
    setLoading(true)
    try {
      const messages = buildMessages(platform, mode, store.voice, input, store.tweetDNA ?? [])
      const text = await runAI(store.apiKey, store.model, messages)
      setOutput(text)
      setGenKey(k => k + 1)
      await incrementGenerations()
      await incrementMissionGenerates()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  const canGenerate = !!store.apiKey && !!store.voice && !!input.trim()
  const isReply = mode === "reply"

  return (
    <div className="space-y-3 pb-4">

      {/* ── Aminta presence ── */}
      <div className="flex items-center gap-3 px-1">
        <Sprite xp={xp} size={40} float />
        <p className="font-pixel text-[9px]" style={{ color: C.text }}>{PROMPT[mode]}</p>
      </div>

      {/* ── Platform ── */}
      <Segmented options={PLATFORMS} value={platform} onChange={switchPlatform} tint={tint} />

      {/* ── Mode ── */}
      <Segmented
        options={MODES.map(m => ({ id: m, label: NOUN[platform][m] }))}
        value={mode}
        onChange={switchMode}
        tint={tint}
      />

      {/* ── Input ── */}
      <div className="space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder={PLACEHOLDER[platform][mode]}
          className="input-pixel w-full rounded-xl px-3 py-3 text-sm resize-none"
        />
        {isReply && (
          <button
            onClick={pull}
            className="w-full rounded-lg py-2 font-pixel text-[7px] transition-colors"
            style={{ border: `1px solid ${C.border}`, color: C.textFaint }}>
            ↑ Pull from {platform === "linkedin" ? "LinkedIn" : "X"}
          </button>
        )}
      </div>

      {/* ── Generate ── */}
      <button
        onClick={generate}
        disabled={loading || !canGenerate}
        className={`btn-pixel w-full rounded-xl py-3 font-pixel text-[9px] text-black transition-opacity ${
          loading ? "cursor-wait opacity-80" : !canGenerate ? "opacity-40 cursor-not-allowed" : ""
        }`}
        style={{ backgroundColor: tint }}>
        {loading ? (
          <span className="dot-wave flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-black/60" />
            <span className="w-1.5 h-1.5 rounded-full bg-black/60" />
            <span className="w-1.5 h-1.5 rounded-full bg-black/60" />
          </span>
        ) : `${CTA[platform][mode]} →`}
      </button>

      {error && <p className="text-[11px] text-red-400 animate-fade-in px-1">{error}</p>}

      {output && (
        <OutputCard
          key={genKey}
          text={output}
          mode={mode}
          platform={platform}
          currentXP={xp}
          onXPAwarded={(amount, levelUp) => { onXPAwarded(); if (levelUp) onLevelUp(levelUp.level, levelUp.stage) }}
        />
      )}

    </div>
  )
}

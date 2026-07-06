import { useEffect, useRef, useState } from "react"

import "~style.css"

import { GOOGLE_MODELS, GROQ_MODELS, OPENROUTER_MODELS, SELECT_STYLE } from "~components/ApiKeyForm"
import DemonMascot from "~components/DemonMascot"
import GeneratorPanel from "~components/GeneratorPanel"
import CompanionPage from "~components/CompanionPage"
import HomeTab from "~components/HomeTab"
import LoginScreen from "~components/LoginScreen"
import SetupGate from "~components/SetupGate"
import VoiceProfileForm from "~components/VoiceProfileForm"
import { FORMS, getForm, getLevel, getLevelSpan, getStageTint, getXpInLevel, getXpProgress, getNextStage } from "~lib/evolution"
import { isGoogleKey, isGroqKey, GROQ_DEFAULT, DEPRECATED_GROQ_IDS } from "~lib/ai"
import { C } from "~lib/theme"
import { SpriteMark, XPBar } from "~components/ui"
import { getStore, setStore, type AmintaStore } from "~lib/storage"
import { getAuthSession, clearAuthSession, type AuthSession } from "~lib/auth"
import { pullFromCloud, pushToCloud } from "~lib/sync"
import type { Platform } from "~lib/prompts"
import { useCompanion } from "~hooks/useCompanion"

type Tab = "home" | "create" | "train"

function detectPlatform(url: string): Platform {
  if (url.includes("linkedin.com")) return "linkedin"
  if (url.includes("threads.net"))  return "threads"
  return "x"
}

// ─── Level-up modal ───────────────────────────────────────────────────────────

interface LevelUpData { level: number; stage: string }

// Pre-computed so particles are stable across re-renders
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  angle:  `${(i / 14) * 360}deg`,
  dist:   `${i % 2 === 0 ? 82 : 66}px`,
  size:   i % 3 === 0 ? 4 : 3,
  delay:  `${i * 0.028}s`,
  colorIdx: i % 5,
}))

function ParticleBurst({ tint }: { tint: string }) {
  const colors = [tint, "#74f7b5", "#fff", "#f5d060", "#3fe0c8"]
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: "inherit" }}>
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "38%",
            left: "50%",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: colors[p.colorIdx],
            animation: `particleFly 0.72s ease-out ${p.delay} both`,
            "--angle": p.angle,
            "--dist":  p.dist,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

const STAGE_DIALOGUE: Record<string, string> = {
  Curious:     "i'm starting to get you.",
  Happy:       "this feels good.",
  Excited:     "i want the next one.",
  Mischievous: "i've got tricks now.",
  Confident:   "i write like you on a good day.",
  Guardian:    "i've got your feed.",
  Mythic:      "few ever make it here.",
  Ascended:    "we've come a long way.",
}

function playLevelUpSound() {
  try {
    const ctx = new AudioContext()
    const freqs = [220, 330, 440, 660, 880]
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "square"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.09)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.18)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.09)
      osc.stop(ctx.currentTime + i * 0.09 + 0.2)
    })
  } catch { /* silent */ }
}

function LevelUpModal({ data, onDismiss }: { data: LevelUpData; onDismiss: () => void }) {
  const form     = FORMS[Math.min(data.level - 1, FORMS.length - 1)]
  const tint     = form.color
  const dialogue = STAGE_DIALOGUE[data.stage] ?? "growing stronger."

  // Typewriter — starts 220ms after mount so the card-in animation finishes first
  const [typed, setTyped] = useState("")
  useEffect(() => {
    setTyped("")
    const delay = setTimeout(() => {
      let i = 0
      const iv = setInterval(() => {
        i++
        setTyped(dialogue.slice(0, i))
        if (i >= dialogue.length) clearInterval(iv)
      }, 38)
      return () => clearInterval(iv)
    }, 220)
    return () => clearTimeout(delay)
  }, [dialogue])

  useEffect(() => { playLevelUpSound() }, [])

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85">
      <div
        className="animate-card-in mx-4 bg-[#242424] border-2 rounded-2xl p-6 text-center space-y-4 w-full max-w-[260px]"
        style={{ borderColor: tint + "55", position: "relative", overflow: "hidden" }}>
        <ParticleBurst tint={tint} />
        <p className="font-pixel text-[8px] uppercase tracking-widest" style={{ color: tint }}>Level Up</p>
        <div className="mx-auto sprite-react aminta-glow flex justify-center">
          <DemonMascot skin={form.skin} size={64} />
        </div>
        <div>
          <p className="font-pixel text-2xl text-white">Lv.{data.level}</p>
          <p className="font-pixel text-[8px] mt-1" style={{ color: tint }}>{data.stage}</p>
          <p className="text-[11px] text-[#666] mt-2 italic" style={{ minHeight: "1.4em" }}>
            {typed ? `"${typed}"` : " "}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="btn-pixel w-full py-2.5 rounded-xl font-pixel text-[9px] text-black"
          style={{ backgroundColor: tint }}>
          Keep Going →
        </button>
      </div>
    </div>
  )
}

// ─── Settings overlay ─────────────────────────────────────────────────────────

function SettingsOverlay({
  store,
  onSave,
  onClose,
  onResetOnboarding,
  session,
  onSignOut,
}: {
  store: AmintaStore
  onSave: (patch: Partial<AmintaStore>) => Promise<void>
  onClose: () => void
  onResetOnboarding: () => void
  session: AuthSession | null
  onSignOut: () => void
}) {
  // ── Plan ────────────────────────────────────────────────────────────────────
  const plan      = store.plan ?? "free"
  const planLabel = plan === "lifetime" ? "FOUNDER" : plan === "pro" ? "PRO" : "FREE"
  const planColor = plan === "lifetime" ? "#f5d060" : plan === "pro" ? "#74f7b5" : C.textGhost

  // ── Evolution data (read-only) ───────────────────────────────────────────────
  const xp        = store.xp ?? 0
  const form      = getForm(xp)
  const level     = getLevel(xp)
  const xpInLevel = getXpInLevel(xp)
  const levelSpan = getLevelSpan(xp)
  const progress  = getXpProgress(xp)
  const nextStage = getNextStage(xp)

  // ── AI / key state ──────────────────────────────────────────────────────────
  const [key,       setKey]       = useState(store.apiKey ?? "")
  const [model,     setModel]     = useState(store.model  ?? "")
  const [saving,    setSaving]    = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error,     setError]     = useState("")

  const isGoogle = isGoogleKey(key)
  const isGroq   = isGroqKey(key)
  const models   = isGoogle ? GOOGLE_MODELS : isGroq ? GROQ_MODELS : OPENROUTER_MODELS

  const providerName = isGroq ? "Groq" : isGoogle ? "Gemini" : "OpenRouter"
  const providerDot  = isGroq ? "#f97316" : isGoogle ? "#4a90d9" : "#a78bfa"
  const providerUrl  = isGroq
    ? "console.groq.com/keys"
    : isGoogle
      ? "aistudio.google.com/apikey"
      : "openrouter.ai/keys"

  const isDirty = key.trim() !== (store.apiKey ?? "") || model !== (store.model ?? "")

  useEffect(() => {
    if (!models.find(m => m.id === model)) setModel(models[0].id)
  }, [isGoogle, isGroq]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!key.trim()) { setError("Paste an API key first."); return }
    setError("")
    setSaving(true)
    const m = models.find(x => x.id === model)?.id ?? models[0].id
    await onSave({ apiKey: key.trim(), model: m })
    setSaving(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1400)
  }

  // Shared section label style — system font, readable, non-competing
  const sectionLabel = "text-[9px] uppercase tracking-[0.1em]"

  return (
    <div className="absolute inset-0 z-40 flex flex-col animate-slide-up" style={{ backgroundColor: C.bg }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <p className="font-pixel text-[9px]" style={{ color: C.text }}>Settings</p>
        <button onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors text-[13px]"
          style={{ color: C.textFaint }}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* ── ACCOUNT ── */}
        <section className="space-y-1.5">
          <p className={sectionLabel} style={{ color: "#666672" }}>Account</p>

          {session ? (
            <div className="rounded-xl px-3 py-2" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <p className="text-[12px] truncate leading-none" style={{ color: C.text }}>{session.email}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-pixel text-[6px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: planColor + "1a", color: planColor, border: `1px solid ${planColor}33` }}>
                    {planLabel}
                  </span>
                  <button onClick={onSignOut}
                    className="text-[10px] transition-colors text-[#888896] hover:text-red-400">
                    Sign out
                  </button>
                </div>
              </div>
              {plan === "free" && (
                <a href="https://amintaapp.com/#pricing" target="_blank" rel="noreferrer"
                  className="text-[10px] underline block mt-1.5" style={{ color: C.mint }}>
                  Upgrade to Pro →
                </a>
              )}
            </div>
          ) : (
            <p className="text-[12px] px-0.5" style={{ color: C.textFaint }}>Not signed in</p>
          )}
        </section>

        {/* ── YOUR AMINTA ── */}
        <section className="space-y-1.5">
          <p className={sectionLabel} style={{ color: "#666672" }}>Your Aminta</p>
          <div className="rounded-xl px-3 py-3" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              {/* Static soft glow — no pulse, idle float only */}
              <div className="sprite-float shrink-0" style={{ filter: `drop-shadow(0 0 8px ${form.color}30)` }}>
                <SpriteMark tint={form.color} size={30} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="font-pixel text-[8px]" style={{ color: form.color }}>{form.name}</p>
                  <p className="font-pixel text-[7px]" style={{ color: "#888896" }}>Lv. {level}</p>
                </div>
                <XPBar progress={progress} tint={form.color} />
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="font-pixel text-[7px]" style={{ color: "#888896" }}>{xpInLevel} / {levelSpan} XP</span>
                  {nextStage && <span className="text-[10px]" style={{ color: "#666672" }}>· next: {nextStage.name}</span>}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── AMINTA BRAIN ── dominant card: heavier border + elevated bg ── */}
        <section className="space-y-1.5">
          <p className={sectionLabel} style={{ color: "#666672" }}>Aminta Brain</p>

          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#262628", border: "1px solid #404048" }}>

            {/* API Key */}
            <div className="px-3.5 pt-3.5 pb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#888896" }}>
                  API Key
                </label>
                <span className="text-[9px]" style={{ color: "#888896" }}>
                  <span style={{ color: providerDot }}>●</span>{" "}{providerName}
                </span>
              </div>
              <input
                type="password"
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="gsk_…  ·  AIza…  ·  sk-or-…"
                className="input-pixel w-full rounded-lg px-3 py-2 text-[12px]"
              />
              <p className="text-[10px] mt-1.5 leading-none" style={{ color: "#666672" }}>
                {providerUrl} · stored locally
              </p>
            </div>

            <div style={{ height: 1, backgroundColor: C.borderSoft }} />

            {/* Model */}
            <div className="px-3.5 pt-3 pb-3.5">
              <label className="text-[9px] uppercase tracking-[0.06em] block mb-1.5" style={{ color: "#888896" }}>
                Model
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
          </div>

          {error && <p className="font-pixel text-[7px] text-red-400 px-0.5">{error}</p>}

          {/* Save — right-aligned, not full-width */}
          <div className="flex justify-end">
            <button
              onClick={isDirty && !saving ? save : undefined}
              className="py-1.5 px-4 rounded-lg font-pixel text-[8px] transition-all duration-150"
              style={{
                minWidth:        100,
                backgroundColor: isDirty ? C.mint : "transparent",
                color:           isDirty ? "#000" : justSaved ? C.mint : "#666672",
                border:          `1px solid ${isDirty ? "transparent" : justSaved ? C.mint + "55" : C.border}`,
                cursor:          isDirty ? "pointer" : "default",
              }}>
              {saving ? "Saving…" : isDirty ? "Save Changes" : "✓ Saved"}
            </button>
          </div>
        </section>

        {/* ── ADVANCED ── */}
        <section className="space-y-1.5">
          <p className={sectionLabel} style={{ color: "#666672" }}>Advanced</p>
          <button
            onClick={() => { onClose(); onResetOnboarding() }}
            className="flex items-center gap-2 text-[11px] transition-colors text-[#666672] hover:text-[#aaaaaa]">
            <span>↺</span>
            <span>Restart setup wizard</span>
          </button>
        </section>

      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2.5 flex items-center gap-3 shrink-0" style={{ borderTop: `1px solid ${C.border}` }}>
        <span className="text-[10px] text-[#555560]">v0.1</span>
        <span className="text-[10px] text-[#555560]">·</span>
        <a href="https://x.com/amintaapp" target="_blank" rel="noreferrer"
          className="text-[10px] text-[#555560] hover:text-white transition-colors">X</a>
        <span className="text-[10px] text-[#555560]">·</span>
        <a href="https://www.linkedin.com/company/amintaapp/" target="_blank" rel="noreferrer"
          className="text-[10px] text-[#555560] hover:text-white transition-colors">LinkedIn</a>
        <span className="text-[10px] text-[#555560]">·</span>
        <a href="https://amintaapp.com" target="_blank" rel="noreferrer"
          className="text-[10px] text-[#555560] hover:text-white transition-colors">Help</a>
      </div>

    </div>
  )
}

// ─── Bottom navigation ────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Tab; label: string; icon: () => React.ReactNode }[] = [
  {
    id: "home",
    label: "Home",
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 9L9 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 7.5V15h3v-4h2v4h3V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "create",
    label: "Create",
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M19.186 2.09c.521.25 1.136.612 1.625 1.101.49.49.852 1.104 1.1 1.625.313.654.11 1.408-.401 1.92l-7.214 7.213c-.31.31-.688.541-1.105.675l-4.222 1.353a.75.75 0 0 1-.943-.944l1.353-4.221a2.75 2.75 0 0 1 .674-1.105l7.214-7.214c.512-.512 1.266-.714 1.92-.402zm.211 2.516a3.608 3.608 0 0 0-.828-.586l-6.994 6.994a1.002 1.002 0 0 0-.178.241L9.9 14.102l2.846-1.496c.09-.047.171-.107.242-.178l6.994-6.994a3.61 3.61 0 0 0-.586-.828zM4.999 5.5A.5.5 0 0 1 5.47 5l5.53.005a1 1 0 0 0 0-2L5.5 3A2.5 2.5 0 0 0 3 5.5v12.577c0 .76.082 1.185.319 1.627.224.419.558.754.977.978.442.236.866.318 1.627.318h12.154c.76 0 1.185-.082 1.627-.318.42-.224.754-.559.978-.978.236-.442.318-.866.318-1.627V13a1 1 0 1 0-2 0v5.077c0 .459-.021.571-.082.684a.364.364 0 0 1-.157.157c-.113.06-.225.082-.684.082H5.923c-.459 0-.57-.022-.684-.082a.363.363 0 0 1-.157-.157c-.06-.113-.082-.225-.082-.684V5.5z"/>
      </svg>
    ),
  },
  {
    id: "train",
    label: "Train",
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 447 447" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(0 -540.36)">
          <g><g>
            <circle cx="152.38" cy="938.057" r="7.5"/>
            <path d="M211.18,671.06c22,0,39.9-18.5,39.9-41.1c0-21.6-18.3-39.9-39.9-39.9c-22.7,0-41.1,17.9-41.1,39.9C170.08,652.66,188.48,671.06,211.18,671.06z M211.18,605.06c13.3,0,24.9,11.6,24.9,24.9c0,14.1-11.4,26.1-24.9,26.1c-14.6,0-26.1-11.5-26.1-26.1C185.08,616.46,196.98,605.06,211.18,605.06z"/>
            <path d="M84.08,876.06L84.08,876.06c-1.9-3.7-6.4-5.2-10.1-3.3c-3.7,1.9-5.2,6.4-3.3,10.1c12.3,24.5,26.2,42.9,54.1,53.6c0.9,0.3,1.8,0.5,2.7,0.5c3,0,5.9-1.8,7-4.8c1.5-3.9-0.5-8.2-4.3-9.7C106.58,913.46,95.08,898.06,84.08,876.06z"/>
            <path d="M411.78,969.26L411.78,969.26c-6.3-0.3-24.6-1.8-33.1-4.6c-0.1,0-0.3-0.1-0.4-0.1c-17.2-4.6-47.3-26.1-47.6-26.3c-2.1-1.5-4.9-1.8-7.3-0.8c-0.6,0.3-64.6,27.1-98.2,31.9c-0.1,0-0.1,0-0.2,0c-21.6,3.6-43.5,3.6-65.1,0c-0.1,0-0.1,0-0.2,0c-17.9-2.6-34.3-9.3-47.9-15.6c-18.5-8.6-35.9-16.7-47.3-30.3c-8.8-11.8-11.7-25.8-14.7-40.5c-0.4-2-0.8-4.1-1.3-6.1c-7.4-45.7-7.4-81.5-0.1-112.8c5.5-20.7,16.4-42,32.5-63.5c10-13.6,33.1-34,43.5-42.9c4.8,15,13.4,28.4,24.7,38.9l-11,11.9c-2.3,2.4-2.6,6.1-1,8.9c3.3,5.6,12.3,22.1,14.1,31.4c0,0.1,0,0.2,0.1,0.3c3,12.1,2.5,35.9,2.3,41.5c-8.5,8.9-15.4,17.5-15.9,18.1c-2.6,3.2-2.1,8,1.2,10.5c1.4,1.1,3,1.7,4.7,1.7c2.2,0,4.4-1,5.9-2.8c5.3-6.6,21.4-25.3,31.8-32c15.2-8.8,31.3-14,46.6-15.1c21.3-1.2,44.7,7.7,62.8,15.6c17.7,8.3,48.1,32.5,48.5,32.7c3.1,2.5,7.6,2.1,10.3-0.9c0.2-0.2,20.6-22.9,32.5-32.6c9.6-5.9,32.1-15.3,32.3-15.4c3.8-1.6,5.6-6,4-9.8c-1.6-3.8-6-5.6-9.8-4c-1,0.4-24.4,10.3-34.8,16.8c-0.2,0.2-0.5,0.3-0.7,0.5c-9.3,7.4-22.9,21.7-30,29.4c-10-7.7-31.3-23.5-46-30.3c-0.1,0-0.1-0.1-0.2-0.1c-19.6-8.5-45.2-18.2-69.7-16.8h-0.1c-17.7,1.3-36.1,7.2-53.3,17.2c-0.1,0-0.2,0.1-0.2,0.2c-1.5,0.9-3,2-4.6,3.3c-0.1-10-0.8-22.5-2.9-31c-2-9.9-9.1-23.6-13.1-31l8.1-8.7c14.4,9.6,31.7,15.2,50.3,15.2c23.8,0,46.3-9.5,63.4-26.7c17.1-17.3,26.5-40.1,26.5-64.4c0-23.7-9.4-46.2-26.5-63.3c-17.1-17.1-39.6-26.5-63.3-26.5c-24.3,0-47.1,9.4-64.4,26.5c-17.2,17.1-26.7,39.6-26.7,63.4c0,3.8,0.2,7.5,0.7,11.2c-0.2,0.1-0.4,0.3-0.7,0.5c-1.5,1.2-37.2,30.8-51.3,49.9c-17.3,23-29.1,46.1-35,68.7c0,0.1,0,0.1-0.1,0.2c-7.8,33.3-7.8,71.1-0.1,118.9c0,0.1,0,0.3,0.1,0.4c0.4,2.1,0.9,4.1,1.3,6.2c3.3,15.8,6.6,32.1,17.6,46.7c0.1,0.1,0.2,0.2,0.2,0.3c13.6,16.3,33.4,25.5,52.7,34.4c14.6,6.7,32.2,14,52,16.8c11.6,1.9,23.3,2.9,34.9,2.9c11.7,0,23.3-1,34.9-2.9c31-4.4,83.3-25.3,98-31.3c8.8,6.1,32.6,21.7,48.8,26.1c12.2,4,35.8,5.2,36.8,5.3c4.2,0.2,7.7-3,7.9-7.1C419.08,972.96,415.88,969.46,411.78,969.26z M211.18,555.06c40.6,0,74.9,34.3,74.9,74.9c0,42-33.6,76.1-74.9,76.1c-42,0-76.1-34.1-76.1-76.1C135.08,588.66,169.18,555.06,211.18,555.06z"/>
          </g></g>
        </g>
      </svg>
    ),
  },
]

function BottomNav({ active, onChange, tint }: { active: Tab; onChange: (t: Tab) => void; tint: string }) {
  return (
    <nav className="shrink-0 flex border-t border-[#343438] bg-[#1f1f1f]">
      {NAV_ITEMS.map(({ id, label, icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors"
            style={{ color: isActive ? tint : "#3a3a4a" }}>
            {icon()}
            <span className="font-pixel text-[8px] uppercase tracking-widest">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SPLASH_SKIN = { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" }

function SidePanel() {
  const [store, setLocalStore]          = useState<AmintaStore | null>(null)
  const [tab, setTab]                   = useState<Tab>("home")
  const [tabKey, setTabKey]             = useState(0)
  const [levelUpData, setLevelUpData]       = useState<LevelUpData | null>(null)
  const [newlyUnlockedLevel, setNewlyUnlockedLevel] = useState<number | null>(null)
  const newlyUnlockedTimer = useRef<ReturnType<typeof setTimeout>>()
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [companionOpen, setCompanionOpen] = useState(false)
  const grqMigrated = useRef(false)
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>("x")
  const [authChecked, setAuthChecked]   = useState(false)
  const [isLoggedIn, setIsLoggedIn]     = useState(false)
  const [session, setSession]           = useState<AuthSession | null>(null)

  const refresh = async () => setLocalStore(await getStore())

  const { speech, animClass, animKey, dispatch } = useCompanion(store)

  // Check auth + pull from cloud on startup
  useEffect(() => {
    getAuthSession().then(async (s) => {
      console.log("[Aminta sidepanel] startup auth check — session:", s ? `uid=${s.userId} email=${s.email}` : "null")
      if (s) {
        setIsLoggedIn(true)
        setSession(s)
        console.log("[Aminta sidepanel] pulling from cloud...")
        await pullFromCloud()
        console.log("[Aminta sidepanel] pullFromCloud complete")
      }
      setAuthChecked(true)
    })
  }, [])

  // Watch storage so the panel reacts immediately when OAuth completes,
  // even if the Google auth popup disrupted the sidepanel's callback flow.
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.auth_access_token?.newValue) {
        console.log("[Aminta sidepanel] storage.onChanged — auth_access_token set, fetching session")
        getAuthSession().then(async (s) => {
          if (!s) {
            console.log("[Aminta sidepanel] storage.onChanged — getAuthSession returned null after token set")
            return
          }
          console.log("[Aminta sidepanel] storage.onChanged — session:", `uid=${s.userId} email=${s.email}`)
          setSession(s)
          setIsLoggedIn(true)
          setAuthChecked(true)
          console.log("[Aminta sidepanel] transitioning to logged-in UI, pulling from cloud...")
          await pullFromCloud()
          console.log("[Aminta sidepanel] pullFromCloud complete, refreshing store")
          await refresh()
        })
      }
      if ("auth_access_token" in changes && !changes.auth_access_token.newValue) {
        console.log("[Aminta sidepanel] storage.onChanged — auth_access_token cleared, signing out")
        setSession(null)
        setIsLoggedIn(false)
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  const handleSignOut = async () => {
    await clearAuthSession()
    setSession(null)
    setIsLoggedIn(false)
    setSettingsOpen(false)
  }

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? ""
      setDetectedPlatform(detectPlatform(url))
    })
    const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.url) setDetectedPlatform(detectPlatform(info.url))
    }
    chrome.tabs.onUpdated.addListener(listener)
    return () => chrome.tabs.onUpdated.removeListener(listener)
  }, [])

  useEffect(() => { refresh() }, [])
  useEffect(() => () => clearTimeout(newlyUnlockedTimer.current), [])

  // One-time migration: silently upgrade deprecated Groq model IDs to the new default.
  useEffect(() => {
    if (!store || grqMigrated.current) return
    grqMigrated.current = true
    if (isGroqKey(store.apiKey ?? "") && DEPRECATED_GROQ_IDS.has(store.model ?? "")) {
      setStore({ model: GROQ_DEFAULT }).then(refresh)
    }
  }, [store]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (patch: Partial<AmintaStore>) => {
    await setStore(patch)
    await refresh()
  }

  const switchTab = (next: Tab) => {
    setTab(next)
    setTabKey(k => k + 1)
    if (next === "home") {
      refresh()
      dispatch("open")
    }
  }

  if (!authChecked || !store) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#1f1f1f]">
        <div className="sprite-jump" style={{ filter: "drop-shadow(0 0 12px #74f7b566)" }}>
          <DemonMascot skin={SPLASH_SKIN} size={64} />
        </div>
        <p className="font-pixel text-[7px] text-[#74f7b5]/40 tracking-widest">AMINTA</p>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen onSignedIn={async () => {
        await pullFromCloud()
        setIsLoggedIn(true)
        await refresh()
      }} />
    )
  }

  const tint = getStageTint(store.xp ?? 0)

  return (
    <SetupGate store={store} onSave={update}>
      <div className="absolute inset-0 flex flex-col bg-[#1f1f1f] overflow-hidden">

        {/* ── Modals / overlays ── */}
        {levelUpData && (
          <LevelUpModal data={levelUpData} onDismiss={() => {
            const level = levelUpData.level
            setLevelUpData(null)
            refresh()
            clearTimeout(newlyUnlockedTimer.current)
            setNewlyUnlockedLevel(level)
            newlyUnlockedTimer.current = setTimeout(() => setNewlyUnlockedLevel(null), 8_000)
          }} />
        )}
        {companionOpen && (
          <CompanionPage
            store={store}
            animClass={animClass}
            animKey={animKey}
            speech={speech}
            onClose={() => setCompanionOpen(false)}
            newlyUnlockedLevel={newlyUnlockedLevel}
          />
        )}
        {settingsOpen && (
          <SettingsOverlay
            store={store}
            onSave={update}
            onClose={() => setSettingsOpen(false)}
            onResetOnboarding={async () => { await update({ onboardingDone: false }) }}
            session={session}
            onSignOut={handleSignOut}
          />
        )}

        {/* ── Header ── */}
        <header className="shrink-0 flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="13" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
              <rect x="2" y="0" width="2" height="3" fill={tint} />
              <rect x="12" y="0" width="2" height="3" fill={tint} />
              <rect x="3" y="3" width="10" height="9" fill={tint} />
              <rect x="4" y="6" width="2" height="2" fill="#1f1f1f" />
              <rect x="10" y="6" width="2" height="2" fill="#1f1f1f" />
            </svg>
            <span className="font-pixel text-[8px]" style={{ color: tint }}>Aminta</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-7 h-7 flex items-center justify-center text-[#444] hover:text-[#888] transition-colors rounded-lg hover:bg-white/5"
            title="Settings">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5.8 1.5 5.5 3.05c-.35.13-.67.3-.96.51L3.1 3.05 1.7 5.45l1.08.88C2.74 6.55 2.72 6.77 2.72 7s.02.45.06.67L1.7 8.55l1.4 2.4 1.44-.51c.29.21.61.38.96.51l.3 1.55h2.4l.3-1.55c.35-.13.67-.3.96-.51l1.44.51 1.4-2.4-1.08-.88c.04-.22.06-.44.06-.67s-.02-.45-.06-.67l1.08-.88-1.4-2.4-1.44.51c-.29-.21-.61-.38-.96-.51L8.2 1.5H5.8z"
                stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <circle cx="7" cy="7" r="1.7" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </header>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div key={tabKey} className="px-4 py-3 animate-slide-up">

            {tab === "home" && (
              <HomeTab
                store={store}
                onCreate={() => switchTab("create")}
                onTrain={() => switchTab("train")}
                onOpenCompanion={() => setCompanionOpen(true)}
                onUpdate={refresh}
                animClass={animClass}
                animKey={animKey}
                speech={speech}
                onContext={dispatch}
                newlyUnlockedLevel={newlyUnlockedLevel}
              />
            )}

            {tab === "create" && (
              <GeneratorPanel
                store={store}
                initialPlatform={detectedPlatform}
                onXPAwarded={async () => { await refresh(); pushToCloud(); dispatch("insert") }}
                onLevelUp={(level, stage) => { setLevelUpData({ level, stage }); dispatch("level_up") }}
                onTeach={() => switchTab("train")}
                onOpenSettings={() => setSettingsOpen(true)}
                onContext={dispatch}
              />
            )}

            {tab === "train" && (
              <VoiceProfileForm
                store={store}
                initial={store.voice}
                onSave={(voice) => update({ voice })}
                dnaCount={store.tweetDNA?.length ?? 0}
              />
            )}

          </div>
        </main>

        {/* ── Bottom nav ── */}
        <BottomNav active={tab} onChange={switchTab} tint={tint} />

      </div>
    </SetupGate>
  )
}

export default SidePanel

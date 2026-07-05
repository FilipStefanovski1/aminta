import { useEffect, useRef, useState } from "react"

import type { CompanionEvent } from "~lib/companion"
import { deriveMood } from "~lib/companion"
import {
  FORMS,
  LEVEL_THRESHOLDS,
  getForm,
  getLevelSpan,
  getLevel,
  getStageTint,
  getXpInLevel,
  getXpProgress,
} from "~lib/evolution"
import { getMissionProgress, tryCompleteDailyMissions } from "~lib/missions"
import type { AmintaStore } from "~lib/storage"
import { C } from "~lib/theme"
import DemonMascot from "~components/DemonMascot"
import { Card, Sprite, SpeechBubble, SpriteMark, XPBar } from "~components/ui"


interface Props {
  store: AmintaStore
  onCreate: () => void
  onTrain: () => void
  onOpenCompanion?: () => void
  onUpdate?: () => void
  // From the Companion Engine via sidepanel
  animClass: string
  animKey: number
  speech: string
  onContext?: (event: CompanionEvent) => void
  newlyUnlockedLevel?: number | null
}

export default function HomeTab({ store, onCreate, onTrain, onOpenCompanion, onUpdate, animClass, animKey, speech, onContext, newlyUnlockedLevel }: Props) {
  const xp          = store.xp ?? 0
  const currentForm = getForm(xp)
  const level       = getLevel(xp)
  const stage       = currentForm.name
  const tint        = getStageTint(xp)
  const progress    = getXpProgress(xp)
  const xpInLevel   = getXpInLevel(xp)
  const xpToday     = store.xpToday ?? 0
  const streak      = store.streak ?? 0
  const plan        = store.plan ?? "free"
  const mission     = getMissionProgress(store)
  const nextLevel   = level < FORMS.length ? level + 1 : null

  // Floating XP — shown above the sprite when XP increases
  const prevXP = useRef(xp)
  const [xpFloat, setXpFloat] = useState<{ delta: number; id: number } | null>(null)

  useEffect(() => {
    if (xp > prevXP.current) {
      setXpFloat({ delta: xp - prevXP.current, id: Date.now() })
    }
    prevXP.current = xp
  }, [xp])

  // Bubble-pop — remounts SpeechBubble each time the speech text changes
  const [bubbleKey, setBubbleKey] = useState(0)
  const prevSpeech = useRef(speech)
  useEffect(() => {
    if (speech !== prevSpeech.current) {
      setBubbleKey(k => k + 1)
      prevSpeech.current = speech
    }
  }, [speech])

  // Mood from the engine — used for mood-aware card styling
  const mood = deriveMood(store)

  // Mission toast — shown once when all tasks complete this session
  const [showToast, setShowToast] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  // Complete daily missions and fire mission_complete into the Companion Engine
  // when allDone transitions from false to true within a session.
  const prevAllDone = useRef(false)

  useEffect(() => {
    tryCompleteDailyMissions(store).then(ok => { if (ok && onUpdate) onUpdate() })
  }, [mission.generates, mission.published, mission.dnaTrained])

  const tasks = [
    { label: "Write one post",      done: mission.published >= 1, action: onCreate },
    { label: "Reply to someone",    done: mission.generates >= 3, action: onCreate },
    { label: "Teach me your voice", done: mission.dnaTrained,     action: onTrain  },
  ]
  const allDone = tasks.every(t => t.done)

  // Dispatch mission_complete + show toast once when all tasks first complete
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      onContext?.("mission_complete")
      clearTimeout(toastTimer.current)
      setShowToast(true)
      toastTimer.current = setTimeout(() => setShowToast(false), 2800)
    }
    prevAllDone.current = allDone
  }, [allDone])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const planLabel = plan === "lifetime" ? "FOUNDER" : plan === "pro" ? "PRO" : "FREE"

  return (
    <div className="space-y-4 pb-6">

      {/* ── MISSION TOAST ── */}
      {showToast && (
        <div
          className="animate-toast-up font-pixel"
          style={{
            position: "fixed",
            bottom: 52,
            left: 16,
            right: 16,
            zIndex: 30,
            borderRadius: 12,
            padding: "9px 14px",
            backgroundColor: tint + "18",
            border: `1px solid ${tint}55`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          <span style={{ fontSize: 10 }}>✦</span>
          <span className="text-[8px]" style={{ color: tint }}>Daily missions complete!</span>
        </div>
      )}

      {/* ── COMPANION CARD ── */}
      <Card pad={false} glow={mood === "hungry" ? "#f97316" : tint}
        style={{
          backgroundImage: "radial-gradient(circle, #1c2030 1px, transparent 1px)",
          backgroundSize: "8px 8px",
          backgroundColor: "#0e1018",
        }}>
        <div className="px-4 pt-5 pb-6" style={{ position: "relative" }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <p className="font-pixel text-[8px] tracking-widest" style={{ color: tint }}>
              {stage} · Lv.{level}
            </p>
            {plan !== "free" && (
              <span className="font-pixel text-[6px] px-1.5 py-0.5 rounded" style={{
                backgroundColor: plan === "lifetime" ? "#f5d060" : tint,
                color: "#000",
              }}>
                {plan === "lifetime" ? "FOUNDER" : "PRO"}
              </span>
            )}
          </div>
          {/* Mascot — bubble absolutely anchored above head, not in flow */}
          <div className="flex justify-center mb-5" style={{ position: "relative", marginTop: 48 }}>
            <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 4, zIndex: 2 }}>
              <SpeechBubble key={bubbleKey} text={speech} />
            </div>
            <button onClick={onOpenCompanion} className="cursor-pointer" style={{ background: "none", border: "none", padding: 0 }}>
              <Sprite key={animKey} xp={xp} size={112} animClass={animClass} />
            </button>
            {xpFloat && (
              <div
                key={xpFloat.id}
                className="xp-rise font-pixel text-[11px] pointer-events-none"
                style={{
                  position: "absolute",
                  top: "20%",
                  left: "50%",
                  color: tint,
                  whiteSpace: "nowrap",
                  zIndex: 10,
                }}
                onAnimationEnd={() => setXpFloat(null)}
              >
                +{xpFloat.delta} XP
              </div>
            )}
          </div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="font-pixel text-[7px]" style={{ color: "#666672" }}>Level {level}</span>
            <span className="font-pixel text-[8px]" style={{ color: tint }}>{xpInLevel} / {getLevelSpan(xp)} XP</span>
          </div>
          <XPBar progress={progress} tint={tint} />
        </div>
      </Card>

      {/* ── TODAY'S MISSIONS ── */}
      <Card pad={false} className="overflow-hidden animate-card-in" style={{ animationDelay: "30ms" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
          <p className="font-pixel text-[7px]" style={{ color: C.text }}>Today</p>
          {allDone
            ? <span className="font-pixel text-[6px]" style={{ color: tint }}>All done ✓</span>
            : <span className="text-[10px]" style={{ color: "#666672" }}>{tasks.filter(t => t.done).length}/{tasks.length}</span>}
        </div>
        <div>
          {tasks.map((t, i) => (
            <button
              key={t.label}
              onClick={t.action}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
              style={{ borderTop: i > 0 ? `1px solid ${C.borderSoft}` : undefined }}>
              <div className="w-3.5 h-3.5 rounded-md border flex items-center justify-center shrink-0"
                style={{ borderColor: t.done ? tint : C.borderHover, backgroundColor: t.done ? tint + "20" : "transparent" }}>
                {t.done && <span style={{ color: tint, fontSize: 8, lineHeight: 1 }}>✓</span>}
              </div>
              <span className="text-[12px]" style={{ color: t.done ? C.textGhost : C.text, textDecoration: t.done ? "line-through" : "none" }}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={onCreate}
            className="btn-pixel w-full py-3 rounded-xl font-pixel text-[9px] text-black"
            style={{ backgroundColor: tint }}>
            Create with Aminta →
          </button>
        </div>
      </Card>

      {/* ── STATS — flat row ── */}
      <div className="flex items-center animate-card-in rounded-2xl" style={{ animationDelay: "60ms", backgroundColor: C.card, border: `1px solid ${C.border}` }}>
        {([
          { label: "Streak", value: streak > 0 ? `${streak}d` : "—" },
          { label: "Today",  value: xpToday > 0 ? `+${xpToday}` : "0" },
          { label: "Plan",   value: planLabel },
        ] as { label: string; value: string }[]).map(({ label, value }, i, arr) => (
          <div key={label} className="flex-1 text-center py-3" style={{ borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : undefined }}>
            <p className="font-pixel text-[9px]" style={{ color: C.text }}>{value}</p>
            <p className="text-[9px] mt-1.5 uppercase tracking-[0.06em]" style={{ color: "#666672" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── NEXT EVOLUTION ── */}
      {nextLevel ? (() => {
        const nextForm  = FORMS[nextLevel - 1]
        const xpToNext  = LEVEL_THRESHOLDS[nextLevel - 1] - xp
        const isNew     = newlyUnlockedLevel === level
        return (
          <Card
            pad={false}
            className="animate-card-in overflow-hidden"
            style={{
              animationDelay: "90ms",
              boxShadow: isNew ? `0 0 22px ${currentForm.color}44` : undefined,
            }}>
            <div className="px-4 pt-3.5 pb-4">
              <p className="font-pixel text-[7px] uppercase tracking-widest mb-3" style={{ color: C.textDim }}>Next Evolution</p>

              {/* Current ← → Next */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="aminta-glow">
                    <DemonMascot skin={currentForm.skin} size={52} />
                  </div>
                  <p className="font-pixel text-[7px]" style={{ color: currentForm.color }}>
                    {currentForm.name}{isNew ? " ✦" : ""}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1.5" style={{ opacity: 0.38 }}>
                  {nextForm.revealed
                    ? <DemonMascot skin={nextForm.skin} size={52} />
                    : <div className="flex items-center justify-center font-pixel text-[16px]"
                        style={{ width: 52, height: 42, color: C.textGhost }}>?</div>}
                  <p className="font-pixel text-[7px]" style={{ color: nextForm.color }}>
                    {nextForm.revealed ? nextForm.name : "???"}
                  </p>
                </div>
              </div>

              {/* XP progress */}
              <div className="mb-3">
                <XPBar progress={progress} tint={tint} />
                <div className="flex items-center justify-between mt-2">
                  <span className="font-pixel text-[8px]" style={{ color: C.textDim }}>Lv.{level}</span>
                  <span className="font-pixel text-[7px]" style={{ color: tint }}>
                    {xpToNext} XP until {nextForm.revealed ? nextForm.name : "next form"}
                  </span>
                </div>
              </div>

              {/* Companion link */}
              <button
                onClick={onOpenCompanion}
                className="flex items-center gap-1.5 font-pixel text-[8px] opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: tint }}>
                Open Aminta
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </Card>
        )
      })() : (
        <Card className="animate-card-in text-center" style={{ animationDelay: "90ms" }}>
          <div className="aminta-glow flex justify-center mb-2">
            <SpriteMark tint={tint} size={28} />
          </div>
          <p className="font-pixel text-[8px] mb-1" style={{ color: tint }}>{currentForm.name}</p>
          <p className="text-[11px]" style={{ color: C.textDim }}>Max level reached. Legend status.</p>
        </Card>
      )}

    </div>
  )
}

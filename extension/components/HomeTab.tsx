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
import { Card, Sprite, SpeechBubble, SpriteMark, XPBar } from "~components/ui"

const RARITY_COLOR: Record<string, string> = {
  COMMON:    "#8ca0b0",
  UNCOMMON:  "#40e898",
  RARE:      "#40b0ff",
  EPIC:      "#c0a0ff",
  LEGENDARY: "#f5d060",
}

interface Props {
  store: AmintaStore
  onCreate: () => void
  onTrain: () => void
  onUpdate?: () => void
  // From the Companion Engine via sidepanel
  animClass: string
  animKey: number
  speech: string
  onContext?: (event: CompanionEvent) => void
  newlyUnlockedLevel?: number | null
}

export default function HomeTab({ store, onCreate, onTrain, onUpdate, animClass, animKey, speech, onContext, newlyUnlockedLevel }: Props) {
  const xp         = store.xp ?? 0
  const level      = getLevel(xp)
  const stage      = getForm(xp).name
  const tint       = getStageTint(xp)
  const progress   = getXpProgress(xp)
  const xpInLevel  = getXpInLevel(xp)
  const xpToday    = store.xpToday ?? 0
  const streak     = store.streak ?? 0
  const plan       = store.plan ?? "free"
  const mission    = getMissionProgress(store)
  const nextLevel  = level < FORMS.length ? level + 1 : null
  const currentForm = getForm(xp)

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

  return (
    <div className="space-y-3 pb-4">

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
        <div className="px-4 pt-4 pb-5" style={{ position: "relative" }}>
          <div className="flex items-center justify-center gap-2 mb-3">
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
          <div className="mb-3">
            <SpeechBubble key={bubbleKey} text={speech} />
          </div>
          <div className="flex justify-center mt-2 mb-4" style={{ position: "relative" }}>
            <Sprite key={animKey} xp={xp} size={96} animClass={animClass} />
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
            <span className="font-pixel text-[8px]" style={{ color: C.textDim }}>Level {level}</span>
            <span className="font-pixel text-[7px]" style={{ color: tint }}>{xpInLevel} / {getLevelSpan(xp)} XP</span>
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
            : <span className="font-pixel text-[6px]" style={{ color: C.textGhost }}>{tasks.filter(t => t.done).length}/{tasks.length}</span>}
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
            className="btn-pixel w-full py-2.5 rounded-xl font-pixel text-[9px] text-black"
            style={{ backgroundColor: tint }}>
            Create with Aminta →
          </button>
        </div>
      </Card>

      {/* ── STATS ── */}
      <div className="grid grid-cols-3 gap-2 animate-card-in" style={{ animationDelay: "60ms" }}>
        {[
          { label: "Streak", value: streak > 0 ? `${streak}d` : "—" },
          { label: "Today",  value: xpToday > 0 ? `+${xpToday}` : "0" },
          { label: "Plan",   value: plan === "lifetime" ? "FOUNDER" : plan === "pro" ? "PRO" : "FREE" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl py-3 px-2 text-center" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
            <p className="font-pixel text-[9px]" style={{ color: C.text }}>{value}</p>
            <p className="font-pixel text-[5px] mt-1.5 uppercase tracking-widest" style={{ color: C.textGhost }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── EVOLUTION PATH (was a separate tab) ── */}
      <div className="animate-card-in space-y-2" style={{ animationDelay: "90ms" }}>
        <p className="font-pixel text-[7px] uppercase tracking-widest px-1" style={{ color: C.textFaint }}>Evolution path</p>

        {/* Current form blurb */}
        <div
          className="flex items-center gap-3 rounded-xl px-3 py-3"
          style={{
            backgroundColor: currentForm.color + "0e",
            border: `1.5px solid ${currentForm.color}40`,
            boxShadow: newlyUnlockedLevel === level ? `0 0 18px ${currentForm.color}44` : undefined,
          }}>
          <div className="aminta-glow shrink-0">
            <SpriteMark tint={currentForm.color} size={28} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-pixel text-[8px]" style={{ color: currentForm.color }}>{currentForm.name}</p>
            <p className="text-[10px] mt-1 leading-snug" style={{ color: C.textFaint }}>{currentForm.blurb}</p>
          </div>
          <span
            className={`font-pixel text-[6px] px-1.5 py-1 rounded shrink-0${newlyUnlockedLevel === level ? " animate-toast" : ""}`}
            style={{ backgroundColor: currentForm.color, color: "#000" }}
          >
            {newlyUnlockedLevel === level ? "NEW" : "NOW"}
          </span>
        </div>

        {/* Path list — all forms */}
        <div className="space-y-1">
          {FORMS.filter(f => f.level !== level).map((form) => {
            const unlocked = level > form.level
            const isNext   = form.level === nextLevel
            const show     = form.revealed || unlocked

            const showPulse = isNext && mood === "pre_evolve"
            return (
              <div key={form.level}
                className="flex items-center gap-3 rounded-xl px-3 py-2"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  backgroundColor: C.card,
                  border: `1px solid ${showPulse ? form.color + "88" : isNext ? form.color + "44" : C.border}`,
                  opacity: unlocked ? 1 : 0.55,
                }}>
                {showPulse && (
                  <div className="evolve-pulse" style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none" }} />
                )}
                <div className="shrink-0" style={{ filter: unlocked ? "none" : "grayscale(1)" }}>
                  {show
                    ? <SpriteMark tint={form.color} size={22} />
                    : <div className="w-[22px] h-[18px] flex items-center justify-center font-pixel text-[10px]" style={{ color: C.textGhost }}>?</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-pixel text-[7px]" style={{ color: show ? (unlocked ? form.color : C.textDim) : C.textGhost }}>
                    {show ? form.name : "???"}
                  </p>
                  <p className="font-pixel text-[5px] mt-0.5 uppercase tracking-widest"
                    style={{ color: unlocked ? RARITY_COLOR[form.rarity] + "99" : C.textGhost }}>
                    {form.rarity}
                  </p>
                </div>
                <div className="shrink-0">
                  {unlocked
                    ? <span className="text-base font-bold leading-none" style={{ color: form.color }}>✓</span>
                    : isNext
                      ? <span className="font-pixel text-[6px]" style={{ color: showPulse ? form.color : tint }}>+{LEVEL_THRESHOLDS[form.level - 1] - xp} XP</span>
                      : <span className="font-pixel text-[5px]" style={{ color: C.textGhost }}>Lv.{form.level}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* How to grow */}
        <div className="rounded-2xl p-3 space-y-2" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
          <p className="font-pixel text-[7px] uppercase tracking-widest" style={{ color: C.textFaint }}>How to grow</p>
          {[
            ["Post a tweet",  "+50 XP"],
            ["Post a reply",  "+25 XP"],
            ["Polish & post", "+15 XP"],
          ].map(([label, gain]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: C.textFaint }}>{label}</span>
              <span className="font-pixel text-[7px]" style={{ color: tint }}>{gain}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

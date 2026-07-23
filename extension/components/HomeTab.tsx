import { useEffect, useRef, useState } from "react"

import type { CompanionEvent } from "~lib/companion"
import { deriveMood } from "~lib/companion"
import {
  getForm,
  getLevelSpan,
  getLevel,
  getStageTint,
  getXpInLevel,
  getXpProgress,
} from "~lib/evolution"
import { hasProAccess, planLabel as computePlanLabel } from "~lib/entitlements"
import { getMissionProgress, tryCompleteDailyMissions } from "~lib/missions"
import type { AmintaStore } from "~lib/storage"
import { C } from "~lib/theme"
import { Card, Sprite, SpeechBubble, XPBar } from "~components/ui"


interface Props {
  store: AmintaStore
  onCreate: () => void
  onTrain: () => void
  onOpenCompanion?: () => void
  onOpenSettings?: () => void
  onUpdate?: () => void
  // From the Companion Engine via sidepanel
  animClass: string
  animKey: number
  speech: string
  onContext?: (event: CompanionEvent) => void
}

export default function HomeTab({ store, onCreate, onTrain, onOpenCompanion, onOpenSettings, onUpdate, animClass, animKey, speech, onContext }: Props) {
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
  const entitled    = hasProAccess({ plan: store.plan, subscriptionStatus: store.subscriptionStatus })
  const mission     = getMissionProgress(store)

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

  const planLabel = computePlanLabel({ plan: store.plan, subscriptionStatus: store.subscriptionStatus })

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
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title="Settings"
              className="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full text-[#666] hover:text-[#999] hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              style={{ zIndex: 3 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.8 1.5 5.5 3.05c-.35.13-.67.3-.96.51L3.1 3.05 1.7 5.45l1.08.88C2.74 6.55 2.72 6.77 2.72 7s.02.45.06.67L1.7 8.55l1.4 2.4 1.44-.51c.29.21.61.38.96.51l.3 1.55h2.4l.3-1.55c.35-.13.67-.3.96-.51l1.44.51 1.4-2.4-1.08-.88c.04-.22.06-.44.06-.67s-.02-.45-.06-.67l1.08-.88-1.4-2.4-1.44.51c-.29-.21-.61-.38-.96-.51L8.2 1.5H5.8z"
                  stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                <circle cx="7" cy="7" r="1.7" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
          )}
          <div className="flex items-center justify-center gap-2 mb-2">
            <p className="font-pixel text-[8px] tracking-widest" style={{ color: tint }}>
              {stage}
            </p>
            {entitled && (
              <span className="font-pixel text-[6px] px-1.5 py-0.5 rounded" style={{
                backgroundColor: plan === "lifetime" ? "#f5d060" : tint,
                color: "#000",
              }}>
                {planLabel}
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
            onClick={() => { chrome.tabs.create({ url: "https://x.com/compose/post" }); onCreate() }}
            className="btn-pixel w-full py-3 rounded-xl font-pixel text-[9px] text-black"
            style={{ backgroundColor: tint }}>
            Create with Aminta
          </button>
        </div>
      </Card>

      {/* ── STATS — flat row ── */}
      <div className="flex items-center animate-card-in rounded-2xl" style={{ animationDelay: "60ms", backgroundColor: C.card, border: `1px solid ${C.border}` }}>
        {([
          { label: "Streak", value: `${streak}d` },
          { label: "Today",  value: xpToday > 0 ? `+${xpToday}` : "0" },
          { label: "Plan",   value: planLabel },
        ] as { label: string; value: string }[]).map(({ label, value }, i, arr) => (
          <div key={label} className="flex-1 text-center py-3" style={{ borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : undefined }}>
            <p className="font-pixel text-[9px]" style={{ color: C.text }}>{value}</p>
            <p className="text-[9px] mt-1.5 uppercase tracking-[0.06em]" style={{ color: "#666672" }}>{label}</p>
          </div>
        ))}
      </div>

    </div>
  )
}

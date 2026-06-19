import { useEffect, useState } from "react"

import {
  getForm,
  getLevel,
  getNextStage,
  getStageTint,
  getXpInLevel,
  getXpProgress,
  XP_PER_LEVEL,
} from "~lib/evolution"
import { computeDNAStrength, getMissionProgress, tryCompleteDailyMissions } from "~lib/missions"
import type { AmintaStore } from "~lib/storage"
import { C } from "~lib/theme"
import { Card, Sprite, SpeechBubble, SpriteMark, XPBar } from "~components/ui"

// State-aware greeting — Aminta reacts to how the day is going.
function getLine(xpToday: number, streak: number): string {
  if (xpToday === 0)  return streak > 0 ? `${streak}-day streak. let's keep it.` : "i'm hungry. what are we posting?"
  if (xpToday >= 200) return "we're on fire today."
  if (xpToday >= 100) return "keep cooking."
  return "nice. one more?"
}

interface Props {
  store: AmintaStore
  onWrite: () => void
  onTeach: () => void
  onEvolve: () => void
  onUpdate?: () => void
}

export default function HomeTab({ store, onWrite, onTeach, onEvolve, onUpdate }: Props) {
  const xp        = store.xp ?? 0
  const level     = getLevel(xp)
  const stage     = getForm(xp).name
  const tint      = getStageTint(xp)
  const progress  = getXpProgress(xp)
  const xpInLevel = getXpInLevel(xp)
  const xpToday   = store.xpToday ?? 0
  const streak    = store.streak ?? 0
  const voiceMatch = computeDNAStrength(store)
  const mission   = getMissionProgress(store)
  const next      = getNextStage(xp)

  // Cycling speech bubble
  const line = getLine(xpToday, streak)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const iv = setInterval(() => {
      setVisible(false)
      setTimeout(() => setVisible(true), 180)
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    tryCompleteDailyMissions(store).then(ok => { if (ok && onUpdate) onUpdate() })
  }, [mission.generates, mission.published, mission.dnaTrained])

  // Today's plan — what Aminta wants, in plain language.
  const tasks = [
    { label: "Write one post",     done: mission.published >= 1,  action: onWrite  },
    { label: "Reply to someone",   done: mission.generates >= 3,  action: onWrite  },
    { label: "Teach me your voice", done: mission.dnaTrained,     action: onTeach  },
  ]
  const allDone = tasks.every(t => t.done)

  return (
    <div className="space-y-3 pb-4">

      {/* ── COMPANION CARD — single source of truth ── */}
      <Card pad={false} glow={tint}
        style={{
          backgroundImage: "radial-gradient(circle, #1c2030 1px, transparent 1px)",
          backgroundSize: "8px 8px",
          backgroundColor: "#0e1018",
        }}>
        <div className="px-4 pt-4 pb-5">
          <p className="font-pixel text-[8px] text-center tracking-widest mb-3" style={{ color: tint }}>
            {stage} · Lv.{level}
          </p>

          <div className="mb-3">
            <SpeechBubble text={line} visible={visible} />
          </div>

          <div className="flex justify-center mt-2 mb-4">
            <Sprite xp={xp} size={96} />
          </div>

          <div className="flex items-baseline justify-between mb-1.5">
            <span className="font-pixel text-[8px]" style={{ color: C.textDim }}>Level {level}</span>
            <span className="font-pixel text-[7px]" style={{ color: tint }}>{xpInLevel} / {XP_PER_LEVEL} XP</span>
          </div>
          <XPBar progress={progress} tint={tint} />
        </div>
      </Card>

      {/* ── TODAY — Aminta tells the user what to do ── */}
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
            onClick={onWrite}
            className="btn-pixel w-full py-2.5 rounded-xl font-pixel text-[9px] text-black"
            style={{ backgroundColor: tint }}>
            Write with Aminta →
          </button>
        </div>
      </Card>

      {/* ── PROGRESS ── */}
      <div className="grid grid-cols-3 gap-2 animate-card-in" style={{ animationDelay: "60ms" }}>
        {[
          { label: "Streak",      value: streak > 0 ? `${streak}d` : "—" },
          { label: "Today",       value: xpToday > 0 ? `+${xpToday}` : "0" },
          { label: "Voice Match", value: `${voiceMatch}%` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl py-3 px-2 text-center" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
            <p className="font-pixel text-[9px]" style={{ color: C.text }}>{value}</p>
            <p className="font-pixel text-[5px] mt-1.5 uppercase tracking-widest" style={{ color: C.textGhost }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── NEXT EVOLUTION PREVIEW ── */}
      {next && (
        <button
          onClick={onEvolve}
          className="w-full animate-card-in"
          style={{ animationDelay: "90ms" }}>
          <Card className="flex items-center gap-3 hover:bg-white/[0.01] transition-colors">
            <div className="shrink-0 opacity-40">
              <SpriteMark tint={tint} size={32} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-pixel text-[6px] uppercase tracking-widest" style={{ color: C.textGhost }}>Next evolution</p>
              <p className="font-pixel text-[8px] mt-1" style={{ color: C.textDim }}>{next.name}</p>
            </div>
            <span className="font-pixel text-[7px] shrink-0" style={{ color: tint }}>+{next.xpNeeded} XP →</span>
          </Card>
        </button>
      )}

    </div>
  )
}

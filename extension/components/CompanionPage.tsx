import { deriveMood } from "~lib/companion"
import {
  FORMS,
  LEVEL_THRESHOLDS,
  getForm,
  getLevel,
  getLevelSpan,
  getStageTint,
  getXpInLevel,
  getXpProgress,
} from "~lib/evolution"
import { sampleCount } from "~lib/missions"
import type { AmintaStore } from "~lib/storage"
import { C } from "~lib/theme"
import { Sprite, SpriteMark, XPBar } from "~components/ui"

const RARITY_COLOR: Record<string, string> = {
  COMMON:    "#8ca0b0",
  UNCOMMON:  "#40e898",
  RARE:      "#40b0ff",
  EPIC:      "#c0a0ff",
  LEGENDARY: "#f5d060",
}

interface Props {
  store: AmintaStore
  animClass: string
  animKey: number
  onClose: () => void
  newlyUnlockedLevel?: number | null
}

export default function CompanionPage({ store, animClass, animKey, onClose, newlyUnlockedLevel }: Props) {
  const xp          = store.xp ?? 0
  const tint        = getStageTint(xp)
  const currentForm = getForm(xp)
  const level       = getLevel(xp)
  const xpInLevel   = getXpInLevel(xp)
  const levelSpan   = getLevelSpan(xp)
  const progress    = getXpProgress(xp)
  const mood        = deriveMood(store)
  const nextLevel   = level < FORMS.length ? level + 1 : null

  const postsPublished   = store.postsPublishedTotal ?? 0
  const streak            = store.streak ?? 0
  const xpToday            = store.xpToday ?? 0
  const trainingSamples    = sampleCount(store)

  return (
    <div className="absolute inset-0 z-20 flex flex-col animate-slide-up" style={{ backgroundColor: C.bg }}>

      {/* ── Header ── */}
      <header
        className="shrink-0 flex items-center px-3 py-2.5"
        style={{ borderBottom: `1px solid ${C.border}` }}>
        <button
          onClick={onClose}
          aria-label="Back"
          title="Back"
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: tint }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </header>

      {/* ── Scrollable content ── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-4 py-5 space-y-5">

          {/* ── Companion hero ── */}
          <div className="flex flex-col items-center text-center gap-3">
            <Sprite key={animKey} xp={xp} size={112} animClass={animClass} />
            <div>
              {/* The mascot is always Aminta — no rename affordance. User
                  identity (email, X handle) lives in Settings, kept
                  separate from the companion's own identity. */}
              <p className="font-pixel text-[14px]" style={{ color: tint }}>Aminta</p>
              <p className="font-pixel text-[7px] mt-1.5" style={{ color: C.textDim }}>{currentForm.name} · Level {level}</p>
            </div>
            <div className="w-full">
              <XPBar progress={progress} tint={tint} />
              <div className="flex items-center justify-between mt-1.5">
                <span className="font-pixel text-[6px]" style={{ color: C.textGhost }}>Lv.{level}</span>
                {nextLevel
                  ? <span className="font-pixel text-[7px]" style={{ color: tint }}>{xpInLevel} / {levelSpan} XP</span>
                  : <span className="font-pixel text-[7px]" style={{ color: tint }}>Max Level</span>}
              </div>
            </div>
            {currentForm.blurb && (
              <p className="text-[12px] leading-relaxed" style={{ color: C.textDim }}>
                {currentForm.blurb}
              </p>
            )}
          </div>

          {/* ── Evolution Journey ── */}
          <div className="space-y-2">
            <p className="font-pixel text-[7px] uppercase tracking-widest px-1" style={{ color: C.textDim }}>
              Evolution Journey
            </p>
            {FORMS.map((form) => {
              const unlocked  = level >= form.level
              const isCurrent = level === form.level
              const isNext    = nextLevel === form.level
              const show      = form.revealed || unlocked
              const showPulse = isNext && mood === "pre_evolve"
              return (
                <div
                  key={form.level}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    backgroundColor: isCurrent ? form.color + "10" : C.card,
                    border: `1px solid ${isCurrent ? form.color + "55" : showPulse ? form.color + "88" : isNext ? form.color + "33" : C.border}`,
                    opacity: unlocked ? 1 : 0.45,
                    boxShadow: newlyUnlockedLevel === level && isCurrent ? `0 0 18px ${form.color}44` : undefined,
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
                    {show && (
                      <p className="text-[9px] mt-0.5 uppercase tracking-[0.04em]" style={{ color: RARITY_COLOR[form.rarity] + "88" }}>
                        {form.rarity}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {isCurrent
                      ? <span className="font-pixel text-[6px] px-1.5 py-0.5 rounded" style={{ backgroundColor: form.color, color: "#000" }}>
                          {newlyUnlockedLevel === level ? "NEW" : "NOW"}
                        </span>
                      : unlocked
                        ? <span className="font-bold leading-none" style={{ color: form.color, fontSize: 16 }}>✓</span>
                        : isNext
                          ? <span className="font-pixel text-[6px]" style={{ color: showPulse ? form.color : tint }}>
                              +{LEVEL_THRESHOLDS[form.level - 1] - xp} XP
                            </span>
                          : <span className="font-pixel text-[5px]" style={{ color: C.textGhost }}>Lv.{form.level}</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Growth ── */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
            <p className="font-pixel text-[7px] uppercase tracking-widest px-4 py-3" style={{ color: C.textDim, borderBottom: `1px solid ${C.border}` }}>
              Growth
            </p>
            {([
              ["Posts written",    `${postsPublished}`],
              ["Training samples", `${trainingSamples}`],
              ["Current streak",   `${streak}d`],
              ["XP today",         xpToday > 0 ? `+${xpToday}` : "0"],
              ["Total XP",         `${xp}`],
            ] as [string, string][]).map(([label, value], i) => (
              <div
                key={label}
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderTop: i > 0 ? `1px solid ${C.borderSoft}` : undefined }}>
                <span className="text-[11px]" style={{ color: C.textDim }}>{label}</span>
                <span className="font-pixel text-[9px]" style={{ color: C.text }}>{value}</span>
              </div>
            ))}
          </div>

          {/* ── Achievements ── */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
            <p className="font-pixel text-[7px] uppercase tracking-widest mb-3" style={{ color: C.textDim }}>
              Achievements
            </p>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
                  <span className="font-pixel text-[9px]" style={{ color: C.textGhost }}>?</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] mt-3 text-center" style={{ color: C.textGhost }}>Coming soon</p>
          </div>

          <div className="h-2" />
        </div>
      </main>
    </div>
  )
}

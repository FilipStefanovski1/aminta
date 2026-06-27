import { FORMS, LEVEL_THRESHOLDS, getLevel, getStageTint } from "~lib/evolution"
import type { AmintaStore } from "~lib/storage"
import { C } from "~lib/theme"
import { Card, SpriteMark } from "~components/ui"

const RARITY_COLOR: Record<string, string> = {
  COMMON:    "#8ca0b0",
  UNCOMMON:  "#40e898",
  RARE:      "#40b0ff",
  EPIC:      "#c0a0ff",
  LEGENDARY: "#f5d060",
}

interface Props {
  store: AmintaStore
}

export default function EvolutionsTab({ store }: Props) {
  const xp           = store.xp ?? 0
  const currentLevel = getLevel(xp)
  const tint         = getStageTint(xp)
  const current      = FORMS[Math.min(currentLevel, FORMS.length) - 1]
  const next         = FORMS.find(f => f.level > currentLevel)

  return (
    <div className="space-y-3 pb-4">

      {/* ── Current form hero ── */}
      <Card glow={current.color} className="text-center animate-card-in"
        style={{
          backgroundImage: "radial-gradient(circle, #1c2030 1px, transparent 1px)",
          backgroundSize: "8px 8px",
          backgroundColor: "#0e1018",
        }}>
        <p className="font-pixel text-[6px] uppercase tracking-widest mb-3" style={{ color: C.textGhost }}>Current form</p>
        <div className="flex justify-center mb-3">
          <div className="aminta-glow"><SpriteMark tint={current.color} size={64} /></div>
        </div>
        <p className="font-pixel text-[11px]" style={{ color: current.color }}>{current.name}</p>
        <p className="text-[11px] mt-2 leading-relaxed" style={{ color: C.textFaint }}>{current.blurb}</p>
      </Card>

      {/* ── Next unlock ── */}
      {next && (
        <Card className="animate-card-in" style={{ animationDelay: "30ms" }}>
          <div className="flex items-center gap-3">
            <div className="shrink-0 opacity-50">
              {next.revealed ? <SpriteMark tint={next.color} size={36} /> : <div className="font-pixel text-[18px]" style={{ color: C.textGhost }}>?</div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-pixel text-[6px] uppercase tracking-widest" style={{ color: C.textGhost }}>Next form</p>
              <p className="font-pixel text-[8px] mt-1" style={{ color: C.textDim }}>{next.revealed ? next.name : "???"}</p>
            </div>
            <span className="font-pixel text-[7px] shrink-0" style={{ color: tint }}>
              +{LEVEL_THRESHOLDS[next.level - 1] - xp} XP
            </span>
          </div>
        </Card>
      )}

      {/* ── Full path ── */}
      <div className="animate-card-in" style={{ animationDelay: "60ms" }}>
        <p className="font-pixel text-[7px] uppercase tracking-widest mb-2 px-1" style={{ color: C.textFaint }}>The path</p>
        <div className="space-y-1.5">
          {FORMS.map((form) => {
            const unlocked  = currentLevel >= form.level
            const isCurrent = currentLevel === form.level
            const show      = form.revealed || unlocked

            return (
              <div key={form.level}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{
                  backgroundColor: isCurrent ? form.color + "0e" : C.card,
                  border: isCurrent ? `1.5px solid ${form.color}` : `1px solid ${C.border}`,
                  opacity: unlocked ? 1 : 0.55,
                }}>
                <div className="shrink-0" style={{ filter: unlocked ? "none" : "grayscale(1)" }}>
                  {show
                    ? <SpriteMark tint={show ? form.color : C.textGhost} size={26} />
                    : <div className="w-[26px] h-[21px] flex items-center justify-center font-pixel text-[12px]" style={{ color: C.textGhost }}>?</div>}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-pixel text-[7px]" style={{ color: show ? (unlocked ? form.color : C.textDim) : C.textGhost }}>
                    {show ? form.name : "???"}
                  </p>
                  <p className="font-pixel text-[5px] mt-1 uppercase tracking-widest"
                    style={{ color: unlocked ? RARITY_COLOR[form.rarity] + "99" : C.textGhost }}>
                    {form.rarity}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  {isCurrent ? (
                    <span className="font-pixel text-[5px] px-1.5 py-1 rounded" style={{ backgroundColor: form.color, color: "#000" }}>NOW</span>
                  ) : unlocked ? (
                    <span className="font-pixel text-[7px]" style={{ color: form.color }}>✓</span>
                  ) : (
                    <span className="font-pixel text-[5px]" style={{ color: C.textGhost }}>Lv.{form.level}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── How to grow ── */}
      <Card className="animate-card-in space-y-2" style={{ animationDelay: "90ms" }}>
        <p className="font-pixel text-[7px] uppercase tracking-widest" style={{ color: C.textFaint }}>How to grow</p>
        {[
          ["Post a tweet",     "+50 XP"],
          ["Post a reply",     "+25 XP"],
          ["Polish & post",    "+15 XP"],
        ].map(([label, gain]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: C.textFaint }}>{label}</span>
            <span className="font-pixel text-[7px]" style={{ color: tint }}>{gain}</span>
          </div>
        ))}
      </Card>

    </div>
  )
}

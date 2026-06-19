import { useEffect, useRef, useState } from "react"
import lvl1Src from "data-base64:~/assets/lvl1-aminta.png"
import lvl2Src from "data-base64:~/assets/lvl2-aminta.png"
import lvl3Src from "data-base64:~/assets/lvl3-aminta.png"

import { getLevel, getStageTint } from "~lib/evolution"
import { C } from "~lib/theme"

// ─── Card ──────────────────────────────────────────────────────────────────
// The one card surface used everywhere. Consistent radius, border, padding.

export function Card({
  children,
  className = "",
  pad = true,
  glow,
  style,
}: {
  children: React.ReactNode
  className?: string
  pad?: boolean
  glow?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`rounded-2xl ${pad ? "p-4" : ""} ${className}`}
      style={{
        backgroundColor: C.card,
        border: `1px solid ${glow ? glow + "44" : C.border}`,
        boxShadow: glow ? `0 0 28px ${glow}10` : undefined,
        ...style,
      }}>
      {children}
    </div>
  )
}

// ─── Section label ───────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-pixel text-[7px] uppercase tracking-widest mb-2" style={{ color: C.textFaint }}>
      {children}
    </p>
  )
}

// ─── Primary button ────────────────────────────────────────────────────────

export function PrimaryButton({
  children,
  onClick,
  disabled,
  tint = C.mint,
  className = "",
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  tint?: string
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn-pixel w-full py-3 rounded-xl font-pixel text-[9px] text-black disabled:opacity-40 disabled:cursor-not-allowed transition-opacity ${className}`}
      style={{ backgroundColor: tint }}>
      {children}
    </button>
  )
}

// ─── Ghost button ──────────────────────────────────────────────────────────

export function GhostButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full py-2.5 rounded-xl font-pixel text-[7px] transition-all ${className}`}
      style={{ border: `1px solid ${C.border}`, color: C.textFaint }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.color = C.textDim }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textFaint }}>
      {children}
    </button>
  )
}

// ─── XP bar ──────────────────────────────────────────────────────────────────

export function XPBar({ progress, tint }: { progress: number; tint: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.style.width = "0%"
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => { if (ref.current) ref.current.style.width = `${progress}%` })
    )
    return () => cancelAnimationFrame(id)
  }, [progress])
  return (
    <div className="h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
      <div ref={ref} className="h-full rounded-full"
        style={{ width: 0, transition: "width 0.9s cubic-bezier(0.22,1,0.36,1)", backgroundColor: tint, boxShadow: `0 0 6px ${tint}88` }} />
    </div>
  )
}

// ─── Aminta sprite ─────────────────────────────────────────────────────────
// The single source of truth for the mascot. PNG for Lv.1–3, tinted SVG above.

export function Sprite({
  xp,
  size = 96,
  reacting = false,
  float = true,
}: {
  xp: number
  size?: number
  reacting?: boolean
  float?: boolean
}) {
  const level = getLevel(xp)
  const tint  = getStageTint(xp)
  const src   = level === 1 ? lvl1Src : level === 2 ? lvl2Src : level === 3 ? lvl3Src : null

  const [blink, setBlink] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const schedule = () => {
      t = setTimeout(() => {
        setBlink(true)
        setTimeout(() => { setBlink(false); schedule() }, 110)
      }, 3500 + Math.random() * 4500)
    }
    schedule()
    return () => clearTimeout(t)
  }, [])

  const cls = reacting ? "sprite-react aminta-glow" : float ? "sprite-float aminta-glow" : "aminta-glow"

  if (src) {
    return (
      <div className={cls} style={{ width: size, height: size }}>
        <img src={src} alt="Aminta"
          style={{ imageRendering: "pixelated", objectFit: "contain", width: "100%", height: "100%" }} />
      </div>
    )
  }
  return (
    <svg width={size} height={size * 0.8125} viewBox="0 0 16 13" className={cls} style={{ imageRendering: "pixelated" }}>
      <rect x="2" y="0" width="2" height="3" fill={tint} />
      <rect x="12" y="0" width="2" height="3" fill={tint} />
      <rect x="3" y="3" width="10" height="9" fill={tint} />
      <rect x="4" y="6" width="2" height={blink ? 0 : 2} fill="#0d0d0f" />
      <rect x="10" y="6" width="2" height={blink ? 0 : 2} fill="#0d0d0f" />
    </svg>
  )
}

// ─── Static tiny sprite (no animation, for grids / inline) ──────────────────

export function SpriteMark({ tint, size = 36 }: { tint: string; size?: number }) {
  return (
    <svg width={size} height={size * 0.8125} viewBox="0 0 16 13" style={{ imageRendering: "pixelated", display: "block" }}>
      <rect x="2" y="0" width="2" height="3" fill={tint} />
      <rect x="12" y="0" width="2" height="3" fill={tint} />
      <rect x="3" y="3" width="10" height="9" fill={tint} />
      <rect x="4" y="6" width="2" height="2" fill="#0d0d0f" />
      <rect x="10" y="6" width="2" height="2" fill="#0d0d0f" />
    </svg>
  )
}

// ─── Speech bubble (white pixel bubble, downward tail) ──────────────────────

export function SpeechBubble({ text, visible = true }: { text: string; visible?: boolean }) {
  return (
    <div className="flex justify-center" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.15s" }}>
      <div className="relative">
        <div className="px-3 py-2" style={{ background: "#fff", border: "2px solid #000", boxShadow: "2px 2px 0 #000" }}>
          <p className="font-pixel text-[7px] text-black">{text}</p>
        </div>
        <svg width="12" height="8" viewBox="0 0 12 8"
          style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)", imageRendering: "pixelated" }}>
          <polygon points="0,0 12,0 6,8" fill="#000" />
          <polygon points="2,0 10,0 6,5" fill="#fff" />
        </svg>
      </div>
    </div>
  )
}

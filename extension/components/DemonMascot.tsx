import type { DemonSkin } from "~lib/evolution"

// 16-wide pixel grid — identical to landing/components/DemonMascot.tsx
const ROWS = [
  "...H........H...",
  "..HHB......BHH..",
  "..HHBB....BBHH..",
  "...BBBBBBBBBB...",
  "..BBBBBBBBBBBB..",
  ".BBBBBBBBBBBBBB.",
  ".BBEEBBBBBBEEBB.",
  ".BBEEBBBBBBEEBB.",
  ".BBBBBBBBBBBBBB.",
  ".BBBBMMMMMMBBBB.",
  ".BBBBBMMMMBBBBBB",
  ".BBBBBBBBBBBBBB.",
  "..BBBBBBBBBBBB..",
]

const COLS = 16

function colorFor(ch: string, skin: DemonSkin): string | null {
  switch (ch) {
    case "B": return skin.body
    case "H": return skin.horn
    case "E": return skin.eye
    case "M": return "#0a0a0a"
    default:  return null
  }
}

interface Props {
  skin: DemonSkin
  size?: number
  className?: string
}

export default function DemonMascot({ skin, size = 96, className = "" }: Props) {
  const height = (size * ROWS.length) / COLS
  return (
    <svg
      viewBox={`0 0 ${COLS} ${ROWS.length}`}
      width={size}
      height={height}
      className={className}
      style={{ imageRendering: "pixelated", display: "block" }}
      role="img"
      aria-label="Aminta mascot"
    >
      {/* Body, horns, mouth — everything except eyes */}
      {ROWS.map((row, y) =>
        row.split("").map((ch, x) => {
          if (ch === "E") return null
          const fill = colorFor(ch, skin)
          if (!fill) return null
          return <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />
        })
      )}
      {/* Left eye — animated blink group */}
      <g className="demon-eye">
        {ROWS.map((row, y) =>
          row.split("").map((ch, x) =>
            ch === "E" && x < 8
              ? <rect key={`el-${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={skin.eye} />
              : null
          )
        )}
      </g>
      {/* Right eye — animated blink group with slight delay */}
      <g className="demon-eye demon-eye-r">
        {ROWS.map((row, y) =>
          row.split("").map((ch, x) =>
            ch === "E" && x >= 8
              ? <rect key={`er-${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={skin.eye} />
              : null
          )
        )}
      </g>
    </svg>
  )
}

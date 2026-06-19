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
      {ROWS.map((row, y) =>
        row.split("").map((ch, x) => {
          const fill = colorFor(ch, skin)
          if (!fill) return null
          return <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />
        })
      )}
    </svg>
  )
}

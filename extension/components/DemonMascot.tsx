import type { DemonSkin } from "~lib/evolution"

// Fallback grid used when skin.rows is omitted (e.g. the splash screen skin).
// Mirrors Happy's canonical 16-wide master template.
const FALLBACK_ROWS = [
  "...H........H...",
  "..HHB......BHH..",
  "..HHBB....BBHH..",
  "..BBBBBBBBBBBB..",
  ".BBBBBBBBBBBBBB.",
  ".BBBBBBBBBBBBBB.",
  ".BBEEBBBBBBEEBB.",
  ".BBEEBBBBBBEEBB.",
  ".BBBBBBBBBBBBBB.",
  ".BBBBMMMMMMBBBB.",
  ".BBBBBMMMMBBBBBB",
  "..BBBBBBBBBBBB..",
  "...BBBBBBBBBB...",
]

function colorFor(ch: string, skin: DemonSkin): string | null {
  switch (ch) {
    case "B": return skin.body
    case "H": return skin.horn
    case "E": return skin.eye
    case "M": return "#0a0a0a"
    case "X": return skin.mark    ?? skin.horn
    case "C": return skin.crystal ?? skin.eye
    default:  return null
  }
}

interface Props {
  skin: DemonSkin
  size?: number
  className?: string
}

export default function DemonMascot({ skin, size = 96, className = "" }: Props) {
  if (skin.gif) {
    return (
      <img
        src={skin.gif}
        width={size}
        height={size}
        className={className}
        style={{ imageRendering: "pixelated", display: "block" }}
        alt="Aminta mascot"
      />
    )
  }

  const rows   = skin.rows ?? FALLBACK_ROWS
  const cols   = rows[0]?.length ?? 16
  const height = (size * rows.length) / cols
  const mid    = cols / 2

  // Split E pixels at the horizontal midpoint for independent left/right blink.
  const leftEyePx:  Array<{ x: number; y: number }> = []
  const rightEyePx: Array<{ x: number; y: number }> = []
  rows.forEach((row, y) =>
    row.split("").forEach((ch, x) => {
      if (ch === "E") (x < mid ? leftEyePx : rightEyePx).push({ x, y })
    })
  )

  return (
    <svg
      viewBox={`0 0 ${cols} ${rows.length}`}
      width={size}
      height={height}
      className={className}
      style={{ imageRendering: "pixelated", display: "block" }}
      role="img"
      aria-label="Aminta mascot"
    >
      {/* Non-eye pixels */}
      {rows.map((row, y) =>
        row.split("").map((ch, x) => {
          if (ch === "E") return null
          const fill = colorFor(ch, skin)
          if (!fill) return null
          return <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />
        })
      )}

      {/* Left eye — animated blink group */}
      <g className="demon-eye">
        {leftEyePx.map(({ x, y }) => (
          <rect key={`el-${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={skin.eye} />
        ))}
      </g>

      {/* Right eye — animated blink group with slight delay */}
      <g className="demon-eye demon-eye-r">
        {rightEyePx.map(({ x, y }) => (
          <rect key={`er-${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={skin.eye} />
        ))}
      </g>
    </svg>
  )
}

import { ImageResponse } from "next/og"
import { readFile } from "fs/promises"
import path from "path"

// Node runtime needed to read local font file
export const runtime = "nodejs"
export const alt = "Aminta — Feed it. Grow on X."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// 16×13 pixel grid from DemonMascot — B/H/M=black, E=bg (cutout), .=transparent
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

const BG = "#74f7b5"
const PX = 19

export default async function Image() {
  const fontData = await readFile(
    path.join(process.cwd(), "public", "PressStart2P.ttf")
  )

  return new ImageResponse(
    (
      <div
        style={{
          background: BG,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 72,
          padding: "0 110px",
        }}
      >
        {/* Pixel demon head */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {ROWS.map((row, y) => (
            <div key={y} style={{ display: "flex" }}>
              {row.split("").map((ch, x) => (
                <div
                  key={x}
                  style={{
                    width: PX,
                    height: PX,
                    background:
                      ch === "E" ? BG :
                      ch === "." ? "transparent" :
                      "#000",
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Text — two lines */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            fontFamily: "'Press Start 2P'",
            fontSize: 62,
            color: "#000",
            lineHeight: 1,
            letterSpacing: -1,
          }}
        >
          <span>[ feed aminta.</span>
          <span>  grow on x ]</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Press Start 2P",
          data: fontData,
          style: "normal",
          weight: 400,
        },
      ],
    }
  )
}

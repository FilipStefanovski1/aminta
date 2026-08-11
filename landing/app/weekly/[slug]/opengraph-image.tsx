import { ImageResponse } from "next/og"
import { readFile } from "fs/promises"
import path from "path"
import { getEditionBySlug } from "@/content/weekly/registry"

export const runtime = "nodejs"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const BG = "#111318"
const ACCENT = "#74f7b5"

// Guesses a data-URI mime type from the file extension. Hero masters are
// PNG (not WEBP) specifically because Satori — the renderer behind
// next/og's ImageResponse — cannot reliably decode WEBP; feeding it a WEBP
// data URI fails with an opaque "u2 is not iterable" error instead of a
// clear one. next/image re-encodes to WebP/AVIF for browsers automatically
// at request time regardless of the source format, so nothing is lost by
// keeping PNG as the master asset.
function mimeTypeFor(filePath: string): string {
  if (filePath.endsWith(".png")) return "image/png"
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg"
  if (filePath.endsWith(".webp")) return "image/webp"
  return "image/png"
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const edition = getEditionBySlug(slug)
  const title = edition?.meta.title ?? "Aminta Weekly"
  const editionLabel = edition ? `EDITION ${String(edition.meta.edition).padStart(3, "0")}` : "AMINTA WEEKLY"

  const fontData = await readFile(path.join(process.cwd(), "public", "PressStart2P.ttf"))

  // Reuses the same editorial hero artwork as the article/card, composited
  // as a full-bleed background with a dark gradient overlay so the text
  // stays readable — one visual identity instead of a second, unrelated one
  // built just for social sharing. Falls back to a flat background if the
  // edition (or its hero file) can't be found, so a bad slug never 500s.
  let heroDataUri: string | null = null
  if (edition) {
    try {
      const heroBuffer = await readFile(path.join(process.cwd(), "public", edition.meta.heroImage))
      heroDataUri = `data:${mimeTypeFor(edition.meta.heroImage)};base64,${heroBuffer.toString("base64")}`
    } catch {
      heroDataUri = null
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: BG,
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
        }}
      >
        {heroDataUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroDataUri}
            alt=""
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        {/* Flat dark scrim over the artwork, not just a bottom-weighted
            gradient — the title text spans most of the canvas height, so a
            uniform overlay keeps it legible regardless of what's directly
            behind it, while still letting the artwork's color and shapes
            read through. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            background: heroDataUri ? "rgba(10,10,12,0.82)" : "transparent",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "100%",
            padding: "0 100px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* Same mark used in LegalNav.tsx / Footer.tsx — horns + body + two eyes on a 16x13 grid. */}
            <svg width="52" height="42" viewBox="0 0 16 13">
              <rect x="2" y="0" width="2" height="3" fill={ACCENT} />
              <rect x="12" y="0" width="2" height="3" fill={ACCENT} />
              <rect x="3" y="3" width="10" height="9" fill={ACCENT} />
              <rect x="4" y="6" width="2" height="2" fill="#0a0a0a" />
              <rect x="10" y="6" width="2" height="2" fill="#0a0a0a" />
            </svg>
            <span style={{ fontFamily: "'Press Start 2P'", fontSize: 20, color: ACCENT }}>
              {editionLabel}
            </span>
          </div>

          <div
            style={{
              marginTop: 40,
              fontFamily: "'Press Start 2P'",
              fontSize: 44,
              color: "#f4f4f6",
              lineHeight: 1.5,
              maxWidth: 920,
            }}
          >
            {title}
          </div>

          <div style={{ marginTop: 40, fontFamily: "'Press Start 2P'", fontSize: 16, color: "#999" }}>
            amintaapp.com/weekly
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Press Start 2P", data: fontData, style: "normal", weight: 400 }],
    }
  )
}

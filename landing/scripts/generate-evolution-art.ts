// Generates the LV1-LV9 evolution-art CANDIDATE collection (see the
// "AMINTA — REDESIGN ALL 9 LEVEL / EVOLUTION ARTWORKS" task). Candidates
// only — writes to public/evolutions-v2-candidates/, never touches any
// production asset path.
//
// No diffusion/generative-AI image-model tool was available in this
// environment (checked thoroughly — no image-generation MCP/plugin was
// connected). Instead this uses the one genuinely available, deterministic
// image pipeline: hand-authored SVG, rasterized to PNG via `sharp`
// (already a project dependency, bundled with librsvg). This is not a
// fallback of convenience — Aminta's own canonical mark (see
// public/aminta-logo.svg and extension/assets/icon128.png) IS a literal
// rectangle grid, so a procedural renderer *guarantees* pixel-perfect
// silhouette lock across all 9 levels, something a diffusion model cannot
// guarantee (and this task explicitly treats silhouette drift as a QA
// failure). The character silhouette below is copied exactly from
// aminta-logo.svg's own coordinate grid — not reinterpreted.
//
// Run: npx tsx scripts/generate-evolution-art.ts
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

const OUT_DIR = join(import.meta.dirname, "..", "public", "evolutions-v2-candidates")
mkdirSync(OUT_DIR, { recursive: true })

const CANVAS = 100 // local SVG coordinate space, 0-100 square
const EXPORT_PX = 1024 // final PNG resolution

// ─── Canonical Aminta silhouette ────────────────────────────────────────
// Exact grid copied from public/aminta-logo.svg (20 wide x 17 tall):
// left ear (4,2,2,3), right ear (14,2,2,3), body (5,5,10,9),
// left eye (6,8,2,2), right eye (12,8,2,2). This is the ONLY silhouette
// used across all 9 levels — recolored and rescaled, never reshaped.
const GRID_W = 20
const GRID_H = 17

interface Palette {
  id: string
  name: string // production name (demon-data.ts / evolution.ts)
  rarity: string
  skyTop: string
  skyBottom: string
  ground: string
  body: string
  bodyHi: string
  bodyLo: string
  eye: string
  aura: string
  auraR: number
  scale: number // mascot scale multiplier, grows with level
  levitate: number // vertical lift in canvas units, 0 = grounded
  outline?: string // rim-light outline color (LV9 only)
}

const PALETTES: Palette[] = [
  { id: "lv1-dormant",     name: "Dormant",     rarity: "COMMON",    skyTop: "#050705", skyBottom: "#0a120c", ground: "#030503", body: "#0d1a12", bodyHi: "#16281c", bodyLo: "#060d08", eye: "#e8f2ea", aura: "rgba(40,90,60,0.16)",  auraR: 22, scale: 1.00, levitate: 0 },
  { id: "lv2-curious",     name: "Curious",     rarity: "COMMON",    skyTop: "#061007", skyBottom: "#0d1c12", ground: "#050a06", body: "#123020", bodyHi: "#1f4a30", bodyLo: "#081810", eye: "#eafff1", aura: "rgba(80,160,100,0.20)", auraR: 23, scale: 1.05, levitate: 0 },
  { id: "lv3-happy",       name: "Happy",       rarity: "UNCOMMON",  skyTop: "#061c26", skyBottom: "#0d3542", ground: "#04141c", body: "#0d2b33", bodyHi: "#1e5262", bodyLo: "#061a20", eye: "#eafcff", aura: "rgba(56,192,255,0.22)", auraR: 24, scale: 1.10, levitate: 0 },
  { id: "lv4-excited",     name: "Excited",     rarity: "UNCOMMON",  skyTop: "#160a2c", skyBottom: "#341454", ground: "#0d0620", body: "#241b45", bodyHi: "#3d2c78", bodyLo: "#140f2a", eye: "#f2ecff", aura: "rgba(169,140,255,0.26)", auraR: 25, scale: 1.15, levitate: 0 },
  { id: "lv5-mischievous", name: "Mischievous", rarity: "RARE",      skyTop: "#0d0518", skyBottom: "#210b3a", ground: "#08041a", body: "#2a1245", bodyHi: "#4c2078", bodyLo: "#160828", eye: "#f6ecff", aura: "rgba(160,50,220,0.30)", auraR: 26, scale: 1.20, levitate: 0 },
  { id: "lv6-confident",   name: "Confident",   rarity: "RARE",      skyTop: "#050a1e", skyBottom: "#101a44", ground: "#04081a", body: "#1c1a4a", bodyHi: "#373380", bodyLo: "#0e0d2c", eye: "#eef0ff", aura: "rgba(110,120,255,0.34)", auraR: 27, scale: 1.25, levitate: 0 },
  { id: "lv7-guardian",    name: "Guardian",    rarity: "EPIC",      skyTop: "#0a0620", skyBottom: "#1c1048", ground: "#08051a", body: "#2a1a5a", bodyHi: "#4c3aa0", bodyLo: "#160c34", eye: "#f4f0ff", aura: "rgba(190,150,255,0.40)", auraR: 30, scale: 1.32, levitate: 4 },
  { id: "lv8-mythic",      name: "Mythic",      rarity: "EPIC",      skyTop: "#03040f", skyBottom: "#0c0d2c", ground: "#020310", body: "#160f3a", bodyHi: "#2e2270", bodyLo: "#0a0722", eye: "#f0f2ff", aura: "rgba(130,150,255,0.44)", auraR: 33, scale: 1.38, levitate: 7 },
  { id: "lv9-ascended",    name: "Ascended",    rarity: "LEGENDARY", skyTop: "#0a0806", skyBottom: "#120e08", ground: "#080603", body: "#0a0a0a", bodyHi: "#1c1a14", bodyLo: "#040403", eye: "#fff8e0", aura: "rgba(245,200,80,0.52)", auraR: 38, scale: 1.48, levitate: 5, outline: "#f5c356" },
]

// ─── Shared building blocks ──────────────────────────────────────────────

function star(x: number, y: number, r: number, color: string, opacity: number): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`
}

function pixelDot(x: number, y: number, s: number, color: string, opacity: number): string {
  return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${color}" opacity="${opacity}" shape-rendering="crispEdges"/>`
}

// Radial soft glow behind the mascot — the primary "rarity/power" signal,
// per the brief's explicit "don't just add more glow at every level, but
// DO grow the aura" language for higher tiers.
function auraGlow(cx: number, cy: number, r: number, color: string): string {
  return `
    <defs><radialGradient id="aura-${cx}-${cy}-${r}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#aura-${cx}-${cy}-${r})"/>`
}

// The canonical mascot — exact aminta-logo.svg grid (20x17), recolored and
// rescaled only. cx/cy = center of the body in canvas units. `lift` raises
// it off the ground for LV7-9's levitation. Never adds/removes shapes.
function mascot(p: Palette, cx: number, cy: number): string {
  const unit = 1.75 * p.scale // canvas-units per grid cell
  const gw = GRID_W * unit
  const gh = GRID_H * unit
  const ox = cx - gw / 2
  const oy = cy - gh / 2 - p.levitate
  const g = (gx: number, gy: number, gw2: number, gh2: number) =>
    `x="${(ox + gx * unit).toFixed(2)}" y="${(oy + gy * unit).toFixed(2)}" width="${(gw2 * unit).toFixed(2)}" height="${(gh2 * unit).toFixed(2)}"`

  // Rim-light (LV9 only) — outlines the ear/body shapes individually so it
  // hugs the actual silhouette instead of reading as a bounding-box frame
  // floating over the gap between the ears.
  const sw = 0.5 * p.scale
  const outline = p.outline
    ? [
        `<rect ${g(4, 2, 2, 3)} fill="none" stroke="${p.outline}" stroke-width="${sw}" opacity="0.9"/>`,
        `<rect ${g(14, 2, 2, 3)} fill="none" stroke="${p.outline}" stroke-width="${sw}" opacity="0.9"/>`,
        `<rect ${g(5, 5, 10, 9)} fill="none" stroke="${p.outline}" stroke-width="${sw}" opacity="0.9"/>`,
      ].join("\n      ")
    : ""

  return `
    <g shape-rendering="crispEdges">
      ${outline}
      <!-- ears -->
      <rect ${g(4, 2, 2, 3)} fill="${p.body}"/>
      <rect ${g(14, 2, 2, 3)} fill="${p.body}"/>
      <rect ${g(4, 2, 2, 1)} fill="${p.bodyHi}"/>
      <rect ${g(14, 2, 2, 1)} fill="${p.bodyHi}"/>
      <!-- body -->
      <rect ${g(5, 5, 10, 9)} fill="${p.body}"/>
      <rect ${g(5, 5, 10, 2)} fill="${p.bodyHi}"/>
      <rect ${g(5, 12, 10, 2)} fill="${p.bodyLo}"/>
      <!-- eyes -->
      <rect ${g(6, 8, 2, 2)} fill="${p.eye}"/>
      <rect ${g(12, 8, 2, 2)} fill="${p.eye}"/>
    </g>`
}

function groundPlane(p: Palette, y: number): string {
  return `<rect x="0" y="${y}" width="${CANVAS}" height="${CANVAS - y}" fill="${p.ground}"/>
          <rect x="0" y="${y - 0.6}" width="${CANVAS}" height="0.6" fill="${p.bodyHi}" opacity="0.15"/>`
}

function skyGradientDefs(p: Palette, id: string): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${p.skyTop}"/>
    <stop offset="100%" stop-color="${p.skyBottom}"/>
  </linearGradient>`
}

// ─── Per-level environments (0-100 canvas units, ground line varies) ─────
// Direction follows the brief's own mood/environment/color spec for each
// level; motifs (moon, fireflies, mushrooms, ruins, rings, cosmos, gold
// temple) echo the existing production SceneElements in
// components/AmintaEvolutionGrid.tsx, redrawn at full-artwork scale/detail
// rather than the original tiny 200x120 card-thumbnail versions.

function sceneLv1(p: Palette): string {
  return `
    ${groundPlane(p, 78)}
    ${star(78, 16, 6, "#c8d8e8", 0.5)}
    ${star(80, 16, 5, p.skyBottom, 1)}
    ${star(20, 10, 0.4, "#c8d8e8", 0.4)}
    ${star(55, 8, 0.3, "#c8d8e8", 0.3)}
    <rect x="0" y="70" width="18" height="10" fill="${p.ground}" opacity="0.9"/>
    <rect x="82" y="68" width="18" height="12" fill="${p.ground}" opacity="0.9"/>`
}

function sceneLv2(p: Palette): string {
  const fireflies = [
    [30, 60], [42, 68], [58, 52], [66, 64], [22, 48], [72, 58], [50, 40],
  ].map(([x, y], i) => star(x, y, 0.55, "#ffcf70", 0.75 - (i % 3) * 0.1))
  return `
    ${groundPlane(p, 80)}
    ${star(16, 14, 5, "#c8e0d8", 0.5)}
    <polygon points="0,80 10,44 22,80" fill="${p.bodyLo}" opacity="0.7"/>
    <polygon points="80,80 92,38 100,80" fill="${p.bodyLo}" opacity="0.7"/>
    ${fireflies.join("\n    ")}
    <rect x="14" y="76" width="3" height="4" fill="${p.bodyHi}" opacity="0.5"/>
    <rect x="70" y="77" width="2" height="3" fill="${p.bodyHi}" opacity="0.5"/>`
}

function sceneLv3(p: Palette): string {
  return `
    ${groundPlane(p, 78)}
    ${star(20, 10, 0.5, "#a8ffd2", 0.6)}
    ${star(66, 8, 0.4, "#74f7b5", 0.5)}
    ${star(84, 16, 0.5, "#40e898", 0.6)}
    <polygon points="0,78 12,30 26,78" fill="${p.bodyLo}" opacity="0.85"/>
    <polygon points="76,78 90,26 100,78" fill="${p.bodyLo}" opacity="0.85"/>
    <!-- mushrooms -->
    <rect x="24" y="72" width="2.4" height="6" fill="#123028"/>
    <ellipse cx="25.2" cy="71" rx="5" ry="3" fill="#1e5262"/>
    <ellipse cx="25.2" cy="70.4" rx="5" ry="3" fill="none" stroke="#74f7b5" stroke-width="0.4" opacity="0.5"/>
    <rect x="68" y="74" width="2" height="5" fill="#123028"/>
    <ellipse cx="69" cy="73" rx="3.6" ry="2.2" fill="#1e5262"/>
    ${star(25, 68, 3, "#74f7b5", 0.10)}
    ${star(69, 71, 2.4, "#74f7b5", 0.10)}`
}

function sceneLv4(p: Palette): string {
  return `
    ${groundPlane(p, 82)}
    ${star(80, 16, 5.5, "#d8c8f0", 0.55)}
    ${star(20, 8, 0.5, "#d8c8f0", 0.5)}
    ${star(38, 12, 0.4, "#e0d0ff", 0.6)}
    ${star(60, 6, 0.5, "#d8c8f0", 0.4)}
    <polygon points="0,82 18,26 36,82" fill="${p.bodyLo}" opacity="0.9"/>
    <polygon points="20,82 44,14 68,82" fill="${p.body}" opacity="0.95"/>
    <polygon points="52,82 76,22 100,82" fill="${p.bodyLo}" opacity="0.9"/>
    ${auraGlow(50, 30, 22, "rgba(200,170,255,0.10)")}`
}

function sceneLv5(p: Palette): string {
  return `
    ${groundPlane(p, 84)}
    <!-- ruin pillars -->
    <rect x="6" y="34" width="8" height="50" fill="${p.bodyLo}"/>
    <polygon points="6,34 10,26 14,34" fill="${p.bodyLo}"/>
    <rect x="82" y="20" width="9" height="64" fill="${p.body}"/>
    <polygon points="82,20 86.5,10 91,20" fill="${p.body}"/>
    <rect x="20" y="50" width="6" height="34" fill="${p.bodyLo}" opacity="0.8"/>
    ${pixelDot(30, 40, 1.1, "#c060ff", 0.9)}
    ${pixelDot(70, 30, 1.3, "#a020e0", 0.85)}
    ${pixelDot(46, 20, 0.8, "#e0a0ff", 0.8)}
    ${pixelDot(60, 55, 0.9, "#c060ff", 0.7)}
    ${pixelDot(16, 60, 0.7, "#e0a0ff", 0.6)}
    ${auraGlow(50, 45, 20, "rgba(180,60,240,0.12)")}`
}

function sceneLv6(p: Palette): string {
  return `
    ${groundPlane(p, 82)}
    <rect x="4" y="20" width="9" height="64" fill="${p.bodyLo}"/>
    <rect x="87" y="16" width="9" height="68" fill="${p.bodyLo}"/>
    <ellipse cx="50" cy="83" rx="30" ry="5" fill="none" stroke="#4060ff" stroke-width="0.8" opacity="0.7"/>
    <ellipse cx="50" cy="83" rx="22" ry="3.6" fill="none" stroke="#6a8cff" stroke-width="0.6" opacity="0.5"/>
    <ellipse cx="50" cy="83" rx="14" ry="2.2" fill="none" stroke="#9db0ff" stroke-width="0.5" opacity="0.4"/>
    ${star(24, 30, 0.5, "#80c8ff", 0.7)}
    ${star(74, 26, 0.5, "#80c8ff", 0.6)}
    ${star(40, 16, 0.4, "#a0d0ff", 0.5)}
    ${auraGlow(50, 44, 24, "rgba(90,110,255,0.14)")}`
}

function sceneLv7(p: Palette): string {
  const stars = [[10,10],[24,6],[40,14],[60,8],[76,16],[90,10],[16,24],[84,26]]
    .map(([x,y],i)=>star(x,y,0.5,"#e8dcff",0.4+(i%3)*0.15)).join("\n    ")
  return `
    ${groundPlane(p, 86)}
    <ellipse cx="50" cy="90" rx="60" ry="10" fill="${p.body}" opacity="0.6"/>
    <!-- floating celestial pillars, gap = otherworldly -->
    <rect x="8" y="30" width="8" height="40" fill="${p.bodyLo}" opacity="0.9"/>
    <rect x="84" y="24" width="8" height="46" fill="${p.bodyLo}" opacity="0.9"/>
    ${stars}
    <ellipse cx="50" cy="60" rx="34" ry="30" fill="none" stroke="#c8a8ff" stroke-width="0.4" opacity="0.25"/>
    ${auraGlow(50, 50, 30, "rgba(190,150,255,0.16)")}
    <ellipse cx="50" cy="${86 + 3}" rx="16" ry="3" fill="#000" opacity="0.35"/>`
}

function sceneLv8(p: Palette): string {
  const stars = Array.from({ length: 22 }, (_, i) => {
    const x = (i * 37) % 100
    const y = (i * 53) % 70
    return star(x, y, 0.3 + (i % 3) * 0.15, "#ffffff", 0.35 + (i % 4) * 0.12)
  }).join("\n    ")
  return `
    ${stars}
    <circle cx="20" cy="24" r="10" fill="#2a1450"/>
    <ellipse cx="20" cy="24" rx="17" ry="4" fill="none" stroke="#6a2a90" stroke-width="1.4" opacity="0.85"/>
    <ellipse cx="20" cy="24" rx="17" ry="4" fill="none" stroke="#aa60d0" stroke-width="0.5" opacity="0.4"/>
    <circle cx="82" cy="16" r="5.5" fill="#160c30"/>
    <circle cx="82" cy="16" r="5.5" fill="none" stroke="#4030a0" stroke-width="0.4" opacity="0.6"/>
    ${auraGlow(50, 62, 30, "rgba(130,150,255,0.20)")}
    <ellipse cx="50" cy="86" rx="14" ry="3" fill="#3a2a90" opacity="0.4"/>
    ${star(50, 62, 0.6, "#e0d8ff", 0.9)}`
}

function sceneLv9(p: Palette): string {
  return `
    <defs>
      <radialGradient id="rays9" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stop-color="#f5c356" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#f5c356" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="100" height="100" fill="url(#rays9)"/>
    <!-- monumental gold pillars -->
    <rect x="4" y="10" width="11" height="76" fill="#160f08"/>
    <rect x="4" y="10" width="11" height="4" fill="#3a2a10"/>
    <rect x="4" y="82" width="11" height="4" fill="#3a2a10"/>
    <rect x="7" y="16" width="2" height="62" fill="#2a1e0c"/>
    <rect x="85" y="6" width="11" height="80" fill="#160f08"/>
    <rect x="85" y="6" width="11" height="4" fill="#3a2a10"/>
    <rect x="85" y="82" width="11" height="4" fill="#3a2a10"/>
    <rect x="88" y="12" width="2" height="66" fill="#2a1e0c"/>
    <!-- altar rings -->
    <ellipse cx="50" cy="88" rx="34" ry="6" fill="none" stroke="#a07010" stroke-width="1.4" opacity="0.8"/>
    <ellipse cx="50" cy="88" rx="24" ry="4.2" fill="none" stroke="#e0b030" stroke-width="1" opacity="0.6"/>
    <ellipse cx="50" cy="88" rx="14" ry="2.6" fill="none" stroke="#ffe090" stroke-width="0.7" opacity="0.5"/>
    ${[[20,20],[76,14],[34,8],[62,10],[90,30],[10,34]].map(([x,y])=>star(x,y,0.4,"#f0e090",0.6)).join("\n    ")}
    ${auraGlow(50, 55, 30, "rgba(245,200,80,0.22)")}
    <ellipse cx="50" cy="90" rx="18" ry="3.4" fill="#000" opacity="0.4"/>`
}

const SCENES: Record<string, (p: Palette) => string> = {
  "lv1-dormant": sceneLv1, "lv2-curious": sceneLv2, "lv3-happy": sceneLv3,
  "lv4-excited": sceneLv4, "lv5-mischievous": sceneLv5, "lv6-confident": sceneLv6,
  "lv7-guardian": sceneLv7, "lv8-mythic": sceneLv8, "lv9-ascended": sceneLv9,
}

// Ground/levitation Y per level — mascot's feet position in canvas units.
const FOOT_Y: Record<string, number> = {
  "lv1-dormant": 82, "lv2-curious": 83, "lv3-happy": 82, "lv4-excited": 84,
  "lv5-mischievous": 86, "lv6-confident": 85, "lv7-guardian": 88,
  "lv8-mythic": 90, "lv9-ascended": 92,
}

function composeSVG(p: Palette): string {
  const skyId = `sky-${p.id}`
  const footY = FOOT_Y[p.id]
  const gh = GRID_H * 0.62 * p.scale
  const cy = footY - gh / 2
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${EXPORT_PX}" height="${EXPORT_PX}">
  <defs>${skyGradientDefs(p, skyId)}</defs>
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="url(#${skyId})"/>
  ${SCENES[p.id](p)}
  ${auraGlow(50, cy, p.auraR, p.aura)}
  ${mascot(p, 50, cy)}
</svg>`
}

async function renderLevel(p: Palette, index: number): Promise<Buffer> {
  const svg = composeSVG(p)
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  const outPath = join(OUT_DIR, `${p.id}.png`)
  writeFileSync(outPath, png)
  console.log(`LV${index + 1} ${p.name.padEnd(12)} (${p.rarity.padEnd(9)}) -> ${outPath}`)
  return png
}

async function buildContactSheet(buffers: Buffer[]) {
  const cell = 340
  const pad = 16
  const labelH = 54
  const cols = 3
  const rows = 3
  const sheetW = cols * cell + (cols + 1) * pad
  const sheetH = rows * (cell + labelH) + (rows + 1) * pad

  const composites: sharp.OverlayOptions[] = []
  const labels: string[] = []

  for (let i = 0; i < PALETTES.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = pad + col * (cell + pad)
    const y = pad + row * (cell + labelH + pad)
    const resized = await sharp(buffers[i]).resize(cell, cell).toBuffer()
    composites.push({ input: resized, left: x, top: y })
    const p = PALETTES[i]
    labels.push(`
      <text x="${x + cell / 2}" y="${y + cell + 20}" text-anchor="middle" font-family="monospace" font-size="15" fill="#ffffff" font-weight="bold">LV.${i + 1} ${p.name}</text>
      <text x="${x + cell / 2}" y="${y + cell + 40}" text-anchor="middle" font-family="monospace" font-size="12" fill="#9aa0aa">${p.rarity}</text>`)
  }

  const labelSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">${labels.join("\n")}</svg>`

  const base = sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: "#0a0a0a" } })
  const withCells = await base.composite(composites).png().toBuffer()
  const final = await sharp(withCells).composite([{ input: Buffer.from(labelSVG), left: 0, top: 0 }]).png().toBuffer()
  const outPath = join(OUT_DIR, "contact-sheet.png")
  writeFileSync(outPath, final)
  console.log(`Contact sheet -> ${outPath}`)
}

async function main() {
  const buffers: Buffer[] = []
  for (let i = 0; i < PALETTES.length; i++) {
    buffers.push(await renderLevel(PALETTES[i], i))
  }
  await buildContactSheet(buffers)
}

main()

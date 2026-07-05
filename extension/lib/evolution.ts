import excitedGif from "url:~/assets/excited.gif"

export type EvolutionStage = "Egg" | "Imp" | "Familiar" | "Guardian" | "Ancient"

export const MAX_LEVEL = 10

// Cumulative XP needed to REACH each level (index = level - 1).
// Level 1 costs 300 XP; each subsequent level costs ~1.5× more than the previous.
// Gaps: 300 · 450 · 650 · 900 · 1200 · 1700 · 2300 · 3000 · 4000
// Max (level 10): 14,500 XP ≈ 29 days at the 500 XP/day cap.
export const LEVEL_THRESHOLDS = [0, 300, 750, 1400, 2300, 3500, 5200, 7500, 10500, 14500]

// [minXP, stage, tint] — coarse 5-tier groupings used by getEvolutionStage
const STAGES: [number, EvolutionStage, string][] = [
  [0,     "Egg",      "#8ca0b0"],
  [750,   "Imp",      "#74f7b5"],
  [2300,  "Familiar", "#74d4f7"],
  [5200,  "Guardian", "#c0a0ff"],
  [10500, "Ancient",  "#f5d060"],
]

export function getLevel(xp: number): number {
  let level = 1
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1
    else break
  }
  return level
}

export function getXpInLevel(xp: number): number {
  const level = getLevel(xp)
  return xp - LEVEL_THRESHOLDS[level - 1]
}

// XP span for the current level (used for progress bar denominator).
export function getLevelSpan(xp: number): number {
  const level = getLevel(xp)
  if (level >= MAX_LEVEL) return LEVEL_THRESHOLDS[MAX_LEVEL - 1] - LEVEL_THRESHOLDS[MAX_LEVEL - 2]
  return LEVEL_THRESHOLDS[level] - LEVEL_THRESHOLDS[level - 1]
}

export function getXpProgress(xp: number): number {
  const level = getLevel(xp)
  if (level >= MAX_LEVEL) return 100
  const span = LEVEL_THRESHOLDS[level] - LEVEL_THRESHOLDS[level - 1]
  return Math.round((getXpInLevel(xp) / span) * 100)
}

export function getEvolutionStage(xp: number): EvolutionStage {
  let stage: EvolutionStage = "Egg"
  for (const [min, s] of STAGES) {
    if (xp >= min) stage = s
  }
  return stage
}

// Accent color follows the current form, so the whole UI shifts hue at every
// evolution (not just the 5 coarse STAGES tiers).
export function getStageTint(xp: number): string {
  return getForm(xp).color
}

export function getNextStage(xp: number): { name: string; xpNeeded: number } | null {
  const level = getLevel(xp)
  if (level >= FORMS.length) return null
  const nextForm = FORMS[level] // FORMS[level] is the level+1 form (0-indexed)
  return { name: nextForm.revealed ? nextForm.name : "a new form", xpNeeded: LEVEL_THRESHOLDS[level] - xp }
}

// ─── Pixel art system ────────────────────────────────────────────────────────
//
// Each row must be exactly 16 characters. Chars:
//   B = body       H = horn       E = eye (blink-animated)
//   M = mouth      X = mark       C = crystal / gem
//   . = transparent
//
// Eye blink groups: E at x < 8 → left eye (.demon-eye);
//                   E at x ≥ 8 → right eye (.demon-eye-r)

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY"

export interface DemonSkin {
  body:      string
  horn:      string
  eye:       string
  mark?:     string    // X char — arcane mark color; defaults to horn
  crystal?:  string    // C char — gem / crystal color; defaults to eye
  rows?:     string[]  // per-form 16-wide grid; omit to use DemonMascot fallback
  gif?:      string    // animated GIF override — renders <img> instead of SVG when set
}

export interface Form {
  level:    number
  name:     string
  color:    string
  rarity:   Rarity
  blurb:    string
  revealed: boolean
  skin:     DemonSkin
}

// ─── Evolution forms ─────────────────────────────────────────────────────────
// Grid: 16 columns wide. Happy (LV3) is the canonical master template.
// Every form duplicates Happy's exact body structure and only overlays decorative
// pixels (eyebrows, blush, marks, highlights, teeth, tongue, tiny horn changes).
// Eye split midpoint: x < 8 = left (.demon-eye); x >= 8 = right (.demon-eye-r)
//
// Happy base rows (all 13 rows, all 16 chars — the sacred template):
//   R0:  "...H........H..."   horn tips (H at x=3, x=12)
//   R1:  "..HHB......BHH.."   horn roots
//   R2:  "..HHBB....BBHH.."   horn-body junction
//   R3:  "..BBBBBBBBBBBB.."   forehead
//   R4:  ".BBBBBBBBBBBBBB."   upper head
//   R5:  ".BBBBBBBBBBBBBB."   brow area
//   R6:  ".BBEEBBBBBBEEBB."   eyes row 1 (E at x=3,4 and x=11,12)
//   R7:  ".BBEEBBBBBBEEBB."   eyes row 2
//   R8:  ".BBBBBBBBBBBBBB."   cheeks
//   R9:  ".BBBBMMMMMMBBBB."   mouth top (M at x=5–10)
//   R10: ".BBBBBMMMMBBBBBB"   mouth bottom (M at x=6–9)
//   R11: "..BBBBBBBBBBBB.."   chin
//   R12: "...BBBBBBBBBB..."   jaw
export const FORMS: Form[] = [

  // ── Form 1: Dormant ── emotionless; closed eyes (M slit in bottom row only); tiny dot mouth
  {
    level: 1, name: "Dormant", color: "#74f7b5", rarity: "COMMON",
    blurb: "Just woke up. Feed it to begin.", revealed: true,
    skin: {
      body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5",
      rows: [
        "...H........H...",  // R0
        "..HHB......BHH..",  // R1
        "..HHBB....BBHH..",  // R2
        "..BBBBBBBBBBBB..",  // R3
        ".BBBBBBBBBBBBBB.",  // R4
        ".BBBBBBBBBBBBBB.",  // R5  blank brow
        ".BBBBBBBBBBBBBB.",  // R6  top eyelid down — no E visible
        ".BBBMMBBBBBBMMB.",  // R7  thin M slit where eyes would be (x=3,4 and x=11,12)
        ".BBBBBBBBBBBBBB.",  // R8
        ".BBBBBBMMBBBBBB.",  // R9  tiny 2M mouth centered at x=7,8
        ".BBBBBBBBBBBBBBB",  // R10 blank lower
        "..BBBBBBBBBBBB..",  // R11
        "...BBBBBBBBBB...",  // R12
      ],
    },
  },

  // ── Form 2: Curious ── alert; 1px-wide open eyes; small 4M smile
  {
    level: 2, name: "Curious", color: "#3fe0c8", rarity: "COMMON",
    blurb: "Starting to learn your voice.", revealed: true,
    skin: {
      body: "#14564a", horn: "#0c3a32", eye: "#5ff0d8",
      rows: [
        "...H........H...",  // R0
        "..HHB......BHH..",  // R1
        "..HHBB....BBHH..",  // R2
        "..BBBBBBBBBBBB..",  // R3
        ".BBBBBBBBBBBBBB.",  // R4
        ".BBBBBBBBBBBBBB.",  // R5  blank brow
        ".BBBEBBBBBBEBBB.",  // R6  1px-wide eyes: E at x=3 and x=11
        ".BBBEBBBBBBEBBB.",  // R7  same — narrow alert eyes
        ".BBBBBBBBBBBBBB.",  // R8
        ".BBBBBMMMMBBBBB.",  // R9  4M smile at x=6,7,8,9
        ".BBBBBBMMBBBBBBB",  // R10 small lower arc at x=7,8
        "..BBBBBBBBBBBB..",  // R11
        "...BBBBBBBBBB...",  // R12
      ],
    },
  },

  // ── Form 3: Happy ── canonical master template; full 2×2 eyes; wide 6M+4M grin
  {
    level: 3, name: "Happy", color: "#38c0ff", rarity: "UNCOMMON",
    blurb: "Posting feels good now.", revealed: true,
    skin: {
      body: "#134a66", horn: "#0c3247", eye: "#7ad0ff",
      rows: [
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
      ],
    },
  },

  // ── Form 4: Excited ── raised eyebrows; bicolor sparkle eyes; blush; 6M open grin; crystal teeth; tongue
  {
    level: 4, name: "Excited", color: "#6a8cff", rarity: "UNCOMMON",
    blurb: "Hungry for the next post.", revealed: true,
    skin: {
      body: "#3a52c8", horn: "#222e88", eye: "#c8d8ff",
      mark:    "#e86050",  // X = coral blush
      crystal: "#f4f4ff",  // C = white teeth
      gif:     excitedGif,
      rows: [
        "...H........H...",  // R0  same
        "..HHB......BHH..",  // R1  same
        "..HHBB....BBHH..",  // R2  same
        "..BMMBBBBBBMMB..",  // R3  eyebrows slammed into forehead (M at x=3,4 and x=11,12)
        ".BBBBBBBBBBBBBB.",  // R4  blank gap
        ".BBBBBBBBBBBBBB.",  // R5  blank gap — two empty rows between brow and eye = max lift
        ".XXCEBBBBBBECXX.",  // R6  bicolor shine: C(highlight) at x=3,12 + E(iris) at x=4,11; blush x=1,2,13,14
        ".XXEEBBBBBBEEXX.",  // R7  full 2×2 eyes (same as Happy) + blush continues
        ".XXXBBBBBBBBXXX.",  // R8  3-wide blush blocks at x=1,2,3 and x=12,13,14
        ".BBBBMMMMMMBBBB.",  // R9  same 6M mouth as Happy (not wider)
        ".BBBBBCCCCBBBBBB",  // R10 C white teeth at x=6,7,8,9 — open mouth
        "..BBBBBMMBBBBB..",  // R11 M tongue tip at x=7,8
        "...BBBBBBBBBB...",  // R12 same
      ],
    },
  },

  // ── Form 5: Mischievous ── M squint left / E open right; right-only eyebrow; right smirk + fang
  {
    level: 5, name: "Mischievous", color: "#a96cff", rarity: "UNCOMMON",
    blurb: "Knows your tricks. Adds its own.", revealed: true,
    skin: {
      body: "#4a2a80", horn: "#301a55", eye: "#c8a8ff",
      rows: [
        "...H........H...",  // R0
        "..HHB......BHH..",  // R1
        "..HHBB....BBHH..",  // R2
        "..BBBBBBBBBBBB..",  // R3
        ".BBBBBBBBBBBBBB.",  // R4
        ".BBBBBBBBBBBMMB.",  // R5  right eyebrow only: MM at x=12,13
        ".BBBMBBBBBBEEBB.",  // R6  L: M squint slit at x=3; R: 2px E at x=11,12
        ".BBBMBBBBBBEEBB.",  // R7  same asymmetric eyes
        ".BBBBBBBBBBBBBB.",  // R8
        ".BBBBBBBMMMMBBB.",  // R9  right-biased smirk: 4M at x=8,9,10,11
        ".BBBBBBBBBBBMBBB",  // R10 tiny right corner: M at x=12
        "..BBBBBBBBBBMB..",  // R11 fang: M at x=12
        "...BBBBBBBBBB...",  // R12
      ],
    },
  },

  // ── Form 6: Confident ── sharp angled brows; heavy-lidded half eyes; calm 4M half-smile
  {
    level: 6, name: "Confident", color: "#d65cff", rarity: "RARE",
    blurb: "Writes like you on a good day.", revealed: true,
    skin: {
      body: "#66248a", horn: "#45185f", eye: "#e8a8ff",
      mark: "#2a0a3a",  // X = dark brow marks
      rows: [
        "...H........H...",  // R0
        "..HHB......BHH..",  // R1
        "..HHBB....BBHH..",  // R2
        "..BBBBBBBBBBBB..",  // R3
        ".BBBBBBBBBBBBBB.",  // R4
        ".BMMBBBBBBBBMMB.",  // R5  M sharp brows at x=2,3 and x=12,13
        ".BBBBBBBBBBBBBB.",  // R6  top lid down — heavy-lidded
        ".BBEEBBBBBBEEBB.",  // R7  E only on bottom row — half-lids
        ".BBBBBBBBBBBBBB.",  // R8
        ".BBBBBMMMMBBBBB.",  // R9  calm 4M smile at x=6,7,8,9
        ".BBBBBBMMBBBBBBB",  // R10 small lower at x=7,8
        "..BBBBBBBBBBBB..",  // R11
        "...BBBBBBBBBB...",  // R12
      ],
    },
  },

  // ── Form 7: Guardian ── C sparkle above each eye; C horn tips; X cheeks; bold double-lip grin
  {
    level: 7, name: "Guardian", color: "#ff5cc4", rarity: "EPIC",
    blurb: "Keep going to reveal this form.", revealed: false,
    skin: {
      body: "#8a2470", horn: "#5f1850", eye: "#ffa8e0",
      crystal: "#ffd0f0",  // C = crystal sparkle
      mark:    "#3a1030",
      rows: [
        "...C........C...",  // R0  C crystal horn tips at x=3,12
        "..HHB......BHH..",  // R1
        "..HHBB....BBHH..",  // R2
        "..BBBBBBBBBBBB..",  // R3
        ".BBBBBBBBBBBBBB.",  // R4
        ".BBCBBBBBBBBCBB.",  // R5  C sparkle above each eye at x=3 and x=12
        ".BBEEBBBBBBEEBB.",  // R6  same 2×2 eyes
        ".BBEEBBBBBBEEBB.",  // R7  same
        ".BXBBBBBBBBBBXB.",  // R8  X cheek marks at x=2 and x=13
        ".BBBMMMMMMMMBBB.",  // R9  8M wide mouth at x=4–11
        ".BBBBMMMMMMBBBBB",  // R10 6M second lip row — bold open double-lip
        "..BBBBBBBBBBBB..",  // R11
        "...BBBBBBBBBB...",  // R12
      ],
    },
  },

  // ── Form 8: Mythic ── X brow+cheek marks; 8M mouth; crystal teeth; tongue
  {
    level: 8, name: "Mythic", color: "#ff5c7a", rarity: "EPIC",
    blurb: "Keep going to reveal this form.", revealed: false,
    skin: {
      body: "#8a2440", horn: "#5f1830", eye: "#ffa8b8",
      crystal: "#ffc0d0",  // C = white teeth
      mark:    "#3a1020",
      rows: [
        "...H........H...",  // R0
        "..HHB......BHH..",  // R1
        "..HHBB....BBHH..",  // R2
        "..BBBBBBBBBBBB..",  // R3
        ".BBBBBBBBBBBBBB.",  // R4
        ".BXBBBBBBBBBBXB.",  // R5  X brow marks at x=2 and x=13
        ".BBEEBBBBBBEEBB.",  // R6  same 2×2 eyes
        ".BBEEBBBBBBEEBB.",  // R7  same
        ".BXBBBBBBBBBBXB.",  // R8  X cheek marks
        ".BBBMMMMMMMMBBB.",  // R9  8M wide mouth at x=4–11
        ".BBBBBCCCCBBBBBB",  // R10 C white teeth at x=6,7,8,9
        "..BBBBBMMBBBBB..",  // R11 M tongue at x=7,8
        "...BBBBBBBBBB...",  // R12
      ],
    },
  },

  // ── Form 9: Ascended ── C crown gem; C eye-glow; X marks everywhere; teeth; tongue
  {
    level: 9, name: "Ascended", color: "#ff4d4d", rarity: "LEGENDARY",
    blurb: "The final form. Few ever see it.", revealed: false,
    skin: {
      body: "#8a2424", horn: "#5f1818", eye: "#ffa8a8",
      crystal: "#ffd0c0",  // C = crown gem + eye glow + teeth
      mark:    "#3a1010",
      rows: [
        "...C........C...",  // R0  C crystal horn tips (same silhouette as master)
        "..CCB......BCC..",  // R1  C crystal horn roots
        "..HHBB....BBHH..",  // R2
        "..BBBBBBBBBBBB..",  // R3
        ".BBBBBBBBBBBBBB.",  // R4
        ".BXBBBBBBBBBBXB.",  // R5  X marks at x=2 and x=13
        ".BCEEBBBBBBEECB.",  // R6  C glow at x=2,13; 2×2 E eyes
        ".BCEEBBBBBBEECB.",  // R7  same
        ".BXBBBBBBBBBBXB.",  // R8  X cheek marks
        ".BBBMMMMMMMMBBB.",  // R9  8M wide mouth
        ".BBBBBCCCCBBBBBB",  // R10 C crystal teeth at x=6,7,8,9
        "..BBBBBMMBBBBB..",  // R11 M tongue at x=7,8
        "...BBBBBBBBBB...",  // R12
      ],
    },
  },
]

// The form the companion is currently in (caps at the last form).
export function getForm(xp: number): Form {
  const level = getLevel(xp)
  return FORMS[Math.min(level, FORMS.length) - 1]
}

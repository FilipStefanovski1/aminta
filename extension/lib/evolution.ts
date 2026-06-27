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

// ─── Evolution forms ─────────────────────────────────────────────────────────
// One human-readable name per level. This is the single source of truth for what
// the companion is called — used by Home, the Evolve screen, and the level-up modal.

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY"

export interface DemonSkin {
  body: string
  horn: string
  eye:  string
}

export interface Form {
  level: number
  name: string
  color: string
  rarity: Rarity
  blurb: string
  revealed: boolean
  skin: DemonSkin
}

// Color sweeps cool → hot as Aminta grows: mint → cyan → blue → purple → pink → red.
// Skin palette matches landing/components/demon-data.ts exactly.
export const FORMS: Form[] = [
  { level: 1, name: "Dormant",     color: "#74f7b5", rarity: "COMMON",    blurb: "Just woke up. Feed it to begin.",       revealed: true,  skin: { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" } },
  { level: 2, name: "Curious",     color: "#3fe0c8", rarity: "COMMON",    blurb: "Starting to learn your voice.",          revealed: true,  skin: { body: "#14564a", horn: "#0c3a32", eye: "#5ff0d8" } },
  { level: 3, name: "Happy",       color: "#38c0ff", rarity: "UNCOMMON",  blurb: "Posting feels good now.",                revealed: true,  skin: { body: "#134a66", horn: "#0c3247", eye: "#7ad0ff" } },
  { level: 4, name: "Excited",     color: "#6a8cff", rarity: "UNCOMMON",  blurb: "Hungry for the next post.",              revealed: true,  skin: { body: "#2a3a7a", horn: "#1a2550", eye: "#9db0ff" } },
  { level: 5, name: "Mischievous", color: "#a96cff", rarity: "UNCOMMON",  blurb: "Knows your tricks. Adds its own.",       revealed: true,  skin: { body: "#4a2a80", horn: "#301a55", eye: "#c8a8ff" } },
  { level: 6, name: "Confident",   color: "#d65cff", rarity: "RARE",      blurb: "Writes like you on a good day.",         revealed: true,  skin: { body: "#66248a", horn: "#45185f", eye: "#e8a8ff" } },
  { level: 7, name: "Guardian",    color: "#ff5cc4", rarity: "EPIC",      blurb: "Keep going to reveal this form.",        revealed: false, skin: { body: "#8a2470", horn: "#5f1850", eye: "#ffa8e0" } },
  { level: 8, name: "Mythic",      color: "#ff5c7a", rarity: "EPIC",      blurb: "Keep going to reveal this form.",        revealed: false, skin: { body: "#8a2440", horn: "#5f1830", eye: "#ffa8b8" } },
  { level: 9, name: "Ascended",    color: "#ff4d4d", rarity: "LEGENDARY", blurb: "The final form. Few ever see it.",       revealed: false, skin: { body: "#8a2424", horn: "#5f1818", eye: "#ffa8a8" } },
]

// The form the companion is currently in (caps at the last form).
export function getForm(xp: number): Form {
  const level = getLevel(xp)
  return FORMS[Math.min(level, FORMS.length) - 1]
}

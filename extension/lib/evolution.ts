export type EvolutionStage = "Egg" | "Imp" | "Familiar" | "Guardian" | "Ancient"

export const XP_PER_LEVEL = 300
export const MAX_LEVEL = 10

// [minXP, stage, tint]
const STAGES: [number, EvolutionStage, string][] = [
  [0,    "Egg",      "#8ca0b0"],
  [600,  "Imp",      "#74f7b5"],
  [1200, "Familiar", "#74d4f7"],
  [1800, "Guardian", "#c0a0ff"],
  [2400, "Ancient",  "#f5d060"],
]

export function getLevel(xp: number): number {
  return Math.min(MAX_LEVEL, Math.floor(xp / XP_PER_LEVEL) + 1)
}

export function getXpInLevel(xp: number): number {
  const level = getLevel(xp)
  if (level === MAX_LEVEL) return xp - (MAX_LEVEL - 1) * XP_PER_LEVEL
  return xp % XP_PER_LEVEL
}

export function getXpProgress(xp: number): number {
  const level = getLevel(xp)
  if (level === MAX_LEVEL) return 100
  return Math.round((getXpInLevel(xp) / XP_PER_LEVEL) * 100)
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
  return { name: nextForm.revealed ? nextForm.name : "a new form", xpNeeded: level * XP_PER_LEVEL - xp }
}

// ─── Evolution forms ─────────────────────────────────────────────────────────
// One human-readable name per level. This is the single source of truth for what
// the companion is called — used by Home, the Evolve screen, and the level-up modal.

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY"

export interface Form {
  level: number
  name: string
  color: string
  rarity: Rarity
  blurb: string
  revealed: boolean
}

// Color sweeps cool → hot as Aminta grows: mint → cyan → blue → purple → pink → red.
export const FORMS: Form[] = [
  { level: 1, name: "Dormant",     color: "#74f7b5", rarity: "COMMON",    blurb: "Just woke up. Feed it to begin.",       revealed: true  },
  { level: 2, name: "Curious",     color: "#3fe0c8", rarity: "COMMON",    blurb: "Starting to learn your voice.",          revealed: true  },
  { level: 3, name: "Happy",       color: "#38c0ff", rarity: "UNCOMMON",  blurb: "Posting feels good now.",                revealed: true  },
  { level: 4, name: "Excited",     color: "#6a8cff", rarity: "UNCOMMON",  blurb: "Hungry for the next post.",              revealed: true  },
  { level: 5, name: "Mischievous", color: "#a96cff", rarity: "UNCOMMON",  blurb: "Knows your tricks. Adds its own.",       revealed: true  },
  { level: 6, name: "Confident",   color: "#d65cff", rarity: "RARE",      blurb: "Writes like you on a good day.",         revealed: true  },
  { level: 7, name: "Guardian",    color: "#ff5cc4", rarity: "EPIC",      blurb: "Keep going to reveal this form.",        revealed: false },
  { level: 8, name: "Mythic",      color: "#ff5c7a", rarity: "EPIC",      blurb: "Keep going to reveal this form.",        revealed: false },
  { level: 9, name: "Ascended",    color: "#ff4d4d", rarity: "LEGENDARY", blurb: "The final form. Few ever see it.",       revealed: false },
]

// The form the companion is currently in (caps at the last form).
export function getForm(xp: number): Form {
  const level = getLevel(xp)
  return FORMS[Math.min(level, FORMS.length) - 1]
}

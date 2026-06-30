// Dialogue module — owns all speech bubble text.
// Replaces getLine() in HomeTab. Add new lines here without touching the engine.

import { getLevel, LEVEL_THRESHOLDS } from "~lib/evolution"
import type { AmintaStore } from "~lib/storage"
import type { CompanionEvent, Mood } from "~lib/companion"

// ─── Types ────────────────────────────────────────────────────────────────────

export type DialogueLine = {
  text:    string | ((store: AmintaStore) => string)
  weight?: number   // relative weight for random selection; defaults to 1
}

// A selector matches when all provided fields match.
// Table is ordered: first match wins.
type DialogueSelector = {
  event?:  CompanionEvent
  mood?:   Mood
  when?:   (store: AmintaStore) => boolean
  lines:   DialogueLine[]
}

// ─── Dialogue table ───────────────────────────────────────────────────────────
// Order: most specific → least specific.

const DIALOGUE_TABLE: DialogueSelector[] = [

  // ── insert ───────────────────────────────────────────────────────────────
  { event: "insert", mood: "hungry", lines: [
    { text: (s) => `finally. ${s.streak > 0 ? `${s.streak}-day streak` : "streak"} lives.` },
    { text: "that's what i needed." },
  ]},
  { event: "insert", when: (s) => (s.xpToday ?? 0) >= 200, lines: [
    { text: "we're on fire today." },
    { text: "unstoppable." },
    { text: "don't stop now." },
  ]},
  { event: "insert", when: (s) => (s.xpToday ?? 0) >= 100, lines: [
    { text: "keep cooking." },
    { text: "two down. keep going." },
  ]},
  { event: "insert", lines: [
    { text: "nice. one more?" },
    { text: "that's the one." },
    { text: "posted. good." },
    { text: "yes. keep going." },
  ]},

  // ── mission_complete ──────────────────────────────────────────────────────
  { event: "mission_complete", lines: [
    { text: "all done. we crushed it today." },
    { text: "three for three." },
    { text: "daily missions: complete." },
  ]},

  // ── level_up ─────────────────────────────────────────────────────────────
  { event: "level_up", lines: [
    { text: "something changed." },
    { text: "i can feel it." },
    { text: "stronger now." },
    { text: "not the same as before." },
  ]},

  // ── generate_start ───────────────────────────────────────────────────────
  { event: "generate_start", lines: [
    { text: "on it..." },
    { text: "thinking..." },
    { text: "give me a second." },
    { text: "let me cook." },
  ]},

  // ── api_error ────────────────────────────────────────────────────────────
  { event: "api_error", lines: [
    { text: "need fuel. check your key." },
    { text: "something's wrong. check the key." },
  ]},

  // ── open: mood-specific ───────────────────────────────────────────────────
  { event: "open", mood: "sleeping", lines: [
    { text: "zzz..." },
    { text: "...hmm?" },
  ]},
  { event: "open", mood: "hungry", lines: [
    { text: (s) => `${s.streak}-day streak. don't break it now.` },
    { text: "i missed you. post something." },
  ]},
  { event: "open", when: (s) => (s.xpToday ?? 0) > 0, lines: [
    { text: "welcome back. keep going." },
    { text: "you were on a roll." },
    { text: "back for more?" },
  ]},
  { event: "open", lines: [
    { text: "i'm hungry. what are we posting?" },
    { text: "let's get one out today." },
  ]},

  // ── idle fallbacks: mood-aware ────────────────────────────────────────────
  { mood: "sleeping", lines: [
    { text: "zzz..." },
  ]},
  { mood: "pre_evolve", lines: [
    { text: (s) => {
      const level = getLevel(s.xp ?? 0)
      const xpLeft = LEVEL_THRESHOLDS[level] - (s.xp ?? 0)
      return `${xpLeft} XP to evolve.`
    }},
    { text: (s) => {
      const level = getLevel(s.xp ?? 0)
      const xpLeft = LEVEL_THRESHOLDS[level] - (s.xp ?? 0)
      return `almost there. ${xpLeft} XP left.`
    }},
  ]},
  { mood: "hungry", lines: [
    { text: (s) => `${s.streak > 0 ? `${s.streak}-day streak. ` : ""}don't break it now.` },
    { text: "it's been a while." },
  ]},

  // ── idle fallbacks: activity-aware ───────────────────────────────────────
  { when: (s) => (s.xpToday ?? 0) >= 200, lines: [
    { text: "we're on fire today." },
  ]},
  { when: (s) => (s.xpToday ?? 0) >= 100, lines: [
    { text: "keep cooking." },
    { text: "you're doing great." },
  ]},
  { when: (s) => (s.xpToday ?? 0) > 0, lines: [
    { text: "nice. one more?" },
    { text: "good progress today." },
  ]},

  // ── catch-all ─────────────────────────────────────────────────────────────
  { lines: [
    { text: "i'm hungry. what are we posting?" },
    { text: "what's on your mind?" },
    { text: (s) => s.streak > 0 ? `${s.streak}-day streak. let's keep it.` : "ready when you are." },
  ]},
]

// ─── Internals ────────────────────────────────────────────────────────────────

function pickLine(lines: DialogueLine[], store: AmintaStore): string {
  const total = lines.reduce((sum, l) => sum + (l.weight ?? 1), 0)
  let r = Math.random() * total
  for (const line of lines) {
    r -= (line.weight ?? 1)
    if (r <= 0) {
      const t = line.text
      return typeof t === "function" ? t(store) : t
    }
  }
  const last = lines[lines.length - 1].text
  return typeof last === "function" ? last(store) : last
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Returns the best matching dialogue line for the current event + mood + store.
// First matching selector wins. Falls through to catch-all if nothing matches.
export function resolveDialogue(
  event: CompanionEvent | null,
  mood:  Mood,
  store: AmintaStore
): string {
  for (const selector of DIALOGUE_TABLE) {
    const eventMatch     = !selector.event || selector.event === event
    const moodMatch      = !selector.mood  || selector.mood  === mood
    const conditionMatch = !selector.when  || selector.when(store)

    if (eventMatch && moodMatch && conditionMatch) {
      return pickLine(selector.lines, store)
    }
  }
  return "..."
}

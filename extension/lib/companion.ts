// Companion Engine — pure TypeScript, zero React imports.
// Single source of truth for Aminta's mood, expression, animation, and speech routing.

import { getLevel, LEVEL_THRESHOLDS } from "~lib/evolution"
import type { AmintaStore } from "~lib/storage"

// ─── Mood ─────────────────────────────────────────────────────────────────────
// Long-term background state. Derived from the store at any moment.
// No events needed — changes between sessions.

export type Mood =
  | "idle"        // default
  | "pre_evolve"  // within 50 XP of the next level threshold
  | "hungry"      // has a streak, hasn't posted today
  | "sleeping"    // local time 0–5am

export function deriveMood(store: AmintaStore | null): Mood {
  if (!store) return "idle"

  const hour = new Date().getHours()
  if (hour < 6) return "sleeping"

  const xp    = store.xp ?? 0
  const level = getLevel(xp)
  // pre_evolve: within 50 XP of the next level — higher priority than hungry
  if (level < LEVEL_THRESHOLDS.length) {
    const xpLeft = LEVEL_THRESHOLDS[level] - xp
    if (xpLeft > 0 && xpLeft <= 50) return "pre_evolve"
  }

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (
    (store.streak ?? 0) > 0 &&
    store.streakDate === yesterday &&
    (store.xpToday ?? 0) === 0
  ) {
    return "hungry"
  }

  return "idle"
}

// ─── Event ───────────────────────────────────────────────────────────────────
// What just happened. Fired from anywhere; never stored persistently.
// Add new event types here — resolveExpression and dialogue table pick them up.

export type CompanionEvent =
  | "open"              // home tab entered
  | "insert"            // post inserted (any mode)
  | "mission_complete"  // all daily missions done
  | "level_up"          // XP threshold crossed
  | "generate_start"    // generate button pressed
  | "generate_end"      // generation resolved — clears "thinking"
  | "api_error"         // generation failed
  | "idle"              // no recent event (default)

// ─── Expression ──────────────────────────────────────────────────────────────
// Short-term reactions. Override mood temporarily, then auto-reset to "idle".
// When expression is "idle", mood drives the visual.

export type Expression =
  | "idle"         // no active expression — mood takes over
  | "wave"         // on open
  | "happy"        // after insert
  | "celebrating"  // missions complete or level up
  | "thinking"     // generating in progress (persists until cleared)
  | "error"        // api failed

// Higher number = higher priority. A new expression only takes over if
// its priority is >= the current expression's priority.
export const EXPRESSION_PRIORITY: Record<Expression, number> = {
  idle:        0,
  wave:        1,
  happy:       2,
  thinking:    3,   // persists until generate_end or api_error
  celebrating: 4,
  error:       5,   // always wins — user must see failures
}

// How long each expression holds before auto-resetting (ms).
// Infinity = expression persists until explicitly cleared by a paired event.
export const EXPRESSION_DURATION: Partial<Record<Expression, number>> = {
  wave:        650,
  happy:       650,
  celebrating: 900,
  thinking:    Infinity,
  error:       2_000,
}

// Events that unconditionally clear a specific expression.
// Used for paired flows: generate_start → thinking → generate_end clears it.
export const EXPRESSION_CLEAR_ON: Partial<Record<Expression, CompanionEvent[]>> = {
  thinking: ["generate_end", "api_error"],
}

export function resolveExpression(event: CompanionEvent, _mood: Mood): Expression {
  switch (event) {
    case "open":             return "wave"
    case "insert":           return "happy"
    case "mission_complete": return "celebrating"
    case "level_up":         return "celebrating"
    case "generate_start":   return "thinking"
    case "generate_end":     return "idle"
    case "api_error":        return "error"
    default:                 return "idle"
  }
}

// ─── Animation ID ─────────────────────────────────────────────────────────────
// The engine outputs an ID. The renderer (animation.ts) maps it to CSS.
// Swap animation.ts to target a different platform without touching this file.

export type AnimationId =
  | "float"       // idle mood: idle
  | "react"       // wave, happy (one-shot bounce)
  | "celebrate"   // celebrating (bigger bounce)
  | "think"       // thinking (loop)
  | "error"       // error (shake)
  | "hungry"      // mood: hungry (slow drift, dim)
  | "sleeping"    // mood: sleeping (near-still, dim)
  | "pre_evolve"  // mood: near next level (float + bright preglow)

const EXPRESSION_ANIM: Record<Expression, AnimationId | null> = {
  idle:        null,        // falls through to MOOD_ANIM
  wave:        "react",
  happy:       "react",
  celebrating: "celebrate",
  thinking:    "think",
  error:       "error",
}

const MOOD_ANIM: Record<Mood, AnimationId> = {
  idle:       "float",
  pre_evolve: "pre_evolve",
  hungry:     "hungry",
  sleeping:   "sleeping",
}

export function resolveAnimationId(expression: Expression, mood: Mood): AnimationId {
  return EXPRESSION_ANIM[expression] ?? MOOD_ANIM[mood]
}

// ─── Composed state ───────────────────────────────────────────────────────────
// What the engine knows about the companion at any instant.
// Does NOT include speech (handled by dialogue.ts) or CSS (handled by animation.ts).

export interface CompanionState {
  mood:        Mood
  expression:  Expression
  animationId: AnimationId
}

export function getCompanionState(
  store:      AmintaStore | null,
  expression: Expression      = "idle",
  _lastEvent: CompanionEvent  = "idle"
): CompanionState {
  const mood        = deriveMood(store)
  const animationId = resolveAnimationId(expression, mood)
  return { mood, expression, animationId }
}

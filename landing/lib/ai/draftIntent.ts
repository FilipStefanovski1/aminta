// Classifies how much the user already wrote, so generation knows how much
// freedom it has vs. how much it must preserve. Deliberately lightweight —
// word/sentence counting, never a model call, per the product requirement
// that this stay deterministic and free.
//
// SOURCE OF TRUTH: extension/lib/draftIntent.ts (identical duplicate — no
// shared package between extension/ and landing/, same convention as
// lib/ai/prompts.ts). Diff before shipping a change to either.

export type DraftIntent = "topic" | "rough" | "developed" | "near_final"
export type PreservationLevel = "low" | "medium" | "high" | "max"

const TOPIC_MAX_WORDS = 6
const ROUGH_MAX_WORDS = 35
const NEAR_FINAL_MIN_SENTENCES = 3

/**
 * TOPIC — a bare seed ("Solana Summit Serbia"), no sentence structure.
 * ROUGH — a short, single-idea thought, rarely more than one real sentence.
 * DEVELOPED — a real draft with several ideas already laid out, but not
 * long/complete enough to read as a finished post.
 * NEAR_FINAL — several sentences, more than a rough thought's worth of
 * words, AND ends on terminal punctuation — reads like the user already
 * wrote something close to a finished post.
 */
export function classifyDraftIntent(input: string): DraftIntent {
  const trimmed = input.trim()
  if (!trimmed) return "topic"

  const words = trimmed.split(/\s+/).filter(Boolean)
  const sentences = trimmed.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 2)
  const endsWithTerminalPunctuation = /[.!?]\s*$/.test(trimmed)

  if (words.length <= TOPIC_MAX_WORDS && sentences.length <= 1) return "topic"
  if (words.length <= ROUGH_MAX_WORDS && sentences.length <= 1) return "rough"
  if (sentences.length >= NEAR_FINAL_MIN_SENTENCES && words.length > ROUGH_MAX_WORDS && endsWithTerminalPunctuation) {
    return "near_final"
  }
  return "developed"
}

// LESS user content -> more generation freedom (low preservation).
// MORE user content -> more preservation (the user's own words/order matter more).
const PRESERVATION_BY_INTENT: Record<DraftIntent, PreservationLevel> = {
  topic: "low",
  rough: "medium",
  developed: "high",
  near_final: "max",
}

export function preservationLevelFor(intent: DraftIntent): PreservationLevel {
  return PRESERVATION_BY_INTENT[intent]
}

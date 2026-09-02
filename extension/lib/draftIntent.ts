// Classifies how much the user already wrote, so generation knows how much
// freedom it has vs. how much it must preserve. Deliberately lightweight —
// word/sentence counting, never a model call, per the product requirement
// that this stay deterministic and free.
//
// SOURCE OF TRUTH: landing/lib/ai/draftIntent.ts (identical duplicate — no
// shared package between extension/ and landing/, same convention as
// lib/prompts.ts). Diff before shipping a change to either.

export type DraftIntent = "topic" | "rough" | "developed" | "near_final"
export type PreservationLevel = "low" | "medium" | "high" | "max"

const TOPIC_MAX_WORDS = 6
const ROUGH_MAX_WORDS = 35
const NEAR_FINAL_MIN_SENTENCES = 3
// A single sentence longer than this AND ending on terminal punctuation
// reads as one deliberate, complete statement (an aphorism-style post),
// not an unfinished fragment — see the "single complete sentence" note
// below for why this outranks the plain word-count check for "rough".
const SINGLE_SENTENCE_COMPLETE_MIN_WORDS = 10

/**
 * TOPIC — a bare seed ("Solana Summit Serbia"), no sentence structure.
 * ROUGH — a short, single-idea thought with no terminal punctuation —
 * reads as an unfinished fragment, not a deliberate statement.
 * DEVELOPED — a real, multi-part draft (2 sentences, or 3+ that doesn't
 * end cleanly), OR a single sentence substantial and complete enough to
 * read as one deliberate statement rather than a rough fragment.
 * NEAR_FINAL — 3+ complete sentences ending on terminal punctuation —
 * reads like the user already wrote something close to a finished post.
 *
 * Found via eval (see landing/eval/generation-quality), two fixes:
 *
 * 1. This used to also require words.length > ROUGH_MAX_WORDS for
 * near_final, which inverted the intended signal — a short-but-complete
 * draft (typical X-post length, e.g. "spent three hours debugging
 * something that turned out to be a typo. every engineer has this story.
 * mine just happened today.") was denied near_final's minimal-intervention
 * treatment purely for being short, while a longer 3-sentence draft got it
 * regardless of length. Completeness (sentence count + ending punctuation),
 * not raw length, is what "reads like a finished post" means.
 *
 * 2. A single well-formed, punctuated sentence ("the hardest part of
 * building alone isn't the code, it's staying convinced the thing is worth
 * finishing on the days nothing works.") used to be treated identically to
 * a genuinely rough, unpunctuated one-line fragment ("went to the gym and
 * realized i had the slowest speed on the treadmill") purely because both
 * are "one sentence" — collapsing "unfinished thought" and "deliberate
 * single-line post" into the same medium-preservation bucket, when the
 * whole point of that bucket is to permit MORE restructuring than a
 * finished single-sentence post should ever get. Ending punctuation plus
 * enough length to be a real statement (not a short quip) now routes to
 * "developed" (more preservation) instead.
 */
export function classifyDraftIntent(input: string): DraftIntent {
  const trimmed = input.trim()
  if (!trimmed) return "topic"

  const words = trimmed.split(/\s+/).filter(Boolean)
  const sentences = trimmed.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 2)
  const endsWithTerminalPunctuation = /[.!?]\s*$/.test(trimmed)

  if (words.length <= TOPIC_MAX_WORDS && sentences.length <= 1) return "topic"
  if (sentences.length <= 1 && words.length <= ROUGH_MAX_WORDS) {
    const readsAsOneCompleteStatement = endsWithTerminalPunctuation && words.length > SINGLE_SENTENCE_COMPLETE_MIN_WORDS
    return readsAsOneCompleteStatement ? "developed" : "rough"
  }
  if (sentences.length >= NEAR_FINAL_MIN_SENTENCES && endsWithTerminalPunctuation) return "near_final"
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

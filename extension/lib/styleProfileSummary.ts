// Human-readable view of the StyleProfile that already powers generation.
//
// Presentation only. Nothing here reads or writes storage, calls a model, or
// derives a new attribute — it maps the 13 style fields already in
// store.styleProfile onto four readable groups. confidenceScore is
// deliberately excluded: it is an internal weighting computed from corpus
// size, not a trait the user wrote, and showing it as a number invites
// "why is my style only 85%?".
//
// Pure so the label mapping is testable without a DOM.
import type { AmintaStore, StyleProfile } from "~lib/storage"

/**
 * Enum values are written for the prompt, not for people
 * ("lowercase-leaning", "emphatic-caps"). These are display strings only —
 * the stored profile is never rewritten.
 */
const CONFIDENCE_LABEL: Record<string, string> = {
  hedging: "measured", balanced: "balanced", assertive: "assertive", declarative: "declarative",
}
const ENERGY_LABEL: Record<string, string> = {
  low: "low energy", moderate: "moderate energy", high: "high energy", intense: "intense energy",
}
const VOCAB_LABEL: Record<string, string> = {
  simple: "simple vocabulary", casual: "casual vocabulary",
  moderate: "everyday vocabulary", sophisticated: "sophisticated vocabulary",
}
const CAPITALIZATION_LABEL: Record<string, string> = {
  "lowercase-leaning": "mostly lowercase", standard: "standard capitalization",
  "emphatic-caps": "emphatic capitals",
}
const DIRECTNESS_LABEL: Record<string, string> = {
  indirect: "indirect", balanced: "balanced", direct: "direct", blunt: "blunt",
}

/** Reads better than the raw "none" the model returns for this field. */
function emojiLabel(raw: string): string {
  const v = raw.trim().toLowerCase()
  if (v === "none" || v === "no emoji" || v === "never") return "no emoji"
  return raw.trim()
}

export interface SummarySection {
  title: string
  /** Comma-joined descriptors rendered on one line. */
  inline?: string
  /** Bulleted or stacked lines. */
  lines: string[]
}

const clean = (v: string | undefined): string => (v ?? "").trim()

/**
 * Four groups, in the order they are shown. Empty free-text fields are
 * dropped and a section with nothing to say is omitted entirely — the same
 * filtering styleProfileBlock() already applies when building the prompt.
 *
 * The 5 enums are always populated, so Tone and Writing habits can never
 * both vanish: the panel is never empty, even for a thin profile.
 */
export function summarizeStyleProfile(sp: StyleProfile | null): SummarySection[] {
  if (!sp) return []

  const sections: SummarySection[] = []

  // ── Tone ──
  const toneInline = [
    CONFIDENCE_LABEL[sp.confidence] ?? sp.confidence,
    ENERGY_LABEL[sp.energy] ?? sp.energy,
    DIRECTNESS_LABEL[sp.directness] ?? sp.directness,
  ].filter(Boolean).join(" · ")
  const toneLines = [clean(sp.humorStyle)].filter(Boolean)
  sections.push({ title: "Tone", inline: toneInline, lines: toneLines })

  // ── Structure ──
  const structure = [clean(sp.formattingPreferences), clean(sp.rhythm)].filter(Boolean)
  if (structure.length) sections.push({ title: "Structure", lines: structure })

  // ── Writing habits ──
  const habits = [
    CAPITALIZATION_LABEL[sp.capitalization] ?? sp.capitalization,
    clean(sp.punctuation),
    clean(sp.emojiUsage) ? emojiLabel(sp.emojiUsage) : "",
    clean(sp.hashtagUsage),
    VOCAB_LABEL[sp.vocabularyComplexity] ?? sp.vocabularyComplexity,
    clean(sp.rhetoricalDevices),
  ].filter(Boolean)
  if (habits.length) sections.push({ title: "Writing habits", lines: habits })

  // ── Pacing ──
  const pacing = [clean(sp.cadence)].filter(Boolean)
  if (pacing.length) sections.push({ title: "Pacing", lines: pacing })

  return sections
}

/**
 * Which version of the summary affordance the card should show.
 *
 * "fresh"   — a refresh just completed in this panel session.
 * "history" — a refresh completed at some point AND a profile is saved, so
 *             the user can review their DNA on any later visit.
 * "none"    — never refreshed from X. Critically, a profile built purely
 *             from manual Voice training also lands here: without a
 *             lastVoiceRefreshAt we must not imply that profile came from X.
 */
export type SummaryAffordance =
  | { kind: "fresh"; postsAnalyzed: number }
  | { kind: "history"; lastRefreshedAt: string }
  | { kind: "none" }

export function summaryAffordanceFor(
  store: Pick<AmintaStore, "styleProfile" | "lastVoiceRefreshAt">,
  justRefreshed: number | null
): SummaryAffordance {
  if (justRefreshed !== null) return { kind: "fresh", postsAnalyzed: justRefreshed }
  // Both are required: a profile alone proves nothing about where it came
  // from, and a timestamp without a profile has nothing to show.
  if (store.styleProfile && store.lastVoiceRefreshAt) {
    return { kind: "history", lastRefreshedAt: store.lastVoiceRefreshAt }
  }
  return { kind: "none" }
}

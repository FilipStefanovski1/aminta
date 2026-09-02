// Lightweight, local (no model call) detector for generic "AI-sounding"
// output — the goal is signals worth a bounded corrective retry, never an
// absolute forbidden-word filter. Two kinds of signal:
//   1. Generic phrases real people rarely reach for unprompted (fake
//      inspiration, forced lessons, corporate/LinkedIn rhetoric).
//   2. User-relative mismatches against their own learned StyleProfile
//      (em dashes/hashtags/emoji the profile says they don't use, casing
//      that contradicts a lowercase-leaning profile) — "would THIS person
//      plausibly write this" matters more than any generic phrase list.
//
// SOURCE OF TRUTH: this file (mirrored at landing/lib/ai/antiSlop.ts — no
// shared package between extension/ and landing/, same convention as
// lib/prompts.ts). Diff before shipping a change to either.
import type { StyleProfile } from "~lib/storage"

export interface SlopCheckResult {
  flagged: boolean
  reasons: string[]
}

interface SlopPattern {
  re: RegExp
  label: string
}

// Each entry names a signal, not a hard ban — see file header. Kept
// reasonably specific (whole phrases, not single common words) so this
// doesn't false-positive on ordinary writing that happens to share a word.
const SLOP_PATTERNS: SlopPattern[] = [
  { re: /\bthe energy was unmatched\b/i, label: "generic event-energy praise" },
  { re: /\benergy (was|is) (unmatched|incredible|electric|unreal)\b/i, label: "generic event-energy praise" },
  { re: /\bthe future is bright\b/i, label: "fake inspiration" },
  { re: /\bgame[\s-]?changers?\b/i, label: "generic hype buzzword" },
  { re: /\bincredible experience\b/i, label: "generic event praise" },
  { re: /\bthis is what .{1,40} is all about\b/i, label: "generic thematic wrap-up" },
  { re: /\bmore than just\b/i, label: "rhetorical filler opener" },
  { re: /\bone thing became clear\b/i, label: "fake epiphany" },
  { re: /\bhere'?s what i learned\b/i, label: "forced lesson closer" },
  { re: /\bnot just\b.{0,50}\bbut\b/i, label: "'not just X, but Y' cliché" },
  { re: /\bthe lesson (here )?is\b/i, label: "forced lesson closer" },
  { re: /\bwhat i learned (is|was)\b/i, label: "forced lesson closer" },
  { re: /\bat the end of the day\b/i, label: "rhetorical filler" },
  { re: /\btruly (incredible|amazing|inspiring)\b/i, label: "corporate/LinkedIn intensifier" },
  { re: /\bin today'?s (fast-paced|ever-evolving|rapidly changing) (world|landscape)\b/i, label: "corporate/LinkedIn rhetoric" },
  { re: /\blet that sink in\b/i, label: "worn-out closer" },
]

// A comma-separated "X, Y, and Z" list landing right at the end of the post
// reads as a padded, listicle-style close far more often than it reads as
// something a person naturally reached for.
const PADDED_THREE_ITEM_LIST_ENDING = /,\s*[^,.!?]+,\s*and\s+[^,.!?]+[.!?]?\s*$/i

// Rough emoji range check — good enough for "did the model add an emoji
// this profile says this person never uses," not meant to be exhaustive.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

function countEmDashes(text: string): number {
  return (text.match(/—/g) ?? []).length
}

function saysNever(field: string | undefined): boolean {
  return !!field && /\b(none|never|no|rare|rarely)\b/i.test(field)
}

/** Structural/phrase signals only — no styleProfile needed. */
function detectPhraseSignals(text: string): string[] {
  const reasons: string[] = []
  for (const { re, label } of SLOP_PATTERNS) {
    if (re.test(text)) reasons.push(label)
  }
  if (PADDED_THREE_ITEM_LIST_ENDING.test(text.trim())) {
    reasons.push("padded three-item list ending")
  }
  return reasons
}

/** "Would THIS user plausibly write this" — mismatches against their own learned profile. */
function detectStyleMismatch(text: string, sp: StyleProfile | null): string[] {
  if (!sp) return []
  const reasons: string[] = []

  const emDashes = countEmDashes(text)
  // Only skip the flag when the profile AFFIRMATIVELY describes dash usage
  // (e.g. "leans on em dashes for asides") — silence on dashes, or an
  // explicit "no dashes"/"never uses dashes", both mean this isn't this
  // user's pattern.
  const mentionsDash = /dash|—/i.test(sp.punctuation ?? "")
  const affirmsDashUsage = mentionsDash && !saysNever(sp.punctuation)
  if (emDashes >= 2 && !affirmsDashUsage) {
    reasons.push("em-dash usage doesn't match this user's learned punctuation style")
  }

  if (saysNever(sp.emojiUsage) && EMOJI_RE.test(text)) {
    reasons.push("emoji present despite this user's learned 'rarely/never uses emoji' pattern")
  }

  if (saysNever(sp.hashtagUsage) && /#\w/.test(text)) {
    reasons.push("hashtag present despite this user's learned 'rarely/never uses hashtags' pattern")
  }

  if (sp.capitalization === "lowercase-leaning") {
    const sentenceStarts = text.match(/(?:^|[.!?]\s+)([A-Za-z])/g) ?? []
    const uppercaseStarts = sentenceStarts.filter((m) => /[A-Z]$/.test(m)).length
    if (sentenceStarts.length >= 2 && uppercaseStarts / sentenceStarts.length > 0.7) {
      reasons.push("standard capitalization used despite this user's learned lowercase-leaning style")
    }
  }

  return reasons
}

export function detectSlop(text: string, styleProfile: StyleProfile | null): SlopCheckResult {
  const reasons = [...detectPhraseSignals(text), ...detectStyleMismatch(text, styleProfile)]
  return { flagged: reasons.length > 0, reasons }
}

/**
 * Appends the corrective instruction for one bounded rewrite after
 * detectSlop flags a draft — never replaces an existing templateInstruction
 * (a News/Product preset, say), only adds to it. Mirrors
 * lib/lengthGuard.ts's withLengthCorrection.
 */
export function withAntiSlopCorrection(existing: string | undefined, reasons: string[]): string {
  const note = `The previous result read as generic AI-generated writing, not this specific person's own voice — specifically: ${reasons.join("; ")}. Rewrite it once, fixing ONLY these issues. Preserve the original meaning, any specific facts or claims, and the requested length. Do not introduce new issues.`
  return existing ? `${existing}\n\n${note}` : note
}

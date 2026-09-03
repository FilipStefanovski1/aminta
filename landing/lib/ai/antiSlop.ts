// Lightweight, local (no model call) detector for generic "AI-sounding"
// output — the goal is signals worth a bounded corrective retry, never an
// absolute forbidden-word filter. Three kinds of signal:
//   1. Generic phrases real people rarely reach for unprompted (fake
//      inspiration, forced lessons, corporate/LinkedIn rhetoric).
//   2. User-relative mismatches against their own learned StyleProfile
//      (em dashes/hashtags/emoji the profile says they don't use, casing
//      that contradicts a lowercase-leaning profile) — "would THIS person
//      plausibly write this" matters more than any generic phrase list.
//   3. Semantic overclaiming/inflation — a sentence that reads as a
//      sweeping conclusion ("it's obvious...", "this proves...", "the
//      future of...") AND shares almost no words with what the user
//      actually supplied (their input, or verified research) is very
//      likely a model-invented interpretation rather than a claim
//      traceable to real source material. See detectOverclaim below —
//      this is deliberately NOT semantic/embedding-based (none of that
//      infra exists here); it's a phrase-marker + bag-of-words-overlap
//      proxy for "does this claim's provenance trace back to the user or
//      verified context, or did the model invent it."
//
// SOURCE OF TRUTH: extension/lib/antiSlop.ts (identical duplicate — no
// shared package between extension/ and landing/, same convention as
// lib/ai/prompts.ts). Diff before shipping a change to either.
import type { StyleProfile } from "./prompts"

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
  { re: /\bmade it clear\b/i, label: "fake epiphany" },
  { re: /\bis proof that\b/i, label: "unsupported overclaim ('is proof that')" },
  { re: /\bhere'?s what i learned\b/i, label: "forced lesson closer" },
  { re: /\bnot just\b.{0,50}\bbut\b/i, label: "'not just X, but Y' cliché" },
  { re: /\bthe lesson (here )?is\b/i, label: "forced lesson closer" },
  { re: /\bwhat i learned (is|was)\b/i, label: "forced lesson closer" },
  { re: /\bat the end of the day\b/i, label: "rhetorical filler" },
  { re: /\btruly (incredible|amazing|inspiring)\b/i, label: "corporate/LinkedIn intensifier" },
  { re: /\bin today'?s (fast-paced|ever-evolving|rapidly changing) (world|landscape)\b/i, label: "corporate/LinkedIn rhetoric" },
  { re: /\blet that sink in\b/i, label: "worn-out closer" },
]

// Grammatical fingerprints of a sweeping/grandiose conclusion — a claim
// bigger than "here's what happened," reaching for a thesis, a prediction,
// or a verdict on an entire industry/ecosystem from a single post's worth
// of input. Real example this was written against (real Gemini output,
// see landing/eval/generation-quality/REPORT.md): "it's obvious the next
// breakout consumer apps are being built here... No noise, just teams
// quietly shipping" — every one of these phrases is doing the same
// rhetorical move: turning a personal observation into an unearned
// industry-wide verdict.
const OVERCLAIM_PATTERNS: SlopPattern[] = [
  { re: /\bit'?s obvious (that\b|the\b)/i, label: "unsupported overclaim ('it's obvious')" },
  { re: /\bthis proves\b/i, label: "unsupported overclaim ('this proves')" },
  { re: /\bthe future of\b/i, label: "sweeping industry prediction ('the future of X')" },
  { re: /\b(the )?next breakout\b/i, label: "grandiose prediction ('the next breakout')" },
  { re: /\bwe'?re witnessing\b/i, label: "grandiose framing ('we're witnessing')" },
  { re: /\bthe beginning of\b/i, label: "grandiose framing ('the beginning of')" },
  { re: /\bthe industry is shifting\b/i, label: "sweeping industry claim" },
  { re: /\bthis changes everything\b/i, label: "grandiose overclaim" },
  { re: /\bquietly (shipping|building|becoming)\b/i, label: "generic founder-narrative phrase" },
  { re: /\bno noise,? just\b/i, label: "generic founder-narrative phrase" },
  { re: /\bbeing built here\b/i, label: "unsupported ecosystem-thesis phrase" },
  { re: /\beveryone is\b/i, label: "sweeping generalization ('everyone is...')" },
]

// Crude tokenizer for the overlap check below — lowercased word stems only,
// no stemming/stopword removal (deliberately simple, this is a coarse
// signal, not a similarity score anyone should trust to 2 decimal places).
function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((w) => w.length > 2)
}

// Below this fraction of a flagged sentence's own words appearing anywhere
// in the source material, the claim is treated as having no traceable
// provenance — i.e. likely invented by the model rather than drawn from
// what the user wrote or what research actually found. Deliberately loose
// (not requiring exact phrase match) since a legitimate paraphrase of the
// user's own point will naturally share some but not all wording.
const PROVENANCE_OVERLAP_THRESHOLD = 0.25

/**
 * Claim-provenance check (§2 of the spec this implements): a sentence is
 * classified as A) user-supplied, B) verified-context, or effectively C)
 * model-invented, by how much of its own vocabulary is traceable to
 * `sourceText` (the user's input, plus verified-context facts when
 * present). Only sentences that ALSO match an overclaim phrase marker are
 * checked — this is a confirming signal for an already-suspicious
 * sentence, not a full-text scan of ordinary connective prose, which would
 * false-positive constantly (most of a post legitimately shares few words
 * with the raw input while still being a faithful expression of it).
 */
function detectOverclaim(text: string, sourceText: string | undefined): string[] {
  const reasons: string[] = []
  const sourceWords = sourceText ? new Set(words(sourceText)) : null
  const sentences = text.split(/(?<=[.!?])\s+/)

  for (const sentence of sentences) {
    const pattern = OVERCLAIM_PATTERNS.find((p) => p.re.test(sentence))
    if (!pattern) continue

    if (!sourceWords || sourceWords.size === 0) {
      reasons.push(pattern.label)
      continue
    }
    const sentWords = words(sentence)
    const overlap = sentWords.filter((w) => sourceWords.has(w)).length
    const ratio = sentWords.length ? overlap / sentWords.length : 0
    reasons.push(
      ratio < PROVENANCE_OVERLAP_THRESHOLD
        ? `${pattern.label} — not traceable to your input or verified research`
        : pattern.label
    )
  }
  return reasons
}

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

/**
 * `sourceText` — optional, the user's own input (plus verified-context
 * facts when research ran) — powers the claim-provenance check in
 * detectOverclaim. Omitting it (existing call sites that predate this)
 * still runs every other check unchanged; only the overclaim check
 * degrades from "provenance-aware" to "phrase-marker only."
 */
export function detectSlop(text: string, styleProfile: StyleProfile | null, sourceText?: string): SlopCheckResult {
  const reasons = [
    ...detectPhraseSignals(text),
    ...detectStyleMismatch(text, styleProfile),
    ...detectOverclaim(text, sourceText),
  ]
  return { flagged: reasons.length > 0, reasons }
}

/**
 * Appends the corrective instruction for one bounded rewrite after
 * detectSlop flags a draft — never replaces an existing templateInstruction
 * (a News/Product preset, say), only adds to it. Mirrors
 * lib/lengthGuard.ts's withLengthCorrection.
 */
export function withAntiSlopCorrection(existing: string | undefined, reasons: string[]): string {
  const note = `The previous result read as generic AI-generated writing, not this specific person's own voice — specifically: ${reasons.join("; ")}. Rewrite it once, fixing ONLY these issues: return to the user's actual thought, remove any unsupported conclusion or generic industry narrative, keep only claims that are supported by the user's own input or the verified context, prefer specificity over grandiosity, and let the post simply end rather than forcing a bigger point — do not replace one cliché with another. Preserve the original meaning, any specific facts or claims it actually makes, and the requested length. Do not introduce new issues.`
  return existing ? `${existing}\n\n${note}` : note
}

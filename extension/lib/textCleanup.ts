// Deterministic post-processing for raw model output, applied on every
// generation path (BYOK direct and Included AI) so the user never sees a
// label, a wrapping quote, or accidental formatting mess regardless of
// which provider produced the text. This is a safety net, not a rewrite —
// it never touches intentional style (casing, punctuation choices,
// deliberate line breaks); it only strips things that are never
// legitimately part of a post/reply (instructional labels, code fences,
// wrapping quotes) and normalizes accidental whitespace/punctuation noise.
//
// SOURCE OF TRUTH: mirrored in landing/lib/ai/textCleanup.ts for the
// Included AI backend (no shared package between extension/ and landing/ —
// same duplication convention as lib/prompts.ts). Keep both in sync.

// Labels a model sometimes prepends despite being told not to — "Tweet:",
// "Reply:", "Post:", "Polished version:", "Here's a polished version:",
// "Here's your reply:", etc. Matched only at the very start of the output,
// case-insensitively, so it can never strip something that legitimately
// starts a sentence the same way mid-text.
const LABEL_RE = /^\s*(here'?s\s+(a|your|my|the)\s+)?(polished\s+)?(tweet|reply|post|version|draft|output)\s*:\s*/i

// Markdown code fences a model sometimes wraps output in even when asked
// for plain text.
const CODE_FENCE_RE = /^```[a-z]*\n?([\s\S]*?)\n?```$/i

function stripWrappingQuotes(text: string): string {
  const pairs: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"], // “ ”
    ["‘", "’"], // ‘ ’
  ]
  for (const [open, close] of pairs) {
    if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length)
      // Only strip if the quote actually wraps the WHOLE thing — a post
      // that legitimately quotes something in the middle keeps its quotes.
      if (!inner.includes(open) && !inner.includes(close)) return inner.trim()
    }
  }
  return text
}

// Absolute safety cap — well past even "long" mode's realistic ceiling
// (extension/lib/prompts.ts's LENGTH_GUIDE tops out around 700 characters
// for a long post), so this only ever fires when generation has gone
// genuinely wrong (the model ignored length guidance entirely), not on a
// normal long-form output. Trims at the last sentence boundary before the
// cap instead of cutting mid-word.
const ABSOLUTE_MAX_CHARS = 900

function trimToSentenceBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const slice = text.slice(0, maxChars)
  const lastBoundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("\n"))
  if (lastBoundary > maxChars * 0.4) return slice.slice(0, lastBoundary + 1).trim()
  return slice.trim()
}

export function cleanGenerationOutput(raw: string): string {
  let text = raw.trim()
  if (!text) return text

  const fenced = text.match(CODE_FENCE_RE)
  if (fenced) text = fenced[1].trim()

  text = text.replace(LABEL_RE, "").trim()
  text = stripWrappingQuotes(text)

  // Collapse 3+ blank lines to a single blank line — never removes a
  // deliberate single line break.
  text = text.replace(/\n{3,}/g, "\n\n")
  // Spaces before punctuation are always a mistake, never a style choice.
  text = text.replace(/ +([.,!?;:])/g, "$1")
  // Collapse accidental duplicate punctuation (!!! -> !, ?? -> ?) but leave
  // an intentional ellipsis (...) alone.
  text = text.replace(/([!?])\1+/g, "$1")
  text = text.replace(/,{2,}/g, ",")
  // Trailing/leading whitespace per line, without collapsing intentional
  // multi-line structure.
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim()

  return trimToSentenceBoundary(text, ABSOLUTE_MAX_CHARS)
}

export function isEmptyOutput(text: string): boolean {
  return text.trim().length === 0
}

// Normalizes for a loose token-overlap comparison — not exact-match, since
// a real reply naturally reuses a few of the source's own words.
function normalizeForOverlap(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )
}

// Heuristic check for "the reply/polish just repeats the source almost
// verbatim" — token-overlap ratio against the shorter of the two texts.
// Deliberately loose (a real reply legitimately echoes a few source words)
// — this is meant to catch the model copy-pasting the source back, not to
// police normal conversational overlap. Exposed as a pure function for
// tests and optional caller-side diagnostics; not wired into an automatic
// retry (no second model call — see lib/prompts.ts quality-pass notes).
export function looksLikeVerbatimRepeat(output: string, source: string, threshold = 0.82): boolean {
  const outTokens = normalizeForOverlap(output)
  const srcTokens = normalizeForOverlap(source)
  if (outTokens.size === 0 || srcTokens.size === 0) return false
  const smaller = outTokens.size <= srcTokens.size ? outTokens : srcTokens
  const larger = outTokens.size <= srcTokens.size ? srcTokens : outTokens
  let shared = 0
  for (const token of smaller) if (larger.has(token)) shared++
  return shared / smaller.size >= threshold
}

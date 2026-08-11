// SOURCE OF TRUTH: extension/lib/textCleanup.ts — see that file's header
// comment for the full rationale. Kept in sync manually (no shared package
// between extension/ and landing/), same convention as lib/ai/prompts.ts
// and lib/ai/gemini.ts.
//
// Applied server-side to every Included-AI post/reply/polish/template
// response before it's returned to the client and before it's written to
// ai_usage_log.result_text — so the stored audit-log text and the text the
// extension receives are both already clean, regardless of whether the
// extension's own (redundant) client-side pass ever runs. Never applied to
// style_profile mode, which returns raw JSON for client-side parsing.

const LABEL_RE = /^\s*(here'?s\s+(a|your|my|the)\s+)?(polished\s+)?(tweet|reply|post|version|draft|output)\s*:\s*/i
const CODE_FENCE_RE = /^```[a-z]*\n?([\s\S]*?)\n?```$/i

function stripWrappingQuotes(text: string): string {
  const pairs: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
  ]
  for (const [open, close] of pairs) {
    if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length)
      if (!inner.includes(open) && !inner.includes(close)) return inner.trim()
    }
  }
  return text
}

// A stray leading/trailing "**" or "__" — a truncated or misplaced markdown
// bold marker with no matching partner. See extension/lib/textCleanup.ts's
// identical function for the full rationale (SOURCE OF TRUTH there). Only
// acts when the marker count is ODD — a genuine, balanced emphasis span is
// left completely alone.
function stripStrayMarkdownEmphasis(text: string): string {
  const boldCount = (text.match(/\*\*/g) ?? []).length
  if (boldCount % 2 === 1) {
    text = text.replace(/^\*\*(?=\S)/, "").replace(/(?<=\S)\*\*$/, "")
  }
  const underscoreBoldCount = (text.match(/__/g) ?? []).length
  if (underscoreBoldCount % 2 === 1) {
    text = text.replace(/^__(?=\S)/, "").replace(/(?<=\S)__$/, "")
  }
  const starCount = (text.match(/\*/g) ?? []).length
  if (starCount % 2 === 1) {
    text = text.replace(/^\*(?=\S)/, "").replace(/(?<=\S)\*$/, "")
  }
  const underscoreCount = (text.match(/_/g) ?? []).length
  if (underscoreCount % 2 === 1) {
    text = text.replace(/^_(?=\S)/, "").replace(/(?<=\S)_$/, "")
  }
  return text.trim()
}

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
  text = stripStrayMarkdownEmphasis(text)

  text = text.replace(/\n{3,}/g, "\n\n")
  text = text.replace(/ +([.,!?;:])/g, "$1")
  text = text.replace(/([!?])\1+/g, "$1")
  text = text.replace(/,{2,}/g, ",")
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

function normalizeForOverlap(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )
}

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

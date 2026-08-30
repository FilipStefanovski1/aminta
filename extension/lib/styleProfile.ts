// ─── Style Profile extraction, sanitization, and caching ──────────────────
//
// The core architectural rule: raw Voice examples and Tweet DNA are used
// ONLY here, to build a distilled, topic-free StyleProfile. Once extracted
// and cached, they never participate in generation again — prompts.ts only
// ever sees the structured StyleProfile, never raw example/DNA text.
//
// Pipeline: corpus (examples + DNA) → hash → cache check → [extract via LLM
// → sanitize → cache] → StyleProfile.

import { generate } from "~lib/ai"
import type { ChatMessage } from "~lib/ai"
import { backendGenerate } from "~lib/backendGenerate"
import { effectiveApiKey, shouldUseIncludedAi } from "~lib/entitlements"
import { getStore, setStore } from "~lib/storage"
import { parseExamples } from "~lib/trainingExamples"
import type {
  AmintaStore,
  Capitalization,
  Confidence,
  Directness,
  Energy,
  StyleCorpusEntry,
  StyleProfile,
  VocabComplexity,
} from "~lib/storage"

// Bump whenever the schema or extraction prompt changes below — folded into
// the cache hash so every previously-cached profile is automatically
// invalidated, no migration code required.
export const STYLE_PROFILE_VERSION = 1

const CONFIDENCE_VALUES: Confidence[] = ["hedging", "balanced", "assertive", "declarative"]
const ENERGY_VALUES: Energy[] = ["low", "moderate", "high", "intense"]
const VOCAB_VALUES: VocabComplexity[] = ["simple", "casual", "moderate", "sophisticated"]
const CAPITALIZATION_VALUES: Capitalization[] = ["lowercase-leaning", "standard", "emphatic-caps"]
const DIRECTNESS_VALUES: Directness[] = ["indirect", "balanced", "direct", "blunt"]

function defaultStyleProfile(confidenceScore: number): StyleProfile {
  return {
    confidence: "balanced",
    energy: "moderate",
    vocabularyComplexity: "moderate",
    capitalization: "standard",
    directness: "balanced",
    rhythm: "",
    punctuation: "",
    emojiUsage: "",
    hashtagUsage: "",
    humorStyle: "",
    formattingPreferences: "",
    rhetoricalDevices: "",
    cadence: "",
    confidenceScore,
    lengthProfile: null,
  }
}

// ── Corpus building ────────────────────────────────────────────────────

export function buildCorpus(examples: string[], tweetDNA: string[]): StyleCorpusEntry[] {
  return [
    ...examples.map((text) => ({ text, source: "example" as const })),
    ...tweetDNA.map((text) => ({ text, source: "tweet_dna" as const })),
  ]
}

// Deterministic, non-crypto string hash — just needs to change whenever the
// corpus content changes, not to be collision-proof.
function simpleHash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

export function hashInputs(corpus: StyleCorpusEntry[]): string {
  const content = corpus.map((e) => `${e.source}:${e.text}`).join(" ")
  return `v${STYLE_PROFILE_VERSION}:${simpleHash(content)}:${corpus.length}`
}

// Deterministic, code-computed confidence — never asked of the model, since
// self-reported LLM confidence is unreliable. A simple staircase over
// corpus size: more samples = more reliable evidence of a real pattern.
export function computeConfidenceScore(corpus: StyleCorpusEntry[]): number {
  const n = corpus.length
  if (n === 0) return 0
  if (n <= 2) return 0.3
  if (n <= 5) return 0.6
  if (n <= 10) return 0.85
  return 1.0
}

// Personal length baseline — percentiles (not mean) so a single outlier
// post can't drag "medium" toward it. Needs at least 4 posts before a
// baseline is meaningful at all; below that, callers must fall back to the
// fixed LENGTH_GUIDE ranges instead of a baseline derived from 1-3 samples.
const MIN_POSTS_FOR_LENGTH_BASELINE = 4

function percentile(sortedLens: number[], p: number): number {
  const idx = (sortedLens.length - 1) * p
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return sortedLens[lo]
  return Math.round(sortedLens[lo] + (sortedLens[hi] - sortedLens[lo]) * (idx - lo))
}

export function computeLengthProfile(
  corpus: { text: string }[]
): { p25: number; median: number; p75: number } | null {
  if (corpus.length < MIN_POSTS_FOR_LENGTH_BASELINE) return null
  const lens = corpus.map((c) => c.text.length).sort((a, b) => a - b)
  return { p25: percentile(lens, 0.25), median: percentile(lens, 0.5), p75: percentile(lens, 0.75) }
}

// ── Sanitizer — a safety net, not a semantic classifier ────────────────
// The extraction prompt is expected to already produce topic-free text;
// this only catches obvious, syntactic leakage. No proper-noun/entity
// classification here — that's an overreach regex can't do reliably.

const URL_RE = /https?:\/\/\S+/gi
const MENTION_RE = /@\w+/g
const HASHTAG_RE = /#\w+/g
const CASHTAG_RE = /\$[A-Za-z]{1,10}\b/g

// Connectives that typically introduce a topic clause. Truncating here
// keeps the stylistic descriptor and discards whatever comes after it —
// e.g. "dry humor about crypto" → "dry humor".
const TOPIC_CONNECTIVES = [
  " about ",
  " regarding ",
  " on ",
  " like a ",
  " talking about ",
  " discussing ",
]

export function sanitizeStyleText(value: string): string {
  if (!value) return ""
  let text = value
    .replace(URL_RE, "")
    .replace(MENTION_RE, "")
    .replace(HASHTAG_RE, "")
    .replace(CASHTAG_RE, "")
    .trim()

  let cutIndex = -1
  for (const connective of TOPIC_CONNECTIVES) {
    const idx = text.toLowerCase().indexOf(connective)
    if (idx !== -1 && (cutIndex === -1 || idx < cutIndex)) cutIndex = idx
  }
  if (cutIndex !== -1) text = text.slice(0, cutIndex)

  text = text.replace(/\s+/g, " ").trim()

  // 14, not 8 — a punctuation/formatting description needs enough words to
  // actually convey a real pattern ("commas and periods used naturally,
  // occasional dash for emphasis") instead of being clipped into a vague
  // fragment that under-informs generation.
  const words = text.split(" ").filter(Boolean)
  if (words.length > 14) text = words.slice(0, 14).join(" ")

  return text
}

// ── Extraction ──────────────────────────────────────────────────────────

export function buildExtractionMessages(corpus: StyleCorpusEntry[]): ChatMessage[] {
  const samples = corpus.map((e) => `- ${e.text}`).join("\n")

  const system = [
    "You are a writing-STYLE analyst. You analyze ONLY the structural and stylistic patterns in the writing samples below — never what they say.",
    "",
    "You must NEVER extract, mention, restate, paraphrase, or allude to: topics, industries, brands, companies, products, technologies, named people, opinions, facts, or recurring themes from the samples. Only describe HOW the person writes, never WHAT they write about.",
    "",
    `Return ONLY a JSON object with exactly these keys:`,
    `- confidence: one of ${JSON.stringify(CONFIDENCE_VALUES)}`,
    `- energy: one of ${JSON.stringify(ENERGY_VALUES)}`,
    `- vocabularyComplexity: one of ${JSON.stringify(VOCAB_VALUES)}`,
    `- capitalization: one of ${JSON.stringify(CAPITALIZATION_VALUES)}`,
    `- directness: one of ${JSON.stringify(DIRECTNESS_VALUES)}`,
    `- rhythm: short phrase, sentence-length/pacing pattern only (e.g. "short, punchy, frequent fragments" or "longer flowing sentences with subordinate clauses")`,
    `- punctuation: short phrase, punctuation habits only (e.g. "commas and periods used naturally, occasional dash for emphasis" or "dashes over commas, no semicolons")`,
    `- emojiUsage: short phrase (e.g. "none" or "sparing, 1 per post")`,
    `- hashtagUsage: short phrase (e.g. "never" or "one relevant hashtag at the end")`,
    `- humorStyle: short phrase, the FORM of humor only, never its subject (e.g. "dry, deadpan" — NOT "dry humor about X")`,
    `- formattingPreferences: short phrase describing how they separate sentences/thoughts and break lines or paragraphs (e.g. "blank line between separate thoughts, full sentences" or "single-line, no line breaks")`,
    `- rhetoricalDevices: short phrase (e.g. "rhetorical questions, contrast pairs")`,
    `- cadence: short phrase, rhythm/flow only (e.g. "builds to a short punchline")`,
    "",
    "IMPORTANT — most real writing uses normal commas, periods, capitalization, and multi-sentence structure. Describe punctuation/formatting/rhythm as minimal, fragment-only, single-line, or lowercase-only ONLY if the samples clearly and consistently show that. Do not default to a compressed 'X-caption' description out of habit — describe what the samples actually show, even when that's ordinary, fully-punctuated writing.",
    "Every free-text value must be a SHORT phrase (under 14 words) describing a structural/stylistic trait only — it must never contain a topic, name, brand, or opinion. If you cannot describe a dimension without referencing content, leave it as an empty string.",
    "Return raw JSON only — no markdown code fences, no explanation.",
  ].join("\n")

  const user = `WRITING SAMPLES:\n${samples}`

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) return "{}"
  return candidate.slice(start, end + 1)
}

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback
}

export function parseStyleProfile(raw: string, confidenceScore: number): StyleProfile {
  const fallback = defaultStyleProfile(confidenceScore)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(extractJsonBlock(raw))
  } catch {
    return fallback
  }
  if (!parsed || typeof parsed !== "object") return fallback

  const freeText = (v: unknown) => sanitizeStyleText(typeof v === "string" ? v : "")

  return {
    confidence: pickEnum(parsed.confidence, CONFIDENCE_VALUES, fallback.confidence),
    energy: pickEnum(parsed.energy, ENERGY_VALUES, fallback.energy),
    vocabularyComplexity: pickEnum(parsed.vocabularyComplexity, VOCAB_VALUES, fallback.vocabularyComplexity),
    capitalization: pickEnum(parsed.capitalization, CAPITALIZATION_VALUES, fallback.capitalization),
    directness: pickEnum(parsed.directness, DIRECTNESS_VALUES, fallback.directness),
    rhythm: freeText(parsed.rhythm),
    punctuation: freeText(parsed.punctuation),
    emojiUsage: freeText(parsed.emojiUsage),
    hashtagUsage: freeText(parsed.hashtagUsage),
    humorStyle: freeText(parsed.humorStyle),
    formattingPreferences: freeText(parsed.formattingPreferences),
    rhetoricalDevices: freeText(parsed.rhetoricalDevices),
    cadence: freeText(parsed.cadence),
    confidenceScore,
    lengthProfile: null,
  }
}

export async function extractStyleProfile(
  store: Pick<AmintaStore, "apiKey" | "model" | "aiIncluded" | "providerMode" | "plan" | "subscriptionStatus">,
  corpus: StyleCorpusEntry[]
): Promise<StyleProfile> {
  const confidenceScore = computeConfidenceScore(corpus)
  if (corpus.length === 0) return defaultStyleProfile(0)

  const raw = shouldUseIncludedAi(store)
    ? await backendGenerate({ generationMode: "style_profile", corpus })
    : await generate(effectiveApiKey(store), store.model, buildExtractionMessages(corpus))
  const profile = parseStyleProfile(raw, confidenceScore)
  // Corpus is already in memory here (manual examples / DNA tweets never
  // leave the device for this path) — safe to derive the length baseline
  // client-side. Only the 3 numbers are kept; the corpus itself still never
  // touches storage beyond what's already cached elsewhere.
  profile.lengthProfile = computeLengthProfile(corpus)
  return profile
}

// ── Source precedence ────────────────────────────────────────────────────
// A successful X Voice Refresh (extension/lib/voiceRefresh.ts) is the
// authoritative learned profile once one exists. It must never be silently
// superseded by this file's own hash-mismatch cache check: the corpus that
// check hashes (manual Voice examples + Tweet DNA) has nothing to do with
// the X-derived profile, so *any* edit to a manual example — or simply
// having had one, unrelated, before a refresh ever ran — used to register
// as "stale" and trigger a full re-extraction that clobbered the X profile
// on the very next Generate. That made Voice Refresh temporary rather than
// a real upgrade.
//
// Reuses existing storage rather than adding a field: styleProfileHash is
// already a free-form string, already round-trips through cloud sync
// bundled with styleProfile in both push and pull (lib/sync.ts), and this
// prefix is the only thing distinguishing an X-derived write from a
// manual-corpus one. A dedicated boolean/enum field would need a new
// aminta_state column and a migration to sync correctly across devices;
// this needs neither and is exactly as explicit at the one call site that
// matters (isXHistorySourced), not a bare string compare scattered around.
export const X_HISTORY_SOURCE_PREFIX = "x_history:"
export function isXHistorySourced(hash: string): boolean {
  return hash.startsWith(X_HISTORY_SOURCE_PREFIX)
}

// ── Cache + single-flight ──────────────────────────────────────────────
// Module-level in-flight promise: concurrent callers (side panel + content
// script, or two rapid generate calls) await the SAME extraction instead of
// each firing their own LLM request.
let inFlight: Promise<StyleProfile | null> | null = null

export async function getOrBuildStyleProfile(store: AmintaStore): Promise<StyleProfile | null> {
  // X-derived profile: return it unconditionally and skip everything below,
  // including the corpus/hash machinery entirely. This is what makes Voice
  // Refresh authoritative rather than a cache that the very next generation
  // could silently discard. The only things that may replace it are another
  // successful Voice Refresh (which overwrites styleProfile + this hash
  // together, atomically, in voiceRefresh.ts) or a future explicit retrain
  // action — never an automatic staleness check here.
  if (isXHistorySourced(store.styleProfileHash) && store.styleProfile) {
    return store.styleProfile
  }

  const corpus = buildCorpus(store.voice?.examples ? parseExamples(store.voice.examples) : [], store.tweetDNA ?? [])
  if ((!effectiveApiKey(store) && !shouldUseIncludedAi(store)) || corpus.length === 0) return null

  const hash = hashInputs(corpus)
  if (store.styleProfile && store.styleProfileHash === hash) {
    return store.styleProfile
  }

  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const profile = await extractStyleProfile(store, corpus)
      await setStore({ styleProfile: profile, styleProfileHash: hash })
      return profile
    } catch (err) {
      console.warn("[Aminta] style profile extraction failed, falling back to cached profile:", err)
      // Re-read in case another caller already persisted a fresher cache.
      const latest = await getStore()
      return latest.styleProfile ?? null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}


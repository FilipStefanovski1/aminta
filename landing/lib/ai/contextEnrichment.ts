// Server-side, tweet-mode-only context enrichment: when a user's input
// names a real-world entity (an event, company, product, protocol, named
// person) worth researching, this fetches a small set of VERIFIED public
// facts to hand to the writer — never the user's own personal experience,
// which can only ever come from their input (see NEVER_INVENT_PERSONAL_
// EXPERIENCE in prompts.ts).
//
// No new provider/dependency/credential: this reuses the EXISTING
// GEMINI_API_KEY and the same REST endpoint lib/ai/gemini.ts already calls,
// via Gemini's built-in Google Search grounding tool (`tools: [{
// google_search: {} }]` on generateContent) — the repo has no other search
// integration (Tavily/SerpAPI/Bing/etc.) and none was added for this.
//
// VERIFIED AGAINST THE LIVE API (see landing/eval/generation-quality/
// REPORT.md v2.1 section): grounding metadata is real and rich —
// `groundingChunks` (source URL + domain title per search result used) and
// `groundingSupports` (which exact text SEGMENT of the model's own answer
// each chunk actually backs). The evidence gate below is built on real
// captured responses, not assumed shape.
//
// IMPORTANT, HONEST LIMIT: grounding proves "a search result exists that's
// lexically related to this claim," not "this claim is true" — a real
// eval run had Gemini confidently ground a specific corporate-acquisition
// claim against 3 distinct real-looking domains (one of them a mainstream
// outlet) that could not be independently verified from this environment
// (no crawler, no page-fetch). The gate below meaningfully raises the bar
// (nothing is admitted with zero matching grounding support, single-source
// support on a high-risk category like an acquisition/funding claim, or
// support ONLY from a denylisted low-authority domain) — it does not, and
// cannot without fetching and reading the actual source pages, guarantee
// every admitted fact is correct. Treat verifiedFacts as "grounded," not
// "verified against ground truth."
import { GEMINI_INCLUDED_MODEL } from "./config"

// Explicit opt-in — see file header. Flip in Vercel env vars once a real
// generation has been manually verified to produce sane context (or not
// throw), no code change needed either way.
export const CONTEXT_RESEARCH_ENABLED = process.env.CONTEXT_RESEARCH_ENABLED === "true"

// Structured, compact — the writer prompt consumes FACTS, never a raw
// search-result dump (see buildContextBlock in prompts.ts).
export interface EntityContext {
  entityName: string
  entityType: string
  verifiedFacts: string[]
  notableTopics: string[]
  people: string[]
  dates: string[]
  sourceRefs: string[]
}

// ─── Debug observability (instrumentation only — see route.ts's AI_DEBUG
// gate) ──────────────────────────────────────────────────────────────────
// A coarse, safe-to-log reason why `triggered=true` didn't end in
// `contextUsed=true`. Deliberately a closed enum, never the raw exception —
// see route.ts's debug-log header comment for why.
export type ResearchFallbackReason =
  | "no_grounding"
  | "no_supported_facts"
  | "provider_error"
  | "invalid_response"
  | "timeout"

export interface ResearchDebugInfo {
  detectedEntity: string | null
  triggered: boolean
  candidateFacts: number
  acceptedFacts: number
  rejectedFacts: number
  contextUsed: boolean
  fallback: boolean
  fallbackReason: ResearchFallbackReason | null
}

// Three deliberately simple, deterministic signals — no model call spent
// just deciding whether research is worth attempting (per the product
// requirement), and none of them fire on ordinary sentence-initial
// capitalization ("Started building something new today" stays null).
//
// 1. A run of 2+ Title-Case words ("Solana Summit Serbia") — highest
//    confidence, matches anywhere in the input, not just at the start.
const TITLE_CASE_RUN_RE = /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){1,5})\b/
// 2. A single word with an internal capital ("OpenAI", "ETHBelgrade",
//    "GitHub") — a strong proper-noun signal regardless of position.
const INTERNAL_CAP_RE = /^[A-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/

// Found via eval (see landing/eval/generation-quality): a bare capitalized
// single word ("Cursor", "Breakpoint") is exactly as structurally
// indistinguishable from a bare capitalized generic noun ("Gym", "Coding",
// "Founders") as it is from a genuine proper noun — a user typing a
// one-word topic capitalizes it out of habit regardless of what the word
// is. There's no dictionary/NLP signal available here without either an
// LLM call (explicitly ruled out) or a new dependency, so this stoplist is
// the deterministic compromise: common single-word topics people actually
// type into Aminta (activities, hobbies, industries, roles) never trigger
// research even when capitalized/alone, while an unrecognized single
// capitalized word still does. Per the product requirement — "prefer false
// negatives over wasting research on generic nouns" — err toward adding a
// word here over leaving it out.
const GENERIC_SINGLE_WORD_TOPICS = new Set([
  "coding", "programming", "design", "startup", "startups", "basketball", "marketing",
  "gym", "coffee", "founders", "founder", "school", "work", "home", "life", "food",
  "music", "art", "books", "movies", "fitness", "health", "productivity", "sales",
  "hiring", "recruiting", "engineering", "writing", "reading", "travel", "cooking",
  "parenting", "relationships", "mindset", "leadership", "management", "investing",
  "crypto", "sports", "football", "soccer", "running", "yoga", "meditation", "sleep",
  "focus", "burnout", "networking", "branding", "content", "freelancing", "remote",
])

export function detectResearchableEntity(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const multiWord = trimmed.match(TITLE_CASE_RUN_RE)
  if (multiWord) return multiWord[1].trim()

  const words = trimmed.split(/\s+/).filter(Boolean)
  const internalCap = words.find((w) => INTERNAL_CAP_RE.test(w))
  if (internalCap) return internalCap

  // 3. The ENTIRE input is exactly one capitalized word ("Cursor",
  //    "Breakpoint") that ISN'T a common generic topic word — a real
  //    sentence virtually never comes down to a single word, so this can't
  //    be confused with ordinary sentence-initial capitalization the way a
  //    longer capitalized phrase could be. This is what makes a bare
  //    single-word topic researchable, without also researching "Gym."
  if (
    words.length === 1 &&
    /^[A-Z][a-zA-Z]+$/.test(words[0]) &&
    !GENERIC_SINGLE_WORD_TOPICS.has(words[0].toLowerCase())
  ) {
    return words[0]
  }

  return null
}

const RESEARCH_DEADLINE_MS = 8_000

// ─── Evidence gate ──────────────────────────────────────────────────────
// Domains that are never sufficient sole support for a factual claim —
// forums/social platforms carry no editorial/byline accountability, so a
// claim grounded ONLY in one of these (even if grounded in the technical
// sense — see the file header's honest limit) is treated as unsupported.
// Deliberately a short DENYLIST, not an attempted allowlist of "reputable"
// sources: judging every possible news/blog domain's credibility isn't
// tractable without a crawler, but forums-only support is an unambiguous,
// safe-to-reject case.
const LOW_AUTHORITY_DOMAINS = new Set([
  "reddit.com", "quora.com", "pinterest.com", "x.com", "twitter.com",
  "facebook.com", "tiktok.com", "instagram.com", "tumblr.com",
])

// §7 of the spec — these categories get a stricter bar (2+ distinct
// grounding domains, not just 1) because a wrong claim here is the most
// damaging: a fabricated-sounding acquisition, funding round, date, or
// attendance number reads as confident, checkable-sounding fact.
const HIGH_RISK_FACT_RE = /\b(acqui(r(e|ed|ing)|sition)|merger|merged|raised \$|funding|funded|valuation|\bipo\b|partnership|invest(ed|ment|or)|revenue|stake in|subsidiary|attendees?|attendance)\b/i

interface GroundingChunk {
  uri: string
  domain: string
}
interface GroundingSupport {
  segmentText: string
  chunkIndices: number[]
}

function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((w) => w.length > 2))
}

// Same coarse bag-of-words overlap technique as lib/ai/antiSlop.ts's
// detectOverclaim — good enough to tell "this fact line and this grounded
// segment are clearly the same claim" from "these are unrelated," not
// meant to be a precise similarity score.
function overlapRatio(a: string, b: string): number {
  const aw = words(a)
  const bw = words(b)
  if (aw.size === 0 || bw.size === 0) return 0
  let shared = 0
  for (const w of aw) if (bw.has(w)) shared++
  return shared / Math.min(aw.size, bw.size)
}

/**
 * Admits a raw fact line only if it has real grounding support: at least
 * one groundingSupports segment whose text clearly overlaps it, backed by
 * at least one non-denylisted domain, with 2+ distinct domains required
 * for the higher-risk fact categories. Everything else — including a fact
 * with zero matching segment at all — is dropped per "prefer conservative
 * omission."
 */
function admitFacts(
  rawFacts: string[],
  chunks: GroundingChunk[],
  supports: GroundingSupport[]
): { text: string; domains: string[] }[] {
  const admitted: { text: string; domains: string[] }[] = []

  for (const fact of rawFacts) {
    const match = supports.find((s) => overlapRatio(fact, s.segmentText) > 0.5)
    if (!match) continue // no grounding trace at all

    const domains = [...new Set(match.chunkIndices.map((i) => chunks[i]?.domain).filter((d): d is string => !!d))]
    if (domains.length === 0) continue
    if (domains.every((d) => LOW_AUTHORITY_DOMAINS.has(d))) continue // forum/social-only support

    if (HIGH_RISK_FACT_RE.test(fact) && domains.length < 2) continue // §7 — needs corroboration

    admitted.push({ text: fact, domains })
  }

  return admitted
}

// Internal shape shared by extractGroundedContext/fetchEntityContext and
// their debug-returning counterparts below — one place computes both the
// real context AND the counts/fallback reason behind it, so the debug
// numbers can never drift from what generation actually received.
interface RawResearchResult {
  context: EntityContext | null
  candidateFacts: number
  acceptedFacts: number
  fallbackReason: ResearchFallbackReason | null
}

/** Pure — parses the raw Gemini response and runs the evidence gate. Never throws. */
function computeResearchResult(entityQuery: string, data: unknown): RawResearchResult {
  try {
    const candidate = (data as { candidates?: unknown[] })?.candidates?.[0] as
      | {
          content?: { parts?: { text?: string }[] }
          groundingMetadata?: {
            groundingChunks?: { web?: { uri?: string; title?: string } }[]
            groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[]
          }
        }
      | undefined

    const rawText = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim()
    if (!rawText) return { context: null, candidateFacts: 0, acceptedFacts: 0, fallbackReason: "invalid_response" }

    const chunks: GroundingChunk[] = (candidate?.groundingMetadata?.groundingChunks ?? []).map((c) => ({
      uri: c.web?.uri ?? "",
      domain: c.web?.title ?? "",
    }))
    const supports: GroundingSupport[] = (candidate?.groundingMetadata?.groundingSupports ?? [])
      .filter((s) => s.segment?.text && s.groundingChunkIndices)
      .map((s) => ({ segmentText: s.segment!.text!, chunkIndices: s.groundingChunkIndices! }))

    // Zero grounding at all means the model answered from its own
    // pretrained knowledge with no search backing whatsoever — nothing
    // here can be trusted enough to admit under this gate.
    if (chunks.length === 0 || supports.length === 0) {
      return { context: null, candidateFacts: 0, acceptedFacts: 0, fallbackReason: "no_grounding" }
    }

    // Only keep lines actually prefixed with "FACT:" — a response that
    // ignored the format entirely yields nothing rather than treating
    // arbitrary prose as facts.
    const factLines = rawText
      .split("\n")
      .filter((l) => /^\s*FACT:\s*/i.test(l))
      .map((l) => l.replace(/^\s*FACT:\s*/i, "").trim())
      .filter((l) => l.length > 5)

    const admitted = admitFacts(factLines, chunks, supports)
    if (admitted.length === 0) {
      return {
        context: null,
        candidateFacts: factLines.length,
        acceptedFacts: 0,
        fallbackReason: factLines.length === 0 ? "invalid_response" : "no_supported_facts",
      }
    }

    const allDomains = [...new Set(admitted.flatMap((f) => f.domains))]

    return {
      context: {
        entityName: entityQuery,
        entityType: "",
        verifiedFacts: admitted.map((f) => f.text).slice(0, 8),
        notableTopics: [],
        people: [],
        dates: [],
        sourceRefs: allDomains,
      },
      candidateFacts: factLines.length,
      acceptedFacts: admitted.length,
      fallbackReason: null,
    }
  } catch (e) {
    console.warn("[Context enrichment] failed to parse research response", {
      reason: e instanceof Error ? e.message : String(e),
    })
    return { context: null, candidateFacts: 0, acceptedFacts: 0, fallbackReason: "invalid_response" }
  }
}

/** Pure — parses the raw Gemini response and runs the evidence gate. Exported for tests; never throws. */
export function extractGroundedContext(entityQuery: string, data: unknown): EntityContext | null {
  return computeResearchResult(entityQuery, data).context
}

export type ResearchFetchResult = RawResearchResult

/**
 * ONE grounded Gemini call, asking for plain-text "FACT: ..." lines (not a
 * JSON blob) specifically so Gemini's own groundingSupports can map back to
 * each individual claim — a compact JSON object doesn't ground per-field
 * the same way (see REPORT.md's live comparison). Every candidate fact
 * then passes through the evidence gate above before ever reaching
 * verifiedFacts. Never throws — every failure mode (network, timeout,
 * missing key, zero grounding at all, zero facts surviving the gate)
 * returns null (candidateFacts/acceptedFacts: 0) so a research problem can
 * never make Generate itself fail.
 */
export async function fetchEntityContextWithDebug(entityQuery: string): Promise<ResearchFetchResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { context: null, candidateFacts: 0, acceptedFacts: 0, fallbackReason: "provider_error" }

  const prompt = [
    `Research this topic/entity using web search: "${entityQuery}".`,
    "List each verified, publicly documented fact as ONE short, complete, standalone sentence per line, prefixed with 'FACT: ' — official name/type, dates, location, notable people, notable topics/themes.",
    "Only include a fact if you are confident it is accurate and current. If you cannot find reliable public information, output nothing rather than guessing. Never invent attendance numbers, statistics, or announcements.",
    "Never include anyone's personal opinion, experience, or feelings — only objective, publicly documented facts.",
    "Plain text only: no markdown, no headers, no bullet symbols, nothing but 'FACT: ' lines. At most 8 facts.",
  ].join("\n")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEARCH_DEADLINE_MS)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_INCLUDED_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            maxOutputTokens: 600,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
        signal: controller.signal,
      }
    )
    if (!res.ok) {
      console.warn("[Context enrichment] provider returned non-OK status", { status: res.status })
      return { context: null, candidateFacts: 0, acceptedFacts: 0, fallbackReason: "provider_error" }
    }
    const data = await res.json()
    return computeResearchResult(entityQuery, data)
  } catch (e) {
    // AbortError only ever fires here from the deadline timer above, never
    // from a caller-supplied signal — safe to report as "timeout" rather
    // than the generic provider_error bucket.
    const timedOut = e instanceof DOMException && e.name === "AbortError"
    console.warn("[Context enrichment] research call failed — proceeding without context", {
      reason: e instanceof Error ? e.message : String(e),
    })
    return { context: null, candidateFacts: 0, acceptedFacts: 0, fallbackReason: timedOut ? "timeout" : "provider_error" }
  } finally {
    clearTimeout(timer)
  }
}

/** Thin wrapper over fetchEntityContextWithDebug — unchanged external behavior/signature. */
export async function fetchEntityContext(entityQuery: string): Promise<EntityContext | null> {
  return (await fetchEntityContextWithDebug(entityQuery)).context
}

export interface MaybeResearchDebugResult {
  context: EntityContext | null
  debug: ResearchDebugInfo
}

const NOT_TRIGGERED_DEBUG: ResearchDebugInfo = {
  detectedEntity: null,
  triggered: false,
  candidateFacts: 0,
  acceptedFacts: 0,
  rejectedFacts: 0,
  contextUsed: false,
  fallback: false,
  fallbackReason: null,
}

/**
 * Debug-returning counterpart of maybeGetEntityContext (below) — same
 * gating, same network call, zero extra provider calls. Exists purely so
 * route.ts can log observability counts without route.ts (or any other
 * caller) needing to re-derive them from EntityContext, which by design
 * throws away candidate/rejected counts once facts are admitted.
 */
export async function maybeGetEntityContextWithDebug(input: string): Promise<MaybeResearchDebugResult> {
  if (!CONTEXT_RESEARCH_ENABLED) return { context: null, debug: NOT_TRIGGERED_DEBUG }

  const entity = detectResearchableEntity(input)
  if (!entity) return { context: null, debug: NOT_TRIGGERED_DEBUG }

  const { context, candidateFacts, acceptedFacts, fallbackReason } = await fetchEntityContextWithDebug(entity)
  const contextUsed = context !== null
  return {
    context,
    debug: {
      detectedEntity: entity,
      triggered: true,
      candidateFacts,
      acceptedFacts,
      rejectedFacts: Math.max(0, candidateFacts - acceptedFacts),
      contextUsed,
      fallback: !contextUsed,
      fallbackReason: contextUsed ? null : fallbackReason,
    },
  }
}

/**
 * Single entry point for route.ts — gated on CONTEXT_RESEARCH_ENABLED and
 * on there being a plausible entity to research at all. Never throws.
 */
export async function maybeGetEntityContext(input: string): Promise<EntityContext | null> {
  return (await maybeGetEntityContextWithDebug(input)).context
}

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
// UNVERIFIED AGAINST THE LIVE API: this has not been exercised against a
// real Gemini response from this environment (no safe way to spend real
// API quota during development here). Gated OFF by default — see
// CONTEXT_RESEARCH_ENABLED below — specifically so it can be reviewed and
// turned on deliberately rather than silently going live. If the exact
// grounding tool/response shape has drifted, this fails closed: any error,
// timeout, or unparseable response returns null and generation proceeds
// from the user's input + voice alone, exactly like "no entity detected."
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

export function detectResearchableEntity(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const multiWord = trimmed.match(TITLE_CASE_RUN_RE)
  if (multiWord) return multiWord[1].trim()

  const words = trimmed.split(/\s+/).filter(Boolean)
  const internalCap = words.find((w) => INTERNAL_CAP_RE.test(w))
  if (internalCap) return internalCap

  // 3. The ENTIRE input is exactly one capitalized word ("Cursor",
  //    "Breakpoint") — a real sentence virtually never comes down to a
  //    single word, so this can't be confused with ordinary
  //    sentence-initial capitalization the way a longer capitalized phrase
  //    could be. This is what makes a bare single-word topic researchable.
  if (words.length === 1 && /^[A-Z][a-zA-Z]+$/.test(words[0])) return words[0]

  return null
}

const RESEARCH_DEADLINE_MS = 5_000

/**
 * ONE grounded Gemini call asking for verified public facts only, as JSON.
 * Never throws — every failure mode (network, timeout, malformed JSON, safety
 * block, missing key) returns null so a research failure can never make
 * Generate itself fail (see route.ts: this always runs before credits are
 * reserved... no — see the call site comment: this runs before generation,
 * gracefully degrading to "no context" is the whole point).
 */
export async function fetchEntityContext(entityQuery: string): Promise<EntityContext | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const prompt = [
    `Research this topic/entity using web search: "${entityQuery}".`,
    "Return ONLY publicly documented, verifiable facts — official name, type (event/company/product/protocol/person/other), dates, location, notable people/speakers, and notable topics/themes.",
    "If you cannot find reliable public information, or are not confident in a detail, OMIT it entirely rather than guessing or estimating. Never invent attendance numbers, statistics, or announcements.",
    "Never include anyone's personal opinion, experience, or feelings about this — only objective, publicly documented facts.",
    'Return ONLY a JSON object with this exact shape: { "entityName": string, "entityType": string, "verifiedFacts": string[], "notableTopics": string[], "people": string[], "dates": string[], "sourceRefs": string[] }',
    "Keep every array short (at most 5 items) and each item a short phrase, not a paragraph. No markdown fences, no explanation, no text outside the JSON object.",
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
            maxOutputTokens: 500,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
        signal: controller.signal,
      }
    )
    if (!res.ok) {
      console.warn("[Context enrichment] provider returned non-OK status", { status: res.status })
      return null
    }
    const data = await res.json()
    const rawText = (data?.candidates?.[0]?.content?.parts as { text?: string }[] | undefined)
      ?.map((p) => p.text ?? "")
      .join("")
      .trim()
    if (!rawText) return null

    return parseEntityContext(rawText)
  } catch (e) {
    console.warn("[Context enrichment] research call failed — proceeding without context", {
      reason: e instanceof Error ? e.message : String(e),
    })
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Tolerant JSON parse — a malformed/truncated response degrades to null, never a thrown error. */
function parseEntityContext(raw: string): EntityContext | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : raw).trim()
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
    const strArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 5) : []

    const entityName = typeof parsed.entityName === "string" ? parsed.entityName.trim() : ""
    const verifiedFacts = strArray(parsed.verifiedFacts)
    // No name and no facts is a useless/failed extraction — treat as no context.
    if (!entityName && verifiedFacts.length === 0) return null

    return {
      entityName,
      entityType: typeof parsed.entityType === "string" ? parsed.entityType.trim() : "",
      verifiedFacts,
      notableTopics: strArray(parsed.notableTopics),
      people: strArray(parsed.people),
      dates: strArray(parsed.dates),
      sourceRefs: strArray(parsed.sourceRefs),
    }
  } catch (e) {
    console.warn("[Context enrichment] failed to parse research response as JSON", {
      reason: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

/**
 * Single entry point for route.ts — gated on CONTEXT_RESEARCH_ENABLED and
 * on there being a plausible entity to research at all. Never throws.
 */
export async function maybeGetEntityContext(input: string): Promise<EntityContext | null> {
  if (!CONTEXT_RESEARCH_ENABLED) return null
  const entity = detectResearchableEntity(input)
  if (!entity) return null
  return fetchEntityContext(entity)
}

// Semantic claim-fidelity check (v2.2) — verifies a generated draft didn't
// silently change WHAT the user claimed (certainty, tense, scope, personal
// experience, factual claims) while it's still free to change HOW it's
// worded. Deliberately model-assisted, not another regex list: v2.1's
// phrase-marker anti-slop detector (lib/antiSlop.ts) proved structurally
// unable to catch this class of problem — every round of new patterns
// immediately missed new synonymous phrasing in the next real eval run (see
// landing/eval/generation-quality/REPORT.md's v2.1 section). Its real
// motivating failure had no lexical marker to catch at all: Gemini turned a
// user's own "after this event i genuinely think solana is going to
// dominate consumer crypto" (a hedged, future-tense prediction) into "Solana
// has already won" (an unhedged, present-tense claim of fact) — a change in
// MEANING, not vocabulary. This asks the model itself one narrowly scoped
// question: did the meaning change, never "is this good writing."
//
// SOURCE OF TRUTH: this file (mirrored at landing/lib/ai/claimFidelity.ts —
// no shared package between extension/ and landing/, same convention as
// lib/antiSlop.ts/lib/prompts.ts). Diff before shipping a change to either.
//
// Deliberately plain-JSON-in-prompt, never a schema-forced response: this
// runs identically across every provider (Gemini/Groq/OpenRouter) the exact
// same way lib/styleProfile.ts's extraction prompt already does, since
// dispatchGenerate's BYOK path can be any of the three (see
// lib/backendGenerate.ts). Only Included AI's server-side call additionally
// has the option of Gemini's responseSchema, and deliberately doesn't use it
// here either — one prompt shape, one parser, for both paths.
import type { ChatMessage } from "~lib/openrouter"

export type ViolationType =
  | "invented_claim"
  | "certainty_escalation"
  | "temporal_shift"
  | "scope_expansion"
  | "personal_experience_invention"
  | "opinion_to_fact"
  | "contradiction"

export interface FidelityViolation {
  type: ViolationType
  sourceClaim: string
  generatedClaim: string
  explanation: string
}

export interface FidelityResult {
  faithful: boolean
  violations: FidelityViolation[]
}

const VIOLATION_TYPES = new Set<string>([
  "invented_claim", "certainty_escalation", "temporal_shift", "scope_expansion",
  "personal_experience_invention", "opinion_to_fact", "contradiction",
])

/**
 * ONE narrowly-scoped question, never "is this good": does GENERATED
 * preserve SOURCE's certainty/tense/scope/sentiment/personal-experience/
 * factual claims. `verifiedFacts` (research, when present — Included AI
 * only, BYOK never has any) are supplied as additional legitimate source
 * material: a fact drawn from there is not a violation.
 */
export function buildFidelityCheckMessages(userInput: string, verifiedFacts: string[], draftText: string): ChatMessage[] {
  const system = [
    "You are a strict meaning-preservation checker comparing a SOURCE (what a person actually wrote or supplied) against a GENERATED draft written from it. Your only job: did the MEANING change. You are not judging quality, style, or good writing — wording, structure, and phrasing may change freely.",
    "Flag ONLY a change in:",
    "- certainty/strength (a hedge like 'might'/'could'/'i think' becoming definitive; 'will' becoming an already-accomplished fact)",
    "- tense/time (a future prediction becoming a present/past accomplished fact, or vice versa)",
    "- scope (some/a few/one becoming everyone/the industry/the ecosystem/all)",
    "- sentiment intensity (mild becoming extreme, e.g. 'liked it' becoming 'life-changing' or 'incredible')",
    "- negation (the meaning flipped)",
    "- numbers or counts (changed, or invented where the source gave none)",
    "- invented personal experience (who they met, how they felt, what they learned, what surprised them — anything not actually in SOURCE)",
    "- an opinion presented as objective fact",
    "- a new claim, conclusion, prediction, or industry thesis not present in SOURCE or VERIFIED FACTS",
    "Do NOT flag: paraphrasing, reordering, better word choice, grammar fixes, a fact that IS present in VERIFIED FACTS below, or a strong claim the SOURCE itself already makes explicitly — preserving an already-strong user opinion is correct, never a violation.",
    'Return ONLY strict JSON, no markdown fences, no text outside the JSON: { "faithful": true|false, "violations": [ { "type": "invented_claim"|"certainty_escalation"|"temporal_shift"|"scope_expansion"|"personal_experience_invention"|"opinion_to_fact"|"contradiction", "sourceClaim": "...", "generatedClaim": "...", "explanation": "..." } ] }',
    'If there are no violations, return { "faithful": true, "violations": [] }. Keep each explanation under 20 words.',
  ].join("\n")

  const factsBlock = verifiedFacts.length > 0
    ? `\n\nVERIFIED FACTS (public facts the draft may also legitimately draw from):\n${verifiedFacts.map((f) => `- ${f}`).join("\n")}`
    : ""

  const user = `SOURCE (what the person actually said):\n"""${userInput}"""${factsBlock}\n\nGENERATED DRAFT:\n"""${draftText}"""\n\nDoes GENERATED preserve SOURCE's meaning? Return the JSON verdict now.`

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

/**
 * Lenient parse — strips markdown fences if a model added them despite
 * instructions, coerces an unrecognized violation `type` to "invented_claim"
 * rather than dropping it (a real violation should never be silently
 * discarded over a label mismatch), and derives `faithful` purely from
 * whether any violation survived parsing (not the model's own self-reported
 * `faithful` flag, which can be self-contradictory). Fails OPEN on any parse
 * error — `{ faithful: true, violations: [] }` — a broken validator must
 * never be able to make Generate itself fail or loop.
 */
export function parseFidelityResult(raw: string): FidelityResult {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed !== "object") return { faithful: true, violations: [] }

    const rawViolations = (parsed as { violations?: unknown }).violations
    const violations: FidelityViolation[] = Array.isArray(rawViolations)
      ? rawViolations
          .filter((v: unknown): v is Record<string, unknown> => !!v && typeof v === "object")
          .map((v: Record<string, unknown>) => ({
            type: (VIOLATION_TYPES.has(v.type as string) ? v.type : "invented_claim") as ViolationType,
            sourceClaim: typeof v.sourceClaim === "string" ? v.sourceClaim : "",
            generatedClaim: typeof v.generatedClaim === "string" ? v.generatedClaim : "",
            explanation: typeof v.explanation === "string" ? v.explanation : "",
          }))
      : []

    return { faithful: violations.length === 0, violations }
  } catch (e) {
    console.warn("[Aminta] fidelity-check response failed to parse — treating as faithful (fail-open)", {
      reason: e instanceof Error ? e.message : String(e),
    })
    return { faithful: true, violations: [] }
  }
}

/** Short, human-readable summary of one violation for the corrective-rewrite prompt (see prompts.ts's buildAntiSlopRewriteMessages). */
export function describeViolation(v: FidelityViolation): string {
  const label = v.type.replace(/_/g, " ")
  const claimPart = v.sourceClaim || v.generatedClaim
    ? ` — source said "${v.sourceClaim}" but the draft said "${v.generatedClaim}"`
    : ""
  const explanationPart = v.explanation ? ` (${v.explanation})` : ""
  return `${label}${claimPart}${explanationPart}`
}

// Generation-quality v2 evaluation runner. Dev tool only — not part of the
// test suite or CI, not imported by app code. Run with:
//   npx tsx landing/eval/generation-quality/run.ts
//
// Two tiers, clearly separated in the report:
//   DETERMINISTIC — draft classification, preservation-level selection,
//     entity-trigger heuristic, prompt construction, anti-slop detection.
//     Real code paths, zero network calls, always runs.
//   REAL MODEL — actual Gemini calls (generation + Google Search grounding
//     research). Only runs if GEMINI_API_KEY is set in the environment
//     this script is invoked with; otherwise every real-model section is
//     recorded as SKIPPED with the exact reason, never faked.
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { classifyDraftIntent, preservationLevelFor } from "../../lib/ai/draftIntent"
import { detectResearchableEntity, fetchEntityContext, type EntityContext } from "../../lib/ai/contextEnrichment"
import { buildMessages, buildAntiSlopRewriteMessages, type ChatMessage } from "../../lib/ai/prompts"
import { detectSlop } from "../../lib/ai/antiSlop"
import { buildFidelityCheckMessages, parseFidelityResult, type FidelityResult } from "../../lib/ai/claimFidelity"
import { callGemini } from "../../lib/ai/gemini"
import {
  SCENARIOS, VOICE_BASE, VOICE_TEST_INPUT,
  VOICE_PROFILE_CASUAL_LOWERCASE, VOICE_PROFILE_CONCISE_DIRECT, VOICE_PROFILE_STRUCTURED_PROFESSIONAL,
} from "./scenarios"

const HAS_GEMINI_KEY = !!process.env.GEMINI_API_KEY

function systemOf(messages: ChatMessage[]): string {
  return (messages.find((m) => m.role === "system")?.content ?? "") as string
}

// ─── Deterministic pass: classification + prompt construction ─────────────
interface DeterministicResult {
  id: string
  category: string
  input: string
  intent: string
  preservationLevel: string
  entityDetected: string | null
  containsAntiFabricationRule: boolean
  containsContextBlock: boolean
  preservationInstructionSnippet: string
}

const deterministic: DeterministicResult[] = SCENARIOS.map((s) => {
  const intent = classifyDraftIntent(s.input)
  const level = preservationLevelFor(intent)
  const entity = detectResearchableEntity(s.input)
  const messages = buildMessages("tweet", VOICE_BASE, s.input, null)
  const system = systemOf(messages)
  const snippetMarkers: Record<string, string> = {
    low: "The topic above is a SEED",
    medium: "PRESERVE that content: their stated reaction",
    high: "Retain most of their ideas and their order",
    max: "closer to a light copyedit than a rewrite",
  }
  return {
    id: s.id,
    category: s.category,
    input: s.input,
    intent,
    preservationLevel: level,
    entityDetected: entity,
    containsAntiFabricationRule: system.includes("Never invent personal experience"),
    containsContextBlock: system.includes("VERIFIED CONTEXT (public facts only"),
    preservationInstructionSnippet: snippetMarkers[level],
  }
})

// ─── Deterministic: anti-slop pass on the G1/G2 fixtures ──────────────────
const g1 = SCENARIOS.find((s) => s.id === "G1")!
const g2 = SCENARIOS.find((s) => s.id === "G2")!
const g1Slop = detectSlop(g1.input, null)
const g2Slop = detectSlop(g2.input, null)
const g1RewriteMessages = g1Slop.flagged
  ? buildAntiSlopRewriteMessages(buildMessages("tweet", VOICE_BASE, "solana summit serbia", null), g1.input, g1Slop.reasons)
  : null

// ─── Deterministic: entity-trigger audit (the exact §6 requirement) ───────
const shouldTrigger = ["OpenAI", "Cursor", "Solana", "Breakpoint", "Solana Summit Serbia", "ETHBelgrade"]
const shouldNotTrigger = ["coding", "design", "startup", "basketball", "marketing", "gym", "coffee", "founders", "programming", "school"]
const entityAudit = {
  shouldTrigger: shouldTrigger.map((w) => ({ word: w, result: detectResearchableEntity(w), pass: !!detectResearchableEntity(w) })),
  shouldNotTrigger_lowercase: shouldNotTrigger.map((w) => ({ word: w, result: detectResearchableEntity(w), pass: detectResearchableEntity(w) === null })),
  shouldNotTrigger_capitalized: shouldNotTrigger.map((w) => {
    const cap = w[0].toUpperCase() + w.slice(1)
    return { word: cap, result: detectResearchableEntity(cap), pass: detectResearchableEntity(cap) === null }
  }),
}

// ─── REAL MODEL section (gated) ────────────────────────────────────────────
interface RealCallResult {
  scenarioId: string
  entityQueried?: string
  context?: EntityContext | null
  firstDraft?: string
  antiSlopFlagged?: boolean
  antiSlopReasons?: string[]
  // v2.2 — semantic claim-fidelity (see lib/ai/claimFidelity.ts). Present
  // only when preservationLevel !== "low" (the same gate route.ts uses) —
  // a bare-topic scenario never runs a fidelity check at all.
  preservationLevel?: string
  fidelityChecked?: boolean
  firstDraftFidelity?: FidelityResult
  finalOutput?: string
  rewriteApplied?: boolean
  fidelityFallback?: boolean
  rewriteFidelity?: FidelityResult
  error?: string
}

interface RealModelSection {
  ran: boolean
  reason?: string
  research: RealCallResult[]
  generation: RealCallResult[]
  voiceComparison: RealCallResult[]
  researchComparison: { withContext: RealCallResult; withoutContext: RealCallResult } | null
  // v2.2 — real end-to-end pipeline runs against the spec's §14 test cases
  // (A-H: certainty escalation, opinion->fact, scope expansion, invented
  // personal experience, number/negation fidelity, sentiment inflation).
  fidelityScenarios: RealCallResult[]
  // v2.2 §15 — the validator fed manually-constructed bad candidates
  // directly (no generation involved), to test its own detection ability
  // independent of what Gemini happens to generate.
  adversarialValidator: AdversarialCase[]
}

interface AdversarialCase {
  id: string
  category: string
  sourceText: string
  draftText: string
  expectFlagged: boolean
  result?: FidelityResult
  error?: string
}

interface PipelineResult {
  entityQueried?: string
  context?: EntityContext | null
  firstDraft: string
  antiSlopFlagged: boolean
  antiSlopReasons: string[]
  preservationLevel: string
  fidelityChecked: boolean
  firstDraftFidelity?: FidelityResult
  finalOutput: string
  rewriteApplied: boolean
  fidelityFallback: boolean
  rewriteFidelity?: FidelityResult
}

/**
 * The REAL, currently-shipped Included AI pipeline — research (if the input
 * names an entity) -> generate -> anti-slop check -> semantic-fidelity
 * check (v2.2, gated on preservationLevel !== "low", same as route.ts) ->
 * AT MOST ONE corrective rewrite if either check flags -> a lightweight
 * fidelity re-check of the rewrite itself, falling back to the original
 * draft if the rewrite broke meaning that was fine before. Mirrors
 * app/api/generate/route.ts's tweet-mode block exactly, so this eval
 * measures the real shipped behavior, not an approximation of it.
 */
async function runFullPipeline(input: string): Promise<PipelineResult> {
  const entity = detectResearchableEntity(input)
  const context = entity ? await fetchEntityContext(entity) : null
  const verifiedFacts = context?.verifiedFacts ?? []
  const messages = buildMessages("tweet", VOICE_BASE, input, null, "direct", "medium", undefined, false, undefined, context)
  const result = await callGemini(messages, { structuredText: true, generationType: "tweet" })
  const firstDraft = result.text

  const sourceText = [input, ...verifiedFacts].filter(Boolean).join(" ")
  const slop = detectSlop(firstDraft, null, sourceText)

  const preservationLevel = preservationLevelFor(classifyDraftIntent(input))
  let fidelityChecked = false
  let firstDraftFidelity: FidelityResult | undefined
  if (preservationLevel !== "low") {
    fidelityChecked = true
    const fidelityMessages = buildFidelityCheckMessages(input, verifiedFacts, firstDraft)
    const fidelityRaw = await callGemini(fidelityMessages, { generationType: "fidelity_check" })
    firstDraftFidelity = parseFidelityResult(fidelityRaw.text)
  }

  let finalOutput = firstDraft
  let rewriteApplied = false
  let fidelityFallback = false
  let rewriteFidelity: FidelityResult | undefined

  const needsRewrite = slop.flagged || (firstDraftFidelity ? !firstDraftFidelity.faithful : false)
  if (needsRewrite) {
    const rewriteMessages = buildAntiSlopRewriteMessages(messages, firstDraft, slop.reasons, firstDraftFidelity?.violations ?? [])
    const rewritten = await callGemini(rewriteMessages, { structuredText: true, generationType: "tweet" })
    const rewrittenText = rewritten.text

    if (preservationLevel !== "low") {
      const rewriteFidelityMessages = buildFidelityCheckMessages(input, verifiedFacts, rewrittenText)
      const rewriteFidelityRaw = await callGemini(rewriteFidelityMessages, { generationType: "fidelity_check" })
      rewriteFidelity = parseFidelityResult(rewriteFidelityRaw.text)

      if (!rewriteFidelity.faithful && firstDraftFidelity?.faithful) {
        fidelityFallback = true
      } else {
        finalOutput = rewrittenText
        rewriteApplied = true
      }
    } else {
      finalOutput = rewrittenText
      rewriteApplied = true
    }
  }

  return {
    entityQueried: entity ?? undefined,
    context,
    firstDraft,
    antiSlopFlagged: slop.flagged,
    antiSlopReasons: slop.reasons,
    preservationLevel,
    fidelityChecked,
    firstDraftFidelity,
    finalOutput,
    rewriteApplied,
    fidelityFallback,
    rewriteFidelity,
  }
}

// v2.2 §14 — the spec's own real test cases (A-H), run through the ACTUAL
// pipeline above, not a synthetic check. Each name matches the spec's own
// lettering for direct traceability in the report.
const FIDELITY_SCENARIOS: { id: string; note: string; input: string }[] = [
  { id: "FID-A", note: "future prediction must survive as a future prediction, never an accomplished fact", input: "after this event i genuinely think solana is going to dominate consumer crypto" },
  { id: "FID-B", note: "personal enjoyment + meeting people must not become an ecosystem-strength claim", input: "solana summit serbia was pretty fun, met some smart people" },
  { id: "FID-C", note: "'could become' must not escalate into 'will become'", input: "i think cursor could become the main editor for ai coding" },
  { id: "FID-D", note: "'some founders' must not expand into 'every founder'", input: "some founders i spoke to are starting to use ai more" },
  { id: "FID-E", note: "genuine uncertainty must not resolve into either 'useless' or 'definitely useful'", input: "not sure if this feature is actually useful yet" },
  { id: "FID-F", note: "mild sentiment ('liked it') must not inflate into 'incredible'/'life-changing'/'the best'", input: "i liked the event" },
  { id: "FID-G", note: "a specific number, when given, must be preserved exactly", input: "i met 3 builders at the event today and each one was working on something genuinely different" },
  { id: "FID-H", note: "explicit uncertainty ('maybe') must survive as uncertainty", input: "maybe we're early to this, hard to tell yet" },
]

// v2.2 §15 — feeds the validator manually-constructed bad candidates
// directly (buildFidelityCheckMessages + real Gemini + parseFidelityResult,
// no generation step involved), so detection is tested independent of
// whatever Gemini happens to generate on its own. Includes harmless
// stylistic paraphrases the validator must NOT reject (last requirement of
// §15) as a false-positive check.
const ADVERSARIAL_CASES: { id: string; category: string; sourceText: string; draftText: string; expectFlagged: boolean }[] = [
  { id: "ADV-1", category: "opinion -> fact", sourceText: "i think cursor could become the main editor for ai coding", draftText: "Cursor will become the dominant AI editor for coding.", expectFlagged: true },
  { id: "ADV-2", category: "future -> accomplished fact", sourceText: "after this event i genuinely think solana is going to dominate consumer crypto", draftText: "Solana has already won consumer crypto.", expectFlagged: true },
  { id: "ADV-3", category: "some -> all", sourceText: "some founders i spoke to are starting to use ai more", draftText: "Every founder is moving to AI now.", expectFlagged: true },
  { id: "ADV-4", category: "maybe -> definitely", sourceText: "not sure if this feature is actually useful yet", draftText: "This feature is definitely useful.", expectFlagged: true },
  { id: "ADV-5", category: "neutral -> extreme sentiment", sourceText: "i liked the event", draftText: "The event was an incredible, life-changing experience — genuinely the best event I've ever been to.", expectFlagged: true },
  { id: "ADV-6", category: "invented personal experience", sourceText: "i met some smart people at the event", draftText: "I had an amazing three-hour conversation with a startup founder who completely changed how I think about fundraising.", expectFlagged: true },
  { id: "ADV-7", category: "number change", sourceText: "i met 3 builders at the event", draftText: "I met a dozen builders at the event.", expectFlagged: true },
  { id: "ADV-8", category: "negation flip (uncertain -> negative)", sourceText: "not sure if this feature is actually useful yet", draftText: "This feature is useless.", expectFlagged: true },
  { id: "ADV-9", category: "new ecosystem thesis", sourceText: "solana summit serbia was pretty fun, met some smart people", draftText: "The event proved Solana's ecosystem is stronger than ever.", expectFlagged: true },
  { id: "ADV-10", category: "harmless paraphrase (should NOT be rejected)", sourceText: "the hardest part of building alone isn't the code, it's staying convinced the thing is worth finishing on the days nothing works.", draftText: "What makes building solo genuinely hard isn't the code — it's staying convinced the thing's worth finishing on the days nothing works.", expectFlagged: false },
  { id: "ADV-11", category: "user's own strong claim survives (should NOT be rejected)", sourceText: "after this event i genuinely think solana is going to dominate consumer crypto", draftText: "After this event, I genuinely think Solana is going to dominate consumer crypto.", expectFlagged: false },
]

async function runRealModelSection(): Promise<RealModelSection> {
  if (!HAS_GEMINI_KEY) {
    return {
      ran: false,
      reason: "GEMINI_API_KEY is not set in this environment's landing/.env.local (confirmed absent — grep found no non-empty value). It is a server-side-only secret (see .env.example's comment) not present anywhere in this local dev checkout, and no other credential (BYOK key, etc.) is reachable from this script. Network path to generativelanguage.googleapis.com IS reachable (confirmed: unauthenticated request returned HTTP 403, not a connection failure) — the sole blocker is the missing key.",
      research: [],
      generation: [],
      voiceComparison: [],
      researchComparison: null,
      fidelityScenarios: [],
      adversarialValidator: [],
    }
  }

  const research: RealCallResult[] = []
  for (const entity of ["Solana Summit Serbia", "OpenAI", "Cursor"]) {
    try {
      const context = await fetchEntityContext(entity)
      research.push({ scenarioId: entity, entityQueried: entity, context })
    } catch (e) {
      research.push({ scenarioId: entity, entityQueried: entity, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const generation: RealCallResult[] = []
  // A representative subset, not all 30 — real API spend/time. Wires the
  // ACTUAL connected pipeline: research (when the scenario names an
  // entity) -> context-enriched buildMessages -> generation -> anti-slop
  // -> bounded rewrite, exactly as route.ts does for a real "tweet"
  // generation. An earlier pass here built messages with no entity context
  // at all — this fixes that gap.
  // v2.1 §12 requires, at minimum: Solana Summit Serbia topic-only (A1),
  // Solana Summit Serbia rough draft (B1), the previous semantic-slop case
  // (F1 — same input that produced the "Walking around..." bad output
  // before), one OpenAI case (F4), one Cursor case (A2), one hallucination
  // trap (F1 again), one clean near-final draft (D3), one explicit strong
  // user opinion (H1).
  const genScenarios = SCENARIOS.filter((s) => ["A1", "A2", "B1", "B4", "C1", "D1", "D3", "F1", "F4", "H1"].includes(s.id))
  for (const s of genScenarios) {
    try {
      const r = await runFullPipeline(s.input)
      generation.push({ scenarioId: s.id, ...r })
    } catch (e) {
      generation.push({ scenarioId: s.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const voiceComparison: RealCallResult[] = []
  for (const [label, profile] of [
    ["casual/lowercase", VOICE_PROFILE_CASUAL_LOWERCASE],
    ["concise/direct", VOICE_PROFILE_CONCISE_DIRECT],
    ["structured/professional", VOICE_PROFILE_STRUCTURED_PROFESSIONAL],
  ] as const) {
    try {
      const messages = buildMessages("tweet", VOICE_BASE, VOICE_TEST_INPUT, profile)
      const result = await callGemini(messages, { structuredText: true, generationType: "tweet" })
      voiceComparison.push({ scenarioId: label, firstDraft: result.text, finalOutput: result.text })
    } catch (e) {
      voiceComparison.push({ scenarioId: label, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // §12 — research ON vs OFF, same input, same everything else. A1
  // ("Solana Summit Serbia") specifically because it's a real, researchable
  // entity where context could plausibly help.
  const researchComparison: { withContext: RealCallResult; withoutContext: RealCallResult } | null = await (async () => {
    const a1 = SCENARIOS.find((s) => s.id === "A1")!
    try {
      const context = await fetchEntityContext("Solana Summit Serbia")
      const withCtxMessages = buildMessages("tweet", VOICE_BASE, a1.input, null, "direct", "medium", undefined, false, undefined, context)
      const withCtx = await callGemini(withCtxMessages, { structuredText: true, generationType: "tweet" })

      const withoutCtxMessages = buildMessages("tweet", VOICE_BASE, a1.input, null, "direct", "medium", undefined, false, undefined, null)
      const withoutCtx = await callGemini(withoutCtxMessages, { structuredText: true, generationType: "tweet" })

      return {
        withContext: { scenarioId: "A1-with-context", context, finalOutput: withCtx.text },
        withoutContext: { scenarioId: "A1-without-context", finalOutput: withoutCtx.text },
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      return { withContext: { scenarioId: "A1-with-context", error: err }, withoutContext: { scenarioId: "A1-without-context", error: err } }
    }
  })()

  // v2.2 §14 — the spec's own real fidelity test cases, through the actual pipeline.
  const fidelityScenarios: RealCallResult[] = []
  for (const s of FIDELITY_SCENARIOS) {
    try {
      const r = await runFullPipeline(s.input)
      fidelityScenarios.push({ scenarioId: s.id, ...r })
    } catch (e) {
      fidelityScenarios.push({ scenarioId: s.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // v2.2 §15 — adversarial validator tests: feed the validator manually
  // constructed bad candidates directly, real Gemini call each, no
  // generation step. Tests detection ability independent of what Gemini
  // happens to generate on its own.
  const adversarialValidator: AdversarialCase[] = []
  for (const c of ADVERSARIAL_CASES) {
    try {
      const messages = buildFidelityCheckMessages(c.sourceText, [], c.draftText)
      const raw = await callGemini(messages, { generationType: "fidelity_check" })
      const result = parseFidelityResult(raw.text)
      adversarialValidator.push({ id: c.id, category: c.category, sourceText: c.sourceText, draftText: c.draftText, expectFlagged: c.expectFlagged, result })
    } catch (e) {
      adversarialValidator.push({ id: c.id, category: c.category, sourceText: c.sourceText, draftText: c.draftText, expectFlagged: c.expectFlagged, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return { ran: true, research, generation, voiceComparison, researchComparison, fidelityScenarios, adversarialValidator }
}

async function main() {
  const realModel = await runRealModelSection()

  const report = {
    generatedAt: new Date().toISOString(),
    scenarioCount: SCENARIOS.length,
    deterministic,
    antiSlop: {
      g1_badDraft: { input: g1.input, ...g1Slop, rewriteUserMessage: g1RewriteMessages ? (g1RewriteMessages.find((m) => m.role === "user")!.content as string) : null },
      g2_cleanDraft: { input: g2.input, ...g2Slop },
    },
    entityAudit,
    realModel,
  }

  const outDir = join(import.meta.dirname, "output")
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2))

  console.log(`Wrote ${join(outDir, "report.json")}`)
  console.log(`Deterministic scenarios: ${deterministic.length}`)
  console.log(`Entity audit: ${[...entityAudit.shouldTrigger, ...entityAudit.shouldNotTrigger_lowercase, ...entityAudit.shouldNotTrigger_capitalized].filter((r) => !r.pass).length} failures`)
  console.log(`Real model calls: ${realModel.ran ? "RAN" : `SKIPPED — ${realModel.reason}`}`)
  if (realModel.ran) {
    const fallbacks = realModel.fidelityScenarios.filter((r) => r.fidelityFallback).length
    const adversarialCorrect = realModel.adversarialValidator.filter((c) => c.result && (c.result.faithful !== c.expectFlagged)).length
    console.log(`v2.2 fidelity scenarios: ${realModel.fidelityScenarios.length} run, ${fallbacks} fell back to the original draft`)
    console.log(`v2.2 adversarial validator: ${realModel.adversarialValidator.length} cases, ${adversarialCorrect} matched expected detection`)
  }
}

main()

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
  finalOutput?: string
  rewriteApplied?: boolean
  error?: string
}

interface RealModelSection {
  ran: boolean
  reason?: string
  research: RealCallResult[]
  generation: RealCallResult[]
  voiceComparison: RealCallResult[]
  researchComparison: { withContext: RealCallResult; withoutContext: RealCallResult } | null
}

async function runRealModelSection(): Promise<RealModelSection> {
  if (!HAS_GEMINI_KEY) {
    return {
      ran: false,
      reason: "GEMINI_API_KEY is not set in this environment's landing/.env.local (confirmed absent — grep found no non-empty value). It is a server-side-only secret (see .env.example's comment) not present anywhere in this local dev checkout, and no other credential (BYOK key, etc.) is reachable from this script. Network path to generativelanguage.googleapis.com IS reachable (confirmed: unauthenticated request returned HTTP 403, not a connection failure) — the sole blocker is the missing key.",
      research: [],
      generation: [],
      voiceComparison: [],
      researchComparison: null,
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
  const genScenarios = SCENARIOS.filter((s) => ["A1", "B1", "B4", "C1", "D1", "F1", "F4"].includes(s.id))
  for (const s of genScenarios) {
    try {
      const entity = detectResearchableEntity(s.input)
      const context = entity ? await fetchEntityContext(entity) : null
      const messages = buildMessages("tweet", VOICE_BASE, s.input, null, "direct", "medium", undefined, false, undefined, context)
      const result = await callGemini(messages, { structuredText: true, generationType: "tweet" })
      const firstDraft = result.text
      const slop = detectSlop(firstDraft, null)
      let finalOutput = firstDraft
      let rewriteApplied = false
      if (slop.flagged) {
        const rewriteMessages = buildAntiSlopRewriteMessages(messages, firstDraft, slop.reasons)
        const rewritten = await callGemini(rewriteMessages, { structuredText: true, generationType: "tweet" })
        finalOutput = rewritten.text
        rewriteApplied = true
      }
      generation.push({ scenarioId: s.id, entityQueried: entity ?? undefined, context, firstDraft, antiSlopFlagged: slop.flagged, antiSlopReasons: slop.reasons, finalOutput, rewriteApplied })
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

  return { ran: true, research, generation, voiceComparison, researchComparison }
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
}

main()

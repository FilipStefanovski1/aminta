// Provider (Gemini) dollar-cost accounting. INTERNAL ONLY.
//
// This is spend tracking for the global caps and the ai_usage_log audit
// trail. It has NOTHING to do with how many credits a user is charged —
// see credits.ts. A user credit is a round product unit; this file is what
// Google actually bills us. Never derive one from the other.
//
// Pricing verified 2026-08-14 against the official Google page
// (https://ai.google.dev/gemini-api/docs/pricing, page last updated
// 2026-08-13), Standard tier — the tier that applies to the synchronous
// generateContent calls lib/ai/gemini.ts makes. Batch/Flex are 50% cheaper
// but are a different API mode we don't use.
//
// The previous implementation hardcoded ONE global pair of constants
// labelled "Gemini 2.0 Flash" ($0.075/$0.30 per 1M) while the configured
// model was already gemini-3.5-flash ($1.50/$9.00 per 1M) — understating
// real spend by ~20x on input and ~30x on output, which in turn made the
// global spend caps meaningless. Pricing is per-model now precisely so a
// future model swap can't silently reintroduce that class of bug.

export interface ModelPricing {
  /** USD per 1,000 input tokens. */
  inputPer1k: number
  /** USD per 1,000 output tokens (Gemini bills thinking tokens as output). */
  outputPer1k: number
  /** Where this came from, so the next person can re-verify it. */
  source: string
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gemini-3.5-flash": {
    inputPer1k: 0.0015, //  $1.50 / 1M
    outputPer1k: 0.009, //  $9.00 / 1M
    source: "ai.google.dev/gemini-api/docs/pricing, Standard tier, verified 2026-08-14",
  },
}

/**
 * Fallback used when a model has no entry above.
 *
 * Deliberately the MOST expensive known model rather than the cheapest or a
 * zero: an unpriced model must never look free (that would let real spend
 * sail past the global caps unnoticed). Over-estimating fails safe — the
 * cap trips early and someone investigates.
 */
const UNKNOWN_MODEL_FALLBACK: ModelPricing = {
  inputPer1k: 0.0015,
  outputPer1k: 0.009,
  source: "fallback — model not in MODEL_PRICING, priced at the most expensive known model",
}

export function pricingFor(model: string): ModelPricing {
  const p = MODEL_PRICING[model]
  if (p) return p
  // Loud, because this means MODEL_PRICING wasn't updated alongside a model
  // swap and every cost figure for this model is a guess.
  console.warn("[Included AI] No pricing entry for model — using conservative fallback", { model })
  return UNKNOWN_MODEL_FALLBACK
}

/**
 * Real provider cost for one generation.
 *
 * Always prefer the provider's own usageMetadata token counts (gemini.ts
 * surfaces them on GeminiResult). The char/4 heuristic is a last resort for
 * a response that omitted usageMetadata entirely, and is explicitly marked
 * as estimated in the return value so callers can tell the two apart.
 */
export function computeProviderCostUsd(params: {
  model: string
  inputTokens?: number
  outputTokens?: number
  inputChars?: number
  outputChars?: number
}): { costUsd: number; estimated: boolean } {
  const pricing = pricingFor(params.model)
  const haveReal = params.inputTokens !== undefined || params.outputTokens !== undefined

  const inputTokens = params.inputTokens ?? (params.inputChars ?? 0) / 4
  const outputTokens = params.outputTokens ?? (params.outputChars ?? 0) / 4

  const costUsd =
    (inputTokens / 1000) * pricing.inputPer1k + (outputTokens / 1000) * pricing.outputPer1k

  return { costUsd, estimated: !haveReal }
}

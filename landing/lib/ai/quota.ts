// Daily/monthly quota resolution + the idempotency/usage-log helpers for
// Included AI. ai_usage_log doubles as the idempotency cache (see
// supabase-setup.sql section 9.3's comment) — one table, no drift risk
// between a separate counter and the audit trail.
import { createServiceClient } from "@/lib/supabase/server"
import { aiIncluded } from "@/lib/entitlements"

export interface UserEntitlement {
  plan: string
  subscriptionStatus: string | null
  aiIncludedOverride: boolean
  generationLimitDaily: number | null
  generationLimitMonthly: number | null
}

export interface ResolvedLimits {
  aiIncluded: boolean
  dailyLimit: number
  monthlyLimit: number
  maxConcurrent: number
}

// Loads the user's row + resolves their effective entitlement/limits in one
// pass. `'gifted'` is a synthetic plan_limits key, resolved here when
// ai_included_override is set — it is never a real users.plan value (see
// supabase-setup.sql section 9 for why).
export async function loadUserEntitlement(userId: string): Promise<UserEntitlement | null> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from("users")
    .select("plan, subscription_status, ai_included_override, generation_limit_daily, generation_limit_monthly")
    .eq("id", userId)
    .single()

  if (error || !data) return null

  return {
    plan: data.plan ?? "free",
    subscriptionStatus: data.subscription_status ?? null,
    aiIncludedOverride: !!data.ai_included_override,
    generationLimitDaily: data.generation_limit_daily ?? null,
    generationLimitMonthly: data.generation_limit_monthly ?? null,
  }
}

export async function resolveLimits(entitlement: UserEntitlement): Promise<ResolvedLimits> {
  const included = aiIncluded({ plan: entitlement.plan, subscription_status: entitlement.subscriptionStatus, ai_included_override: entitlement.aiIncludedOverride })
  const planKey = entitlement.aiIncludedOverride ? "gifted" : entitlement.plan

  const service = await createServiceClient()
  const { data } = await service.from("plan_limits").select("*").eq("plan", planKey).single()

  const dailyLimit = entitlement.generationLimitDaily ?? data?.daily_limit ?? 0
  const monthlyLimit = entitlement.generationLimitMonthly ?? data?.monthly_limit ?? 0
  const maxConcurrent = data?.max_concurrent ?? 1

  return { aiIncluded: included, dailyLimit, monthlyLimit, maxConcurrent }
}

export async function checkQuota(userId: string, dailyLimit: number, monthlyLimit: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const service = await createServiceClient()
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const [{ count: dailyCount }, { count: monthlyCount }] = await Promise.all([
    service.from("ai_usage_log").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "success").gte("created_at", dayStart),
    service.from("ai_usage_log").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "success").gte("created_at", monthStart),
  ])

  if ((dailyCount ?? 0) >= dailyLimit) return { ok: false, reason: "You've hit your daily Included AI limit. Try again tomorrow, or use your own API key." }
  if ((monthlyCount ?? 0) >= monthlyLimit) return { ok: false, reason: "You've hit your monthly Included AI limit. It resets next month, or you can use your own API key." }
  return { ok: true }
}

// ─── Idempotency ─────────────────────────────────────────────────────────
// The unique index is on (user_id, request_id), not request_id alone (see
// supabase-setup.sql section 10.1) — request_id is a client-generated UUID,
// and scoping uniqueness to it alone means a collision (or a client bug
// that reuses/predicts ids) could return one user's cached generation
// result to a completely different user. Every lookup below filters by
// user_id too, so even in that scenario a caller can only ever see their
// own row.
export interface UsageLogRow {
  id: number
  status: "pending" | "success" | "error"
  result_text: string | null
  error_detail: string | null
}

export type ClaimResult =
  | { claimed: true; rowId: number }
  | { claimed: false; state: "success" | "error"; existing: UsageLogRow }
  // The original request for this (user_id, request_id) is still running —
  // distinct from "success"/"error" so the caller can return a typed
  // REQUEST_IN_PROGRESS response instead of treating a still-processing row
  // as if it had a result (never surface a null/empty result as success).
  | { claimed: false; state: "in_progress" }

export async function claimRequestId(params: {
  requestId: string
  userId: string
  generationMode: string
  inputChars: number
  imageCount: number
  clientIp: string | null
  deviceId: string | null
}): Promise<ClaimResult> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from("ai_usage_log")
    .insert({
      request_id: params.requestId,
      user_id: params.userId,
      generation_mode: params.generationMode,
      input_chars: params.inputChars,
      image_count: params.imageCount,
      status: "pending",
      client_ip: params.clientIp,
      device_id: params.deviceId,
    })
    .select("id")
    .single()

  if (!error && data) return { claimed: true, rowId: data.id }

  // Conflict (or any insert error) — look up the existing row, scoped to
  // this user too (see comment above).
  const { data: existing } = await service
    .from("ai_usage_log")
    .select("id, status, result_text, error_detail")
    .eq("request_id", params.requestId)
    .eq("user_id", params.userId)
    .single()

  if (existing) {
    const row = existing as UsageLogRow
    if (row.status === "success" && row.result_text) {
      return { claimed: false, state: "success", existing: row }
    }
    if (row.status === "error") {
      return { claimed: false, state: "error", existing: row }
    }
    // status === "pending", OR status === "success" with a missing
    // result_text (shouldn't happen — completeUsageLog always writes both
    // together — but treated as still-in-progress rather than risking a
    // null-as-success response).
    return { claimed: false, state: "in_progress" }
  }

  // Genuinely unexpected (insert failed AND no existing row found under
  // this user) — treat as claimed with a throwaway id so the caller
  // proceeds rather than hangs; completeUsageLog()/rowId < 0 is a no-op.
  return { claimed: true, rowId: -1 }
}

export async function completeUsageLog(
  rowId: number,
  outcome: {
    status: "success" | "error"
    resultText?: string
    errorDetail?: string
    latencyMs?: number
    outputTokensEst?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    model?: string
    estimatedCostUsd?: number
  }
): Promise<void> {
  if (rowId < 0) return
  const service = await createServiceClient()
  await service
    .from("ai_usage_log")
    .update({
      status: outcome.status,
      result_text: outcome.resultText ?? null,
      error_detail: outcome.errorDetail ?? null,
      latency_ms: outcome.latencyMs ?? null,
      output_tokens_est: outcome.outputTokensEst ?? null,
      input_tokens: outcome.inputTokens ?? null,
      output_tokens: outcome.outputTokens ?? null,
      total_tokens: outcome.totalTokens ?? null,
      ...(outcome.model ? { model: outcome.model } : {}),
      estimated_cost_usd: outcome.estimatedCostUsd ?? 0,
    })
    .eq("id", rowId)
}

// Gemini 2.0 Flash pricing, hardcoded as a constant (no pricing-config table
// yet — single provider, single model). Prefers real token counts from the
// provider's usageMetadata (see lib/ai/gemini.ts's GeminiResult) when
// available; the char-count heuristic below is now only a fallback for the
// rare response that omits usageMetadata, not the primary spend signal.
const PRICE_PER_1K_INPUT_TOKENS_USD = 0.000_075
const PRICE_PER_1K_OUTPUT_TOKENS_USD = 0.000_3

export function estimateCostUsd(
  inputChars: number,
  outputChars: number,
  realTokens?: { inputTokens?: number; outputTokens?: number }
): number {
  const inputTokens = realTokens?.inputTokens ?? inputChars / 4
  const outputTokens = realTokens?.outputTokens ?? outputChars / 4
  return (inputTokens / 1000) * PRICE_PER_1K_INPUT_TOKENS_USD + (outputTokens / 1000) * PRICE_PER_1K_OUTPUT_TOKENS_USD
}

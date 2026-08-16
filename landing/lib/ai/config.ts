// Kill-switch + global spend-cap checks for Included AI. Cached in module
// scope with a short TTL — Vercel Node functions reuse warm instances, so
// this genuinely saves a round trip most of the time. Staleness is bounded
// and acceptable: a kill-switch flip takes up to CONFIG_TTL_MS to fully
// propagate across warm instances, and the spend cap the same for
// SPEND_TTL_MS — fine for incident response / spend protection, not
// appropriate if you ever need sub-second cutoff (this use case doesn't).
import { createServiceClient } from "@/lib/supabase/server"

const CONFIG_TTL_MS = 10_000
const SPEND_TTL_MS = 60_000

// Included AI's Gemini model — single source of truth. lib/ai/gemini.ts
// imports this rather than hardcoding a model string, so a future model
// swap only ever needs to change here. Deliberately NOT "gemini-flash-latest" —
// that alias auto-upgrades to whatever Google points it at next, trading
// away predictable behavior and pricing for convenience this project
// doesn't want. Keep supabase-setup.sql/supabase-schema.sql's
// provider_preference and ai_usage_log.model column defaults in sync with
// this value — SQL string literals can't import it directly.
export const GEMINI_INCLUDED_MODEL = "gemini-3.5-flash"

interface AiConfig {
  ai_included_enabled: boolean
  global_daily_spend_cap_usd: number
  global_monthly_spend_cap_usd: number
  // Free-tier sub-caps. Free users gaining Included AI created a new cost
  // centre whose worst case is unbounded (anyone can sign up). Without these,
  // free traffic could exhaust the GLOBAL cap and take Included AI down for
  // paying Pro/Founder users — so free spend is bounded separately, and the
  // global caps remain purely as the emergency failsafe behind them.
  free_daily_spend_cap_usd: number
  free_monthly_spend_cap_usd: number
}

let cachedConfig: { value: AiConfig; fetchedAt: number } | null = null

export async function getAiConfig(): Promise<AiConfig> {
  if (cachedConfig && Date.now() - cachedConfig.fetchedAt < CONFIG_TTL_MS) {
    return cachedConfig.value
  }
  const service = await createServiceClient()
  const { data, error } = await service.from("ai_config").select("*").single()
  if (error || !data) {
    // This branch disables a paid feature for every user, so it must never be
    // silent: with no log, a dead credential and a deliberately flipped kill
    // switch are indistinguishable from the outside, and the 403 the client
    // gets says "temporarily unavailable" either way.
    // Only the Postgrest error code and message — never keys, tokens,
    // headers, or anything user-scoped. `ai_config` is a singleton settings
    // row, so its errors carry no user data.
    console.error("[Included AI] ai_config read failed, failing closed", {
      code: error?.code ?? "no_row",
      message: error?.message ?? "query returned no row",
    })
    // Fail closed — if we can't confirm the switch is on, treat Included AI
    // as disabled rather than silently allowing spend.
    const fallback: AiConfig = {
      ai_included_enabled: false,
      global_daily_spend_cap_usd: 0,
      global_monthly_spend_cap_usd: 0,
      free_daily_spend_cap_usd: 0,
      free_monthly_spend_cap_usd: 0,
    }
    cachedConfig = { value: fallback, fetchedAt: Date.now() }
    return fallback
  }
  cachedConfig = { value: data as AiConfig, fetchedAt: Date.now() }
  return cachedConfig.value
}

interface SpendSnapshot {
  dailyUsd: number
  monthlyUsd: number
  freeDailyUsd: number
  freeMonthlyUsd: number
}

let cachedSpend: (SpendSnapshot & { fetchedAt: number }) | null = null

/**
 * Current recorded spend, globally and for the free tier specifically.
 *
 * Sums ai_usage_log.estimated_cost_usd, which route.ts now writes from the
 * model-aware calculator in lib/ai/pricing.ts — NOT the stale Gemini 2.0
 * constants that previously understated real spend by ~20-30x and made these
 * caps meaningless.
 *
 * Free spend is attributed via the plan_key recorded on each row at
 * generation time, so a user upgrading later never retroactively moves their
 * past free-tier spend into the paid bucket (or vice versa).
 */
export async function getCurrentSpend(): Promise<SpendSnapshot> {
  if (cachedSpend && Date.now() - cachedSpend.fetchedAt < SPEND_TTL_MS) {
    return cachedSpend
  }
  const service = await createServiceClient()
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  // One month-scoped read, bucketed in memory. The month window is a superset
  // of the day window, so a second query for "today" would be redundant I/O.
  const { data: monthRows } = await service
    .from("ai_usage_log")
    .select("estimated_cost_usd, plan_key, created_at")
    .eq("status", "success")
    .gte("created_at", monthStart)

  const dayStartMs = Date.parse(dayStart)
  let dailyUsd = 0, monthlyUsd = 0, freeDailyUsd = 0, freeMonthlyUsd = 0

  for (const r of (monthRows ?? []) as { estimated_cost_usd: number | null; plan_key: string | null; created_at: string }[]) {
    const cost = r.estimated_cost_usd ?? 0
    const isToday = Date.parse(r.created_at) >= dayStartMs
    // Rows written before plan_key existed are all pre-credit-system, i.e.
    // never free-tier spend — correctly excluded from the free buckets.
    const isFree = r.plan_key === "free"

    monthlyUsd += cost
    if (isToday) dailyUsd += cost
    if (isFree) {
      freeMonthlyUsd += cost
      if (isToday) freeDailyUsd += cost
    }
  }

  const value = { dailyUsd, monthlyUsd, freeDailyUsd, freeMonthlyUsd, fetchedAt: Date.now() }
  cachedSpend = value
  return value
}

export type AvailabilityFailure =
  | { ok: false; reason: string; code: "AI_INCLUDED_DISABLED" }
  | { ok: false; reason: string; code: "FREE_AI_BUDGET_EXHAUSTED" }

/**
 * Called once per request, right after auth. Server-authoritative — the
 * client is never consulted and can't influence which caps apply.
 *
 * `planKey` decides which caps are in force:
 *   free  -> free daily/monthly caps, THEN the global caps
 *   paid  -> global caps only
 *
 * That ordering is the whole point of the free sub-cap: free traffic stops at
 * its own smaller ceiling while Pro/Founder/Gifted keep generating right up
 * to the global cap. Exhausted free budget is reported as its own code so the
 * UI can say "temporarily unavailable, try later or use your own key" rather
 * than implying the user did something wrong — and no dollar figure is ever
 * returned to the client.
 */
export async function isIncludedAiAvailable(
  planKey: string
): Promise<{ ok: true } | AvailabilityFailure> {
  const config = await getAiConfig()
  if (!config.ai_included_enabled) {
    return { ok: false, code: "AI_INCLUDED_DISABLED", reason: "Included AI is temporarily unavailable. Please use your own API key in Settings." }
  }

  const spend = await getCurrentSpend()

  if (planKey === "free") {
    if (
      spend.freeDailyUsd >= config.free_daily_spend_cap_usd ||
      spend.freeMonthlyUsd >= config.free_monthly_spend_cap_usd
    ) {
      return {
        ok: false,
        code: "FREE_AI_BUDGET_EXHAUSTED",
        reason: "Free Included AI is temporarily unavailable. Try again later or use your own API key.",
      }
    }
  }

  // Global caps apply to everyone, free included, as the final failsafe.
  if (spend.dailyUsd >= config.global_daily_spend_cap_usd) {
    return { ok: false, code: "AI_INCLUDED_DISABLED", reason: "Included AI has hit its daily usage cap. Please try again tomorrow or use your own API key." }
  }
  if (spend.monthlyUsd >= config.global_monthly_spend_cap_usd) {
    return { ok: false, code: "AI_INCLUDED_DISABLED", reason: "Included AI has hit its monthly usage cap. Please use your own API key in Settings." }
  }
  return { ok: true }
}

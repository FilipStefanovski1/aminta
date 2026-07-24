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

interface AiConfig {
  ai_included_enabled: boolean
  global_daily_spend_cap_usd: number
  global_monthly_spend_cap_usd: number
}

let cachedConfig: { value: AiConfig; fetchedAt: number } | null = null

export async function getAiConfig(): Promise<AiConfig> {
  if (cachedConfig && Date.now() - cachedConfig.fetchedAt < CONFIG_TTL_MS) {
    return cachedConfig.value
  }
  const service = await createServiceClient()
  const { data, error } = await service.from("ai_config").select("*").single()
  if (error || !data) {
    // Fail closed — if we can't confirm the switch is on, treat Included AI
    // as disabled rather than silently allowing spend.
    const fallback: AiConfig = {
      ai_included_enabled: false,
      global_daily_spend_cap_usd: 0,
      global_monthly_spend_cap_usd: 0,
    }
    cachedConfig = { value: fallback, fetchedAt: Date.now() }
    return fallback
  }
  cachedConfig = { value: data as AiConfig, fetchedAt: Date.now() }
  return cachedConfig.value
}

let cachedSpend: { dailyUsd: number; monthlyUsd: number; fetchedAt: number } | null = null

export async function getCurrentSpend(): Promise<{ dailyUsd: number; monthlyUsd: number }> {
  if (cachedSpend && Date.now() - cachedSpend.fetchedAt < SPEND_TTL_MS) {
    return cachedSpend
  }
  const service = await createServiceClient()
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const [{ data: dayRows }, { data: monthRows }] = await Promise.all([
    service.from("ai_usage_log").select("estimated_cost_usd").eq("status", "success").gte("created_at", dayStart),
    service.from("ai_usage_log").select("estimated_cost_usd").eq("status", "success").gte("created_at", monthStart),
  ])

  const sum = (rows: { estimated_cost_usd: number | null }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + (r.estimated_cost_usd ?? 0), 0)

  const value = { dailyUsd: sum(dayRows), monthlyUsd: sum(monthRows), fetchedAt: Date.now() }
  cachedSpend = value
  return value
}

// Called once per request, right after the kill-switch check. Combines both
// caches into a single pass/fail so app/api/generate/route.ts doesn't need
// to know about the two different TTLs.
export async function isIncludedAiAvailable(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const config = await getAiConfig()
  if (!config.ai_included_enabled) {
    return { ok: false, reason: "Included AI is temporarily unavailable. Please use your own API key in Settings." }
  }
  const spend = await getCurrentSpend()
  if (spend.dailyUsd >= config.global_daily_spend_cap_usd) {
    return { ok: false, reason: "Included AI has hit its daily usage cap. Please try again tomorrow or use your own API key." }
  }
  if (spend.monthlyUsd >= config.global_monthly_spend_cap_usd) {
    return { ok: false, reason: "Included AI has hit its monthly usage cap. Please use your own API key in Settings." }
  }
  return { ok: true }
}

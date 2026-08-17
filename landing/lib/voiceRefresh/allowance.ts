// Voice Refresh allowance.
//
// Deliberately built on the SAME period infrastructure as credits
// (lib/ai/credits.ts's resolvePlanKey/resolvePeriod) rather than a second
// billing-cycle implementation. A Creem subscriber's refreshes reset on
// their real billing boundary; a comped Pro/Founder/Gifted account resets on
// the existing rolling-monthly fallback. There is no "30 days since last
// refresh" anywhere.
//
// This is a separate ledger from credits and never calls reserve_credit or
// refund_credit: a Voice Refresh costs 0 Included AI credits.
import { createServiceClient } from "@/lib/supabase/server"
import { resolvePeriod, resolvePlanKey, type PeriodKind } from "@/lib/ai/credits"

/** Approved policy: Pro, Founder/Lifetime and active Gifted all get 4. */
const REFRESH_ALLOWANCE: Record<string, number> = {
  pro: 4,
  lifetime: 4,
  gifted: 4,
  free: 0,
}

/** Unknown plans get 0 — fails closed, matching policyFor() in credits.ts. */
export function refreshAllowanceFor(planKey: string): number {
  return REFRESH_ALLOWANCE[planKey] ?? 0
}

/**
 * Period kind per plan, mirroring PLAN_CREDIT_POLICY so a user's refreshes
 * and credits reset on the same boundary.
 */
function periodKindFor(planKey: string): PeriodKind {
  if (planKey === "pro") return "billing"
  if (planKey === "lifetime" || planKey === "gifted") return "monthly"
  return "day"
}

export interface RefreshContext {
  userId: string
  plan: string
  aiIncludedOverride: boolean
  giftExpiresAt: string | null
  creemPeriodStart: string | null
  creemPeriodEnd: string | null
  createdAt: string | null
}

export interface RefreshStatus {
  remaining: number
  allowance: number
  periodEnd: string
  periodKind: string
  planKey: string
  entitled: boolean
  lastRefreshAt: string | null
}

function resolve(ctx: RefreshContext, now: Date) {
  const planKey = resolvePlanKey(
    { plan: ctx.plan, aiIncludedOverride: ctx.aiIncludedOverride, giftExpiresAt: ctx.giftExpiresAt },
    now
  )
  const allowance = refreshAllowanceFor(planKey)
  const period = resolvePeriod(periodKindFor(planKey), now, {
    creemPeriodStart: ctx.creemPeriodStart,
    creemPeriodEnd: ctx.creemPeriodEnd,
    anchor: ctx.createdAt,
  })
  return { planKey, allowance, period }
}

export interface ReserveOutcome {
  ok: boolean
  remaining: number
  allowance: number
  reason: string
  planKey: string
  periodStart: Date
  periodEnd: Date
}

export async function reserveVoiceRefresh(
  ctx: RefreshContext,
  requestId: string,
  now: Date = new Date()
): Promise<ReserveOutcome> {
  const { planKey, allowance, period } = resolve(ctx, now)

  const service = await createServiceClient()
  const { data, error } = await service.rpc("reserve_voice_refresh", {
    p_user_id: ctx.userId,
    p_request_id: requestId,
    p_allowance: allowance,
    p_period_kind: period.kind,
    p_period_start: period.start.toISOString(),
    p_period_end: period.end.toISOString(),
    p_plan_key: planKey,
  })

  if (error) {
    // Fail closed. An unconfirmable allowance must not authorize paid X
    // reads and a Gemini call.
    console.error("[Voice Refresh] reservation failed", { reason: error.message })
    return {
      ok: false, remaining: 0, allowance, reason: "reservation_error",
      planKey, periodStart: period.start, periodEnd: period.end,
    }
  }

  // out_* naming: a RETURNS TABLE column named `remaining` collides with
  // voice_refresh_balance.remaining inside the function body.
  const row = Array.isArray(data) ? data[0] : data
  return {
    ok: !!row?.out_ok,
    remaining: row?.out_remaining ?? 0,
    allowance,
    reason: row?.out_reason ?? "unknown",
    planKey,
    periodStart: period.start,
    periodEnd: period.end,
  }
}

/**
 * Idempotent and safe on every failure path, including ones that never
 * reserved. Never throws: the caller already has an error to return, and
 * failing again over a refund would be worse. The ledger makes a stuck
 * reservation recoverable after the fact.
 */
export async function refundVoiceRefresh(userId: string, requestId: string): Promise<void> {
  const service = await createServiceClient()
  const { error } = await service.rpc("refund_voice_refresh", {
    p_user_id: userId,
    p_request_id: requestId,
  })
  if (error) console.error("[Voice Refresh] refund failed", { requestId, reason: error.message })
}

export async function completeVoiceRefresh(
  userId: string,
  requestId: string,
  postsFetched: number,
  postsUsed: number
): Promise<void> {
  const service = await createServiceClient()
  const { error } = await service.rpc("complete_voice_refresh", {
    p_user_id: userId,
    p_request_id: requestId,
    p_posts_fetched: postsFetched,
    p_posts_used: postsUsed,
  })
  if (error) console.error("[Voice Refresh] completion write failed", { requestId, reason: error.message })
}

/** Read-only status for /api/sync. Writes nothing. */
export async function getRefreshStatus(
  ctx: RefreshContext,
  now: Date = new Date()
): Promise<RefreshStatus> {
  const { planKey, allowance, period } = resolve(ctx, now)

  const service = await createServiceClient()
  const { data } = await service
    .from("voice_refresh_balance")
    .select("remaining, allowance, period_start, plan_key, last_refresh_at")
    .eq("user_id", ctx.userId)
    .single()

  // No row, a rolled period, or a changed plan all mean the next refresh
  // starts from a full allowance — show that, not a stale number.
  const stale =
    !data ||
    data.plan_key !== planKey ||
    data.allowance !== allowance ||
    new Date(data.period_start).getTime() !== period.start.getTime()

  return {
    remaining: stale ? allowance : data.remaining,
    allowance,
    periodEnd: period.end.toISOString(),
    periodKind: period.kind,
    planKey,
    entitled: allowance > 0,
    lastRefreshAt: stale ? null : data.last_refresh_at,
  }
}

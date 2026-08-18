// Voice Refresh eligibility — one successful refresh every 168 hours.
//
// Deliberately NOT built on the credits period infrastructure anymore
// (resolvePeriod/PeriodKind): that modeled a shared allowance bucket reset
// on a billing/calendar boundary, which is a different mechanism from a
// per-user rolling cooldown anchored on the user's own last success. Using
// it here would have meant either lying about what "period" means for this
// feature, or reinventing the same cooldown logic a second time under a
// name that doesn't fit. See supabase-migration-voice-refresh-weekly.sql
// for the SQL side of this.
//
// 168 hours, not "7 days": Postgres day-interval arithmetic on a
// timestamptz is resolved in the session's TimeZone and can shift by an
// hour across a DST boundary. An hour-based interval is a fixed elapsed
// duration regardless of timezone. This constant and the SQL migration's
// `interval '168 hours'` must always agree.
//
// This is a separate ledger from credits and never calls reserve_credit or
// refund_credit: a Voice Refresh costs 0 Included AI credits.
import { createServiceClient } from "@/lib/supabase/server"
import { resolvePlanKey } from "@/lib/ai/credits"

export const VOICE_REFRESH_COOLDOWN_MS = 168 * 60 * 60 * 1000

/** Approved policy: Pro, Founder/Lifetime and active Gifted all get it; Free doesn't. */
const REFRESH_ENTITLEMENT: Record<string, boolean> = {
  pro: true,
  lifetime: true,
  gifted: true,
  free: false,
}

/** Unknown plans are not entitled — fails closed, matching policyFor() in credits.ts. */
export function isVoiceRefreshEntitled(planKey: string): boolean {
  return REFRESH_ENTITLEMENT[planKey] ?? false
}

/** Kept for the one caller (voice-refresh/route.ts) that still needs an integer for the RPC's entitlement gate. */
export function refreshAllowanceFor(planKey: string): number {
  return isVoiceRefreshEntitled(planKey) ? 1 : 0
}

export interface RefreshContext {
  userId: string
  plan: string
  aiIncludedOverride: boolean
  giftExpiresAt: string | null
}

export interface RefreshStatus {
  /** Can attempt right now — server-authoritative, this is the only thing the UI should gate the button on. */
  eligible: boolean
  entitled: boolean
  planKey: string
  /** ISO timestamp of the last successful refresh, or null if never. */
  lastRefreshAt: string | null
  /** ISO timestamp cooldown ends, or null when already eligible / never refreshed. */
  nextEligibleAt: string | null
}

function resolvePlan(ctx: Pick<RefreshContext, "plan" | "aiIncludedOverride" | "giftExpiresAt">, now: Date): string {
  return resolvePlanKey(
    { plan: ctx.plan, aiIncludedOverride: ctx.aiIncludedOverride, giftExpiresAt: ctx.giftExpiresAt },
    now
  )
}

export interface ReserveOutcome {
  ok: boolean
  reason: string
  planKey: string
  /** When ok=false with reason 'too_soon', when the cooldown ends. Null otherwise. */
  nextEligibleAt: Date | null
}

export async function reserveVoiceRefresh(
  ctx: RefreshContext,
  requestId: string,
  now: Date = new Date()
): Promise<ReserveOutcome> {
  const planKey = resolvePlan(ctx, now)
  const allowance = refreshAllowanceFor(planKey)

  const service = await createServiceClient()
  const { data, error } = await service.rpc("reserve_voice_refresh", {
    p_user_id: ctx.userId,
    p_request_id: requestId,
    p_allowance: allowance,
    p_plan_key: planKey,
  })

  if (error) {
    // Fail closed. An unconfirmable eligibility check must not authorize
    // paid X reads and a Gemini call.
    console.error("[Voice Refresh] reservation failed", { reason: error.message })
    return { ok: false, reason: "reservation_error", planKey, nextEligibleAt: null }
  }

  // out_* naming: a RETURNS TABLE column named `remaining` collides with
  // voice_refresh_balance.remaining inside the function body.
  const row = Array.isArray(data) ? data[0] : data
  return {
    ok: !!row?.out_ok,
    reason: row?.out_reason ?? "unknown",
    planKey,
    nextEligibleAt: row?.out_next_eligible_at ? new Date(row.out_next_eligible_at) : null,
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

/**
 * Read-only status for /api/x/connection and /api/sync. Writes nothing.
 *
 * eligible is derived from last_refresh_at alone, not from `remaining` —
 * remaining's job is guarding the reserve/refund concurrency window during
 * an in-flight request, which is a few seconds and irrelevant to a status
 * read that could happen anytime. Reading last_refresh_at directly means
 * this can never show a stale "locked" state merely because remaining
 * hasn't been lazily reset yet; the real reserve call self-heals that the
 * moment it's actually needed.
 */
export async function getRefreshStatus(
  ctx: RefreshContext,
  now: Date = new Date()
): Promise<RefreshStatus> {
  const planKey = resolvePlan(ctx, now)
  const entitled = isVoiceRefreshEntitled(planKey)

  const service = await createServiceClient()
  const { data } = await service
    .from("voice_refresh_balance")
    .select("last_refresh_at")
    .eq("user_id", ctx.userId)
    .single()

  const lastRefreshAt: string | null = data?.last_refresh_at ?? null
  const nextEligibleAtMs = lastRefreshAt ? Date.parse(lastRefreshAt) + VOICE_REFRESH_COOLDOWN_MS : null
  const cooldownActive = nextEligibleAtMs !== null && now.getTime() < nextEligibleAtMs

  return {
    eligible: entitled && !cooldownActive,
    entitled,
    planKey,
    lastRefreshAt,
    nextEligibleAt: entitled && cooldownActive ? new Date(nextEligibleAtMs!).toISOString() : null,
  }
}

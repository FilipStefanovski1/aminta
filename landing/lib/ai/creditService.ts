// Server-side credit operations. Thin wrapper over the two Postgres
// functions in supabase-migration-credits.sql — all the atomicity lives
// there (advisory lock + single transaction), because doing it in TypeScript
// across multiple round trips is exactly how you get a race on the last
// credit.
import { createServiceClient } from "@/lib/supabase/server"
import { creditCostFor, policyFor, resolvePeriod, resolvePlanKey, type CreditActor } from "@/lib/ai/credits"

export interface CreditContext {
  userId: string
  plan: string
  aiIncludedOverride: boolean
  giftExpiresAt: string | null
  creemPeriodStart: string | null
  creemPeriodEnd: string | null
  /** Anchor for the rolling monthly period (Founder/Gifted): account creation. */
  createdAt: string | null
}

export interface ReserveOutcome {
  ok: boolean
  balance: number
  allowance: number
  reason: string
  planKey: string
  periodEnd: Date
}

/**
 * Reserve the credits for one generation, up front.
 *
 * Returns ok=false with reason 'insufficient_credits' when the user is out —
 * the caller turns that into the user-facing zero-credit message. A retry of
 * the same requestId returns ok=true / 'already_reserved' WITHOUT charging
 * again.
 */
export async function reserveCredits(
  ctx: CreditContext,
  requestId: string,
  mode: string,
  actor: CreditActor = "user",
  now: Date = new Date()
): Promise<ReserveOutcome> {
  const planKey = resolvePlanKey(
    { plan: ctx.plan, aiIncludedOverride: ctx.aiIncludedOverride, giftExpiresAt: ctx.giftExpiresAt },
    now
  )
  const policy = policyFor(planKey)
  const period = resolvePeriod(policy.periodKind, now, {
    creemPeriodStart: ctx.creemPeriodStart,
    creemPeriodEnd: ctx.creemPeriodEnd,
    anchor: ctx.createdAt,
  })
  const cost = creditCostFor(mode, actor)

  const service = await createServiceClient()
  const { data, error } = await service.rpc("reserve_credit", {
    p_user_id: ctx.userId,
    p_request_id: requestId,
    p_cost: cost,
    p_allowance: policy.allowance,
    p_period_kind: period.kind,
    p_period_start: period.start.toISOString(),
    p_period_end: period.end.toISOString(),
    p_plan_key: planKey,
  })

  if (error) {
    // Fail CLOSED. If we can't confirm the user has credit, we don't spend
    // Aminta's money on a generation we might never be able to account for.
    console.error("[Included AI] credit reservation failed", { reason: error.message })
    return { ok: false, balance: 0, allowance: policy.allowance, reason: "reservation_error", planKey, periodEnd: period.end }
  }

  // Column names are out_* because a RETURNS TABLE output named `balance`
  // collides with user_credits.balance inside the function body (Postgres
  // 42702, "column reference is ambiguous") — caught by the real-Postgres
  // migration test, invisible to a mocked one.
  const row = Array.isArray(data) ? data[0] : data
  return {
    ok: !!row?.out_ok,
    balance: row?.out_balance ?? 0,
    allowance: policy.allowance,
    reason: row?.out_reason ?? "unknown",
    planKey,
    periodEnd: period.end,
  }
}

/**
 * Hand a reserved credit back after a failed generation.
 *
 * Idempotent and safe to call on every failure path — including ones where
 * no reservation was ever made (returns 'nothing_to_refund' rather than
 * throwing), so callers don't need to track whether they got that far.
 */
export async function refundCredits(userId: string, requestId: string): Promise<void> {
  const service = await createServiceClient()
  const { error } = await service.rpc("refund_credit", {
    p_user_id: userId,
    p_request_id: requestId,
  })
  if (error) {
    // Logged loudly but never thrown: the user already has their error
    // response, and failing the request again over a refund would be worse.
    // The ledger makes any stuck reservation recoverable after the fact.
    console.error("[Included AI] credit refund failed", { requestId, reason: error.message })
  }
}

/**
 * Read-only balance for display (Settings/dashboard via /api/sync).
 *
 * Applies the same period logic as reserveCredits so a user who hasn't
 * generated since their period rolled still sees a full, correct balance
 * instead of last period's leftovers — without writing anything.
 */
export async function getCreditStatus(
  ctx: CreditContext,
  now: Date = new Date()
): Promise<{ balance: number; allowance: number; periodEnd: string; planKey: string; periodKind: string }> {
  const planKey = resolvePlanKey(
    { plan: ctx.plan, aiIncludedOverride: ctx.aiIncludedOverride, giftExpiresAt: ctx.giftExpiresAt },
    now
  )
  const policy = policyFor(planKey)
  const period = resolvePeriod(policy.periodKind, now, {
    creemPeriodStart: ctx.creemPeriodStart,
    creemPeriodEnd: ctx.creemPeriodEnd,
    anchor: ctx.createdAt,
  })

  const service = await createServiceClient()
  const { data } = await service
    .from("user_credits")
    .select("balance, period_start, plan_key, allowance")
    .eq("user_id", ctx.userId)
    .single()

  // No row yet, a rolled period, or a changed plan all mean "the balance
  // they'd get on their next request is a fresh allowance" — show that,
  // don't show a stale number.
  const stale =
    !data ||
    data.plan_key !== planKey ||
    data.allowance !== policy.allowance ||
    new Date(data.period_start).getTime() !== period.start.getTime()

  return {
    balance: stale ? policy.allowance : data.balance,
    allowance: policy.allowance,
    periodEnd: period.end.toISOString(),
    planKey,
    periodKind: period.kind,
  }
}

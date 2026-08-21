// Voice Refresh — read the user's recent X posts, distil a StyleProfile.
//
// Order matters and mirrors /api/generate's discipline:
//   1 AUTH  2 ENTITLEMENT  3 CONNECTION  4 RESERVE  5 X FETCH
//   6 FILTER  7 GEMINI  8 COMPLETE   — with a refund on every failure after 4.
//
// The allowance is reserved BEFORE any paid work, because that is the only
// way two concurrent requests on the last remaining refresh can be made to
// consume at most one. Everything after the reservation refunds on failure,
// so a failed refresh costs the user nothing.
//
// Credits: this route never calls reserve_credit/refund_credit. It logs to
// ai_usage_log under generation_mode "style_profile", whose credit cost is 0,
// so a Voice Refresh cannot touch the 1,000-credit balance.
//
// Privacy: the corpus exists only as a local variable for the duration of
// this request. It is never written to a table, never logged, and never
// returned. Only counts are persisted.
import { NextResponse, type NextRequest } from "next/server"
import { getRequestUser } from "@/lib/auth/requestUser"
import { loadUserEntitlement, claimRequestId, completeUsageLog } from "@/lib/ai/quota"
import { resolvePlanKey } from "@/lib/ai/credits"
import { isIncludedAiAvailable, GEMINI_INCLUDED_MODEL } from "@/lib/ai/config"
import { buildStyleProfileMessages } from "@/lib/ai/prompts"
import { callGemini } from "@/lib/ai/gemini"
import { computeProviderCostUsd } from "@/lib/ai/pricing"
import {
  reserveVoiceRefresh, refundVoiceRefresh, completeVoiceRefresh, refreshAllowanceFor, VOICE_REFRESH_COOLDOWN_MS,
} from "@/lib/voiceRefresh/allowance"
import { fetchOwnPosts, XApiError, FIRST_FETCH, SECOND_FETCH, MAX_FETCH } from "@/lib/x/client"
import {
  buildCorpus, shouldFetchSecondPage, isViableCorpus, MIN_CORPUS, TARGET_CORPUS, type RawXPost,
} from "@/lib/x/filter"

const UUID_RE = /^[0-9a-f-]{36}$/i

// Same MIN_POSTS/percentile logic as extension/lib/styleProfile.ts's
// computeLengthProfile() — duplicated deliberately (separate deployments,
// same convention as lib/entitlements.ts). Percentiles, not mean, so one
// outlier post can't drag "medium" toward it.
const MIN_POSTS_FOR_LENGTH_BASELINE = 4
function percentile(sortedLens: number[], p: number): number {
  const idx = (sortedLens.length - 1) * p
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return sortedLens[lo]
  return Math.round(sortedLens[lo] + (sortedLens[hi] - sortedLens[lo]) * (idx - lo))
}
function computeLengthProfile(charLens: number[]): { p25: number; median: number; p75: number } | null {
  if (charLens.length < MIN_POSTS_FOR_LENGTH_BASELINE) return null
  const lens = [...charLens].sort((a, b) => a - b)
  return { p25: percentile(lens, 0.25), median: percentile(lens, 0.5), p75: percentile(lens, 0.75) }
}

function fail(error: string, code: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, code, ...extra }, { status })
}

export async function POST(request: NextRequest) {
  // 1. AUTH
  const user = await getRequestUser(request)
  if (!user) return fail("Sign in required.", "UNAUTHENTICATED", 401)

  let body: { requestId?: string }
  try { body = await request.json() } catch { return fail("Malformed request.", "INVALID_REQUEST", 400) }

  const requestId = body.requestId
  if (!requestId || !UUID_RE.test(requestId)) {
    return fail("Missing or invalid requestId.", "INVALID_REQUEST", 400)
  }

  // 2. ENTITLEMENT — server-derived. The client never asserts its plan.
  const entitlement = await loadUserEntitlement(user.id)
  if (!entitlement) return fail("Account not found.", "NOT_ENTITLED", 403)

  const planKey = resolvePlanKey(
    {
      plan: entitlement.plan,
      aiIncludedOverride: entitlement.aiIncludedOverride,
      giftExpiresAt: entitlement.giftExpiresAt,
    },
    new Date()
  )
  if (refreshAllowanceFor(planKey) <= 0) {
    return fail("Voice Refresh is available on Pro.", "NOT_ENTITLED", 403)
  }

  // Voice Refresh runs on Aminta's Gemini key, so the same kill switch and
  // global spend caps that gate Included AI apply here too.
  const availability = await isIncludedAiAvailable(planKey)
  if (!availability.ok) return fail(availability.reason, availability.code, 403)

  const ctx = {
    userId: user.id,
    plan: entitlement.plan,
    aiIncludedOverride: entitlement.aiIncludedOverride,
    giftExpiresAt: entitlement.giftExpiresAt,
  }

  // 4. RESERVE — before any paid X read or Gemini call.
  const reservation = await reserveVoiceRefresh(ctx, requestId)
  if (!reservation.ok) {
    if (reservation.reason === "too_soon") {
      return fail(
        "Your voice is up to date. Check back next week.",
        "TOO_SOON",
        403,
        { nextEligibleAt: reservation.nextEligibleAt?.toISOString() ?? null }
      )
    }
    return fail("Couldn't start Voice Refresh right now. Try again in a moment.", "RESERVE_FAILED", 503)
  }

  // Everything past here refunds on failure.
  const refund = async () => { await refundVoiceRefresh(user.id, requestId) }

  let fetched: RawXPost[] = []
  try {
    // 5. X FETCH — bounded. First page is usually enough; a second page only
    // when the first does not yield a strong corpus. Hard cap MAX_FETCH.
    const first = await fetchOwnPosts(user.id, FIRST_FETCH)
    fetched = first.posts

    const firstPass = buildCorpus(fetched, TARGET_CORPUS)
    if (shouldFetchSecondPage(firstPass.corpus.length, !!first.nextToken, fetched.length, MAX_FETCH)) {
      const room = Math.min(SECOND_FETCH, MAX_FETCH - fetched.length)
      const second = await fetchOwnPosts(user.id, room, first.nextToken)
      fetched = fetched.concat(second.posts)
    }
  } catch (e) {
    await refund()
    if (e instanceof XApiError) {
      if (e.code === "x_not_connected") return fail("Connect your X account first.", "X_NOT_CONNECTED", 400)
      // 409, deliberately NOT 401. The extension's authedFetch treats any 401
      // as "the Aminta session expired" and retries after refreshing the
      // Supabase token — which would swallow this and tell the user to sign
      // in again, when what actually expired is their X authorization.
      if (e.code === "x_reauth_required") return fail("Your X authorization expired. Please reconnect.", "X_REAUTH_REQUIRED", 409)
      if (e.code === "x_rate_limited") return fail("X is rate limiting requests. Try again shortly.", "X_RATE_LIMITED", 429)
    }
    console.error("[Voice Refresh] X fetch failed", { code: e instanceof XApiError ? e.code : "unknown" })
    return fail("Couldn't reach X right now. Please try again.", "X_UNAVAILABLE", 502)
  }

  // 6. FILTER
  const { corpus, stats } = buildCorpus(fetched, TARGET_CORPUS)
  if (!isViableCorpus(corpus.length)) {
    await refund()
    return fail(
      `Not enough recent original posts to learn from — Aminta needs at least ${MIN_CORPUS}.`,
      "INSUFFICIENT_POSTS",
      422
    )
  }

  // 7. GEMINI — same prompt builder and model as the existing style_profile
  // path, logged under the same mode so cost lands in ai_usage_log.
  const messages = buildStyleProfileMessages(corpus.map((c) => ({ text: c.text, source: "x_history" as const })))
  const inputChars = corpus.reduce((n, c) => n + c.text.length, 0)

  const claim = await claimRequestId({
    requestId,
    userId: user.id,
    generationMode: "style_profile",
    inputChars,
    imageCount: 0,
    clientIp: null,
    deviceId: null,
    planKey,
  })
  // A replay of the same requestId already has a usage row; only a fresh
  // claim owns one to complete. The allowance reservation above is the
  // authoritative idempotency gate, so a replay simply logs nothing extra.
  const rowId = claim.claimed ? claim.rowId : null

  const startedAt = Date.now()
  try {
    const result = await callGemini(messages, { generationType: "voice_refresh" })

    const { costUsd } = computeProviderCostUsd({
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      inputChars,
      outputChars: result.text.length,
    })

    if (rowId != null) {
      await completeUsageLog(rowId, {
        status: "success",
        // Deliberately NOT storing resultText: it is the user's style
        // profile, and nothing replays a Voice Refresh from cache.
        latencyMs: Date.now() - startedAt,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.totalTokens,
        model: result.model,
        estimatedCostUsd: costUsd,
      })
    }

    // 8. COMPLETE — counts only, never content.
    await completeVoiceRefresh(user.id, requestId, stats.fetched, stats.used)

    // The raw corpus goes out of scope here and is never persisted anywhere.
    // lengthProfile is 3 numbers of plain arithmetic on corpus.text.length —
    // no extra model call, no raw post text crosses back to the client.
    return NextResponse.json({
      profileJson: result.text,
      postsAnalyzed: stats.used,
      lengthProfile: computeLengthProfile(corpus.map((c) => c.text.length)),
      nextEligibleAt: new Date(Date.now() + VOICE_REFRESH_COOLDOWN_MS).toISOString(),
    })
  } catch (e) {
    await refund()
    const detail = e instanceof Error ? e.message : String(e)
    // Mode and reason only — never the corpus or the prompt.
    console.error("[Voice Refresh] extraction failed", { requestId, detail })
    if (rowId != null) {
      await completeUsageLog(rowId, { status: "error", errorDetail: detail, latencyMs: Date.now() - startedAt })
    }
    return fail("Couldn't analyze your posts right now. Please try again.", "EXTRACTION_FAILED", 502)
  }
}

// Model reference kept so a future model change is a single edit upstream.
export const runtime = "nodejs"
export const GEMINI_MODEL_REF = GEMINI_INCLUDED_MODEL

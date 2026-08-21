// Included AI (Pro/Founder/Gifted) generation endpoint. BYOK never calls
// this route — free users' requests stay entirely client-side in the
// extension, straight to their own provider key. This endpoint exists
// exclusively to protect Aminta's own Gemini key, and re-checks entitlement
// server-side on every request rather than trusting the caller's own
// aiIncluded routing decision (that decision is a client-side UX hint only,
// never a security boundary).
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

import { aiIncluded } from "@/lib/entitlements"
import { isIncludedAiAvailable } from "@/lib/ai/config"
import { callGemini } from "@/lib/ai/gemini"
import { buildMessages, buildStyleProfileMessages, buildThreadMessages, withImages, type Mode, type OutputLength, type Tone, type VoiceProfile, type StyleProfile, type StyleCorpusEntry } from "@/lib/ai/prompts"
import { checkAndIncrementRateLimits, claimConcurrencySlot, clearInflight } from "@/lib/ai/rateLimit"
import { loadUserEntitlement, resolveLimits, claimRequestId, completeUsageLog } from "@/lib/ai/quota"
import { reserveCredits, refundCredits } from "@/lib/ai/creditService"
import { resolvePlanKey } from "@/lib/ai/credits"
import { computeProviderCostUsd } from "@/lib/ai/pricing"
import { validateImages, validateCorpus, hashedClientIp, isAllowedOrigin, MAX_REQUEST_BODY_BYTES } from "@/lib/ai/security"
import { cleanGenerationOutput } from "@/lib/ai/textCleanup"

export const runtime = "nodejs"

// ─── Request validation limits — hardcoded, never client-overridable ───────
const MAX_INPUT_CHARS = 4_000
const MODES = new Set<Mode | "style_profile" | "thread">(["tweet", "reply", "polish", "style_profile", "thread"])
const TONES = new Set<Tone>(["direct", "witty", "analytical", "inspiring"])
const LENGTHS = new Set<OutputLength>(["short", "medium", "long"])
const MAX_TEMPLATE_INSTRUCTION_CHARS = 1_000

interface GenerateBody {
  requestId?: string
  generationMode?: string
  input?: string
  images?: string[]
  hasImages?: boolean
  voice?: VoiceProfile
  styleProfile?: StyleProfile | null
  tone?: Tone
  length?: OutputLength
  templateInstruction?: string
  corpus?: StyleCorpusEntry[]
}

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

async function getUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(request: NextRequest) {
  // 0. TRANSPORT-LEVEL HARDENING — content-type, origin, body size. All
  // defense in depth: auth + the independent entitlement check below remain
  // the actual security boundary.
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    return errorResponse("Invalid content type.", "INVALID_REQUEST", 400)
  }
  if (!isAllowedOrigin(request.headers)) {
    return errorResponse("Request origin not allowed.", "INVALID_REQUEST", 403)
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (contentLength > MAX_REQUEST_BODY_BYTES) {
    return errorResponse("Request too large.", "INVALID_REQUEST", 413)
  }

  // 1. AUTH
  const user = await getUser(request)
  if (!user) return errorResponse("Sign in required.", "UNAUTHENTICATED", 401)

  // 2. AUTHORIZATION — hard, independent server-side check. Never trust the
  // client's own entitlement routing decision (its `aiIncluded`/
  // `providerMode` fields exist purely to pick a client-side code path).
  //
  // Under the credit model EVERY signed-in account may use Included AI —
  // free included, funded by its own (smaller) daily credit allowance. So
  // the gate here is no longer "are you paid", it's "do you have credits",
  // which is decided atomically at reservation time in step 8. All this
  // step still does is confirm the account exists.
  //
  // Deliberately ordered BEFORE the spend-cap check below: which caps apply
  // depends on the user's resolved plan (free gets its own sub-cap), so the
  // plan has to be known first.
  const entitlement = await loadUserEntitlement(user.id)
  if (!entitlement) return errorResponse("Account not found.", "NOT_ENTITLED", 403)

  const planKey = resolvePlanKey(
    {
      plan: entitlement.plan,
      aiIncludedOverride: entitlement.aiIncludedOverride,
      giftExpiresAt: entitlement.giftExpiresAt,
    },
    new Date()
  )

  // 3. KILL SWITCH + SPEND CAPS — server-authoritative, plan-aware. Free
  // accounts stop at the free sub-cap; paid accounts continue until the
  // global cap. The client is never consulted and never sees a dollar value.
  const availability = await isIncludedAiAvailable(planKey)
  if (!availability.ok) {
    return errorResponse(availability.reason, availability.code, 403)
  }

  const limits = await resolveLimits(entitlement)

  // 4. VALIDATION
  let body: GenerateBody
  try {
    const parsed = await request.json()
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return errorResponse("Malformed request.", "INVALID_REQUEST", 400)
    }
    body = parsed
  } catch {
    return errorResponse("Malformed request.", "INVALID_REQUEST", 400)
  }

  const { requestId, generationMode } = body
  if (!requestId || typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return errorResponse("Missing or invalid requestId.", "INVALID_REQUEST", 400)
  }
  if (!generationMode || !MODES.has(generationMode as Mode | "style_profile" | "thread")) {
    return errorResponse("Invalid generationMode.", "INVALID_REQUEST", 400)
  }

  const isStyleProfile = generationMode === "style_profile"
  const isThread = generationMode === "thread"

  if (isStyleProfile) {
    const corpusCheck = validateCorpus(body.corpus)
    if (!corpusCheck.ok) return errorResponse(corpusCheck.reason, "INVALID_REQUEST", 400)
  } else {
    if (typeof body.input !== "string") {
      return errorResponse("Missing input.", "INVALID_REQUEST", 400)
    }
    if (body.input.length > MAX_INPUT_CHARS) {
      return errorResponse(`Input too long (max ${MAX_INPUT_CHARS} characters).`, "INVALID_REQUEST", 400)
    }
    if (body.tone && !TONES.has(body.tone)) return errorResponse("Invalid tone.", "INVALID_REQUEST", 400)
    if (body.length && !LENGTHS.has(body.length)) return errorResponse("Invalid length.", "INVALID_REQUEST", 400)
    if (!body.voice || typeof body.voice !== "object") return errorResponse("Missing voice profile.", "INVALID_REQUEST", 400)
    if (body.templateInstruction !== undefined) {
      if (typeof body.templateInstruction !== "string" || body.templateInstruction.length > MAX_TEMPLATE_INSTRUCTION_CHARS) {
        return errorResponse("Invalid template instruction.", "INVALID_REQUEST", 400)
      }
    }
  }

  // Never trust the client's own image cap/type/size — re-validate
  // independently even though the extension already caps/re-encodes images
  // client-side (extension/lib/tweetMedia.ts, lib/images.ts).
  const images = body.images ?? []
  const imagesCheck = validateImages(images)
  if (!imagesCheck.ok) return errorResponse(imagesCheck.reason, "INVALID_REQUEST", 400)

  // 5. RATE LIMITING — hashed IP only; never store/compare a raw address.
  const hashedIp = hashedClientIp(request.headers)
  const deviceId = request.headers.get("x-aminta-device-id")
  const rateLimit = await checkAndIncrementRateLimits({ userId: user.id, ip: hashedIp, deviceId })
  if (!rateLimit.ok) return errorResponse(rateLimit.reason, "RATE_LIMITED", 429)

  // 6. CONCURRENCY — atomic claim (delete-expired + count + insert in one
  // Postgres function call, see lib/ai/rateLimit.ts). Also reserves the
  // inflight row up front, so there's no separate markInflight step later.
  const concurrency = await claimConcurrencySlot(requestId, user.id, limits.maxConcurrent)
  if (!concurrency.ok) return errorResponse(concurrency.reason, "CONCURRENT_LIMIT", 429)

  // 7. IDEMPOTENCY — scoped to (user_id, request_id); see quota.ts's
  // claimRequestId() header comment for why request_id alone isn't enough.
  const claim = await claimRequestId({
    requestId,
    userId: user.id,
    generationMode,
    inputChars: isStyleProfile ? 0 : (body.input?.length ?? 0),
    imageCount: images.length,
    clientIp: hashedIp,
    deviceId,
    planKey,
  })
  if (!claim.claimed) {
    await clearInflight(requestId)
    if (claim.state === "success") return NextResponse.json({ text: claim.existing.result_text })
    if (claim.state === "error") return errorResponse("Generation failed. Please try again.", "PROVIDER_ERROR", 502)
    // expired: the row succeeded, but its generated text is past
    // CONTENT_TTL_MS (scrubbed, or about to be). We can't replay content we
    // deliberately no longer keep, and we must not echo the NULL back as a
    // success — the client asks for a fresh generation instead. In practice
    // this is close to unreachable: requestId lives only inside one
    // backendGenerate() call and is never persisted client-side, so a
    // replay 15+ minutes later shouldn't happen.
    if (claim.state === "expired") {
      return errorResponse(
        "That result is no longer available. Please generate again.",
        "RESULT_EXPIRED",
        410
      )
    }
    // in_progress: the original request for this id is still running.
    // Never treat this as success with a null/empty result.
    return errorResponse("This request is already being processed.", "REQUEST_IN_PROGRESS", 409)
  }
  const rowId = claim.rowId

  // 8. CREDITS — atomic reserve. This replaces the old daily/monthly quota
  // entirely (that one COUNTed ai_usage_log rows outside any lock, so two
  // concurrent requests could both pass on the same last unit).
  //
  // Reserve BEFORE the provider call, not after: the Gemini call can take
  // up to 15s, and leaving the balance untouched for that window is exactly
  // what lets parallel requests oversell the final credit. Anything that
  // fails after this point refunds (see the catch and the failure paths
  // below), so a failed generation ultimately costs the user 0.
  //
  // reserveCredits() is idempotent per (user, requestId): a retry of the
  // same generation re-uses the original reservation instead of charging
  // twice. style_profile resolves to cost 0 via the central mapping in
  // lib/ai/credits.ts — not special-cased here.
  const creditCtx = {
    userId: user.id,
    plan: entitlement.plan,
    aiIncludedOverride: entitlement.aiIncludedOverride,
    giftExpiresAt: entitlement.giftExpiresAt,
    creemPeriodStart: entitlement.creemPeriodStart,
    creemPeriodEnd: entitlement.creemPeriodEnd,
    createdAt: entitlement.createdAt,
  }
  const reservation = await reserveCredits(creditCtx, requestId, generationMode, "user")
  if (!reservation.ok) {
    const outOfCredits = reservation.reason === "insufficient_credits"
    const message = outOfCredits
      ? (reservation.planKey === "free"
          ? "You're out of free credits for today."
          : "You've used your Included AI credits for this billing period.")
      : "Couldn't start generation right now. Try again in a moment."
    await completeUsageLog(rowId, { status: "error", errorDetail: reservation.reason })
    await clearInflight(requestId)
    return errorResponse(message, outOfCredits ? "OUT_OF_CREDITS" : "PROVIDER_ERROR", outOfCredits ? 403 : 503)
  }

  // 9. PROVIDER CALL — model/provider chosen entirely server-side
  // (lib/ai/config.ts's GEMINI_INCLUDED_MODEL); the client never supplies
  // or influences which model runs here.
  const startedAt = Date.now()
  try {
    const prepStartedAt = Date.now()
    const messages = isStyleProfile
      ? buildStyleProfileMessages(body.corpus!)
      : isThread
        ? buildThreadMessages(body.voice!, body.input!, body.styleProfile ?? null, body.tone ?? "direct")
        : withImages(
            buildMessages(
              generationMode as Mode,
              body.voice!,
              body.input!,
              body.styleProfile ?? null,
              body.tone ?? "direct",
              body.length ?? "medium",
              body.templateInstruction,
              !!body.hasImages
            ),
            images
          )
    const prepMs = Date.now() - prepStartedAt

    // Structured `{ text }` output only for real single-post generation —
    // style_profile and thread both keep their own JSON-via-prompt contract
    // (parsed client-side).
    const result = await callGemini(messages, { structuredText: !isStyleProfile && !isThread, generationType: generationMode })
    const latencyMs = Date.now() - startedAt
    // style_profile/thread return raw JSON for client-side parsing —
    // cleanup (label/quote stripping, punctuation normalization) is only
    // valid for actual post/reply/polish/template text.
    const outputText = (isStyleProfile || isThread) ? result.text : cleanGenerationOutput(result.text)
    const outputChars = outputText.length
    const inputChars = isStyleProfile ? 200 : (body.input?.length ?? 0)
    // Model-aware provider cost (lib/ai/pricing.ts). This is internal dollar
    // accounting for the spend caps and the audit log ONLY — it never
    // influences how many credits the user was charged.
    const { costUsd: cost } = computeProviderCostUsd({
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      inputChars,
      outputChars,
    })

    // Latency instrumentation — timing/model/mode only, never the prompt,
    // the response text, or any credential.
    console.log("[Included AI] generation latency", {
      generationType: generationMode,
      model: result.model,
      prepMs,
      apiMs: result.apiMs,
      parseMs: result.parseMs,
      totalMs: latencyMs,
    })

    // 10. USAGE LOG — real token counts when the provider returned them,
    // never only the char-count estimate.
    await completeUsageLog(rowId, {
      status: "success",
      resultText: outputText,
      latencyMs,
      outputTokensEst: result.outputTokens,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      model: result.model,
      estimatedCostUsd: cost,
    })
    await clearInflight(requestId)

    // Hand back the post-reservation balance so the panel can show the real
    // number immediately. These are reserveCredits()'s own outputs, i.e. what
    // the debit actually left in the row — the client never derives a balance
    // by subtracting, which would go wrong on refunds, idempotent retries,
    // period resets, and generations from a second panel.
    return NextResponse.json({
      text: outputText,
      credits: {
        balance: reservation.balance,
        allowance: reservation.allowance,
        periodEnd: reservation.periodEnd.toISOString(),
        planKey: reservation.planKey,
      },
    })
  } catch (e) {
    // Detailed error goes to server logs; the client only ever sees a
    // generic message — never forward provider internals outward.
    const detail = e instanceof Error ? e.message : String(e)
    console.error("[Included AI] generation failed", { userId: user.id, generationMode, requestId, detail })
    // Give the credit back. Covers every provider failure mode that lands
    // here: Gemini 429/5xx after retries, the 15s deadline, network errors,
    // safety blocks, and empty responses. Idempotent, so a retried request
    // that fails again doesn't double-refund.
    await refundCredits(user.id, requestId)
    await completeUsageLog(rowId, { status: "error", errorDetail: detail, latencyMs: Date.now() - startedAt })
    await clearInflight(requestId)
    return errorResponse("Generation failed. Please try again.", "PROVIDER_ERROR", 502)
  }
}

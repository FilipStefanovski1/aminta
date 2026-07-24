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
import { buildMessages, buildStyleProfileMessages, withImages, type Mode, type OutputLength, type Tone, type VoiceProfile, type StyleProfile, type StyleCorpusEntry } from "@/lib/ai/prompts"
import { checkAndIncrementRateLimits, claimConcurrencySlot, clearInflight } from "@/lib/ai/rateLimit"
import { loadUserEntitlement, resolveLimits, checkQuota, claimRequestId, completeUsageLog, estimateCostUsd } from "@/lib/ai/quota"
import { validateImages, validateCorpus, hashedClientIp, isAllowedOrigin, MAX_REQUEST_BODY_BYTES } from "@/lib/ai/security"

export const runtime = "nodejs"

// ─── Request validation limits — hardcoded, never client-overridable ───────
const MAX_INPUT_CHARS = 4_000
const MODES = new Set<Mode | "style_profile">(["tweet", "reply", "polish", "style_profile"])
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

  // 2. KILL SWITCH + SPEND CAP
  const availability = await isIncludedAiAvailable()
  if (!availability.ok) return errorResponse(availability.reason, "AI_INCLUDED_DISABLED", 403)

  // 3. AUTHORIZATION — hard, independent server-side check. Never trust the
  // client's own entitlement routing decision (its `aiIncluded`/
  // `providerMode` fields exist purely to pick a client-side code path).
  const entitlement = await loadUserEntitlement(user.id)
  if (!entitlement) return errorResponse("Account not found.", "NOT_ENTITLED", 403)

  const included = aiIncluded({
    plan: entitlement.plan,
    subscription_status: entitlement.subscriptionStatus,
    ai_included_override: entitlement.aiIncludedOverride,
  })
  if (!included) {
    return errorResponse("Included AI requires Pro, Founder, or a gift — switch to your own API key in Settings.", "NOT_ENTITLED", 403)
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
  if (!generationMode || !MODES.has(generationMode as Mode | "style_profile")) {
    return errorResponse("Invalid generationMode.", "INVALID_REQUEST", 400)
  }

  const isStyleProfile = generationMode === "style_profile"

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
  })
  if (!claim.claimed) {
    await clearInflight(requestId)
    if (claim.state === "success") return NextResponse.json({ text: claim.existing.result_text })
    if (claim.state === "error") return errorResponse("Generation failed. Please try again.", "PROVIDER_ERROR", 502)
    // in_progress: the original request for this id is still running.
    // Never treat this as success with a null/empty result.
    return errorResponse("This request is already being processed.", "REQUEST_IN_PROGRESS", 409)
  }
  const rowId = claim.rowId

  // 8. QUOTA (skipped for style_profile — cheap, infrequent, small-output;
  // still subject to rate limiting/concurrency/entitlement above)
  if (!isStyleProfile) {
    const quota = await checkQuota(user.id, limits.dailyLimit, limits.monthlyLimit)
    if (!quota.ok) {
      await completeUsageLog(rowId, { status: "error", errorDetail: quota.reason })
      await clearInflight(requestId)
      return errorResponse(quota.reason, "QUOTA_EXCEEDED", 403)
    }
  }

  // 9. PROVIDER CALL — model/provider chosen entirely server-side
  // (lib/ai/gemini.ts's hardcoded GEMINI_MODEL); the client never supplies
  // or influences which model runs here.
  const startedAt = Date.now()
  try {
    const messages = isStyleProfile
      ? buildStyleProfileMessages(body.corpus!)
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

    const result = await callGemini(messages)
    const latencyMs = Date.now() - startedAt
    const outputChars = result.text.length
    const inputChars = isStyleProfile ? 200 : (body.input?.length ?? 0)
    const cost = estimateCostUsd(inputChars, outputChars, {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    })

    // 10. USAGE LOG — real token counts when the provider returned them,
    // never only the char-count estimate.
    await completeUsageLog(rowId, {
      status: "success",
      resultText: result.text,
      latencyMs,
      outputTokensEst: result.outputTokens,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      model: result.model,
      estimatedCostUsd: cost,
    })
    await clearInflight(requestId)

    return NextResponse.json({ text: result.text })
  } catch (e) {
    // Detailed error goes to server logs; the client only ever sees a
    // generic message — never forward provider internals outward.
    const detail = e instanceof Error ? e.message : String(e)
    console.error("[Included AI] generation failed", { userId: user.id, generationMode, requestId, detail })
    await completeUsageLog(rowId, { status: "error", errorDetail: detail, latencyMs: Date.now() - startedAt })
    await clearInflight(requestId)
    return errorResponse("Generation failed. Please try again.", "PROVIDER_ERROR", 502)
  }
}

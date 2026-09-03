// Included-AI network client. Only ever invoked when shouldUseIncludedAi(store)
// is true — BYOK never calls this, never even imports it into its own code
// path (lib/ai.ts, lib/gemini.ts, lib/openrouter.ts are untouched and keep
// calling providers directly, exactly as before this file existed).
//
// Reuses the same Bearer-token + retry-once-on-401 pattern as
// lib/sync.ts's authedFetch, just pointed at a different endpoint.
import { getAuthSession, refreshAuthSession } from "~lib/auth"
import { getDeviceId } from "~lib/deviceId"
import { effectiveApiKey, shouldUseIncludedAi } from "~lib/entitlements"
import { generate as runAI, generateFromImage, type GenerateOptions } from "~lib/ai"
import { detectSlop, withAntiSlopCorrection } from "~lib/antiSlop"
import { classifyFetchError } from "~lib/generationErrors"
import { isPathologicallyShort, withLengthCorrection } from "~lib/lengthGuard"
import { buildMessages, buildThreadMessages, enforcePostCount, parseThreadResponse, type Mode, type OutputLength, type ThreadPostCount, type Tone, type ThreadOption } from "~lib/prompts"
import { cleanGenerationOutput } from "~lib/textCleanup"
import { setStore, type AmintaStore, type StyleProfile, type VoiceProfile } from "~lib/storage"

// www, not the bare apex — see lib/sync.ts's API_URL comment: amintaapp.com
// 308-redirects every request to www.amintaapp.com, and that extra
// cross-origin redirect hop on a POST is exactly the kind of thing that can
// surface as a raw connectivity failure instead of a clean response.
const API_URL = "https://www.amintaapp.com/api/generate"

// Interactive single-post deadline — mirrors lib/gemini.ts's own
// TOTAL_DEADLINE_MS for BYOK, so Included AI fails at the same point rather
// than hanging indefinitely (previously unbounded: a stalled request could
// only ever resolve via whatever the browser's own network stack eventually
// decided, which surfaced as a generic fetch rejection misreported as "check
// your internet" — see classifyFetchError). Thread generation reuses the
// existing, longer THREAD_DEADLINE_MS below instead.
const GENERATE_DEADLINE_MS = 15_000

export interface StyleCorpusEntry {
  text: string
  source: "example" | "tweet_dna" | "approved_edit" | "x_history"
}

export interface TextGenerateArgs {
  generationMode: Mode
  input: string
  voice: VoiceProfile
  styleProfile: StyleProfile | null
  tone: Tone
  length: OutputLength
  templateInstruction?: string
  // Quick Rewrite actions (OutputCard) — polish mode only. See
  // lib/prompts.ts's buildMessages for what this changes.
  polishRevision?: string
  images?: string[]
  hasImages?: boolean
}

export interface StyleProfileGenerateArgs {
  generationMode: "style_profile"
  corpus: StyleCorpusEntry[]
}

export interface ThreadGenerateArgs {
  generationMode: "thread"
  input: string
  voice: VoiceProfile
  styleProfile: StyleProfile | null
  tone: Tone
  // Was missing entirely — Thread Creator's Short/Medium/Long selector had
  // no way to reach generation at all. See lib/prompts.ts's
  // threadPostDepthGuide for why this mattered (fragment-collapse bug).
  length: OutputLength
  // How many posts — independent from `length` (per-post depth). Optional
  // here purely so existing call sites/tests that don't care about it don't
  // need updating; runThreadGenerate always supplies a real value (default 4).
  postCount?: ThreadPostCount
  // Thread template structural guidance (see lib/templates.ts's
  // buildThreadTemplateInstruction) — the user's current postCount above
  // always wins over however many posts the template itself shows.
  templateInstruction?: string
}

// Onboarding's one-time "Make it sound like me" demo post — same shape and
// same prompt as a real tweet generation, but the user never pressed
// Generate for it, so it must not cost a normal generation credit (same
// principle as style_profile being free: an action the product triggers on
// the user's behalf, not one they explicitly asked for). A distinct
// generationMode is what actually makes this free server-side — see
// landing/lib/ai/credits.ts's CREDIT_COSTS and app/api/generate/route.ts,
// which treats this identically to "tweet" for prompt-building but prices
// it at 0. BYOK never reaches this at all (no credit involved there
// regardless of mode) — see OnboardingWizard.tsx's generateFirstPost().
export interface OnboardingDemoGenerateArgs {
  generationMode: "onboarding_demo"
  input: string
  voice: VoiceProfile
  styleProfile: StyleProfile | null
  tone: Tone
  length: OutputLength
}

type BackendGenerateArgs = TextGenerateArgs | StyleProfileGenerateArgs | ThreadGenerateArgs | OnboardingDemoGenerateArgs

interface GenerateResponse {
  text?: string
  error?: string
  code?: string
  // Post-reservation balance straight from the server's own debit. Present
  // only on a successful billable generation.
  credits?: {
    balance: number
    allowance: number
    periodEnd: string
    planKey: string
  }
}

async function postGenerate(body: BackendGenerateArgs & { requestId: string }): Promise<GenerateResponse> {
  const session = await getAuthSession()
  if (!session) throw new Error("Sign in required.")
  const deviceId = await getDeviceId()
  const deadlineMs = body.generationMode === "thread" ? THREAD_DEADLINE_MS : GENERATE_DEADLINE_MS

  const doFetch = (accessToken: string) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), deadlineMs)
    return fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Aminta-Device-Id": deviceId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))
  }

  let res: Response
  try {
    res = await doFetch(session.accessToken)
  } catch (e) {
    throw classifyFetchError(e)
  }

  if (res.status === 401) {
    const refreshed = await refreshAuthSession()
    if (!refreshed) throw new Error("Session expired. Please sign in again.")
    try {
      res = await doFetch(refreshed.accessToken)
    } catch (e) {
      throw classifyFetchError(e)
    }
  }

  let json: GenerateResponse
  try {
    json = await res.json()
  } catch {
    throw new Error("Unexpected response from the server.")
  }

  if (!res.ok) {
    throw new Error(json.error ?? `Request failed (${res.status}).`)
  }

  // Persist the server's balance the moment it arrives. This is the single
  // choke point every Included AI generation passes through, so the panel
  // and Settings both update from one place with no extra request and no
  // second reservation.
  //
  // Only ever the value the server sent — never balance - 1. A local
  // decrement would drift on refund-after-failure (the request throws before
  // reaching here, so nothing is written), on an idempotent retry (the
  // server re-reports the original balance rather than charging again), on a
  // period reset, and on a generation started from another panel. Absent
  // `credits` (e.g. an idempotent replay served from cache) simply leaves
  // the last known value in place rather than guessing at a new one.
  if (json.credits) {
    await setStore({
      creditsBalance: json.credits.balance,
      creditsAllowance: json.credits.allowance,
      creditsPeriodEnd: json.credits.periodEnd,
    })
  }

  return json
}

// requestId is generated once per user-initiated click (e.g. one Generate
// button press) and reused across an internal 401-refresh-retry — that's
// what makes the backend's idempotency check correct for "the same click,
// retried once for a token refresh" vs. a genuinely new request.
export async function backendGenerate(args: BackendGenerateArgs): Promise<string> {
  const requestId = crypto.randomUUID()
  const json = await postGenerate({ ...args, requestId })
  if (!json.text) throw new Error("Empty response from the server.")
  // style_profile/thread both return raw JSON (parsed client-side) —
  // post-generation text cleanup (label/quote stripping, punctuation
  // normalization) would corrupt it, so only apply it to actual
  // post/reply/polish/template output. The backend already runs the same
  // cleanup server-side (see landing/lib/ai/textCleanup.ts) before
  // returning — this is a second, harmless pass in case the two ever
  // drift, not the primary cleanup step.
  return args.generationMode === "style_profile" || args.generationMode === "thread"
    ? json.text
    : cleanGenerationOutput(json.text)
}

// 3 thread options, each with several Medium-depth (or longer) posts, in
// ONE JSON response, needs far more room than a single tweet/reply/polish —
// the shared 400-token default was silently truncating that JSON mid-
// response once posts were asked to be developed (see lib/prompts.ts's
// threadPostDepthGuide), producing invalid JSON that failed to parse. That
// surfaced as "Couldn't generate distinct threads from that" even though
// there was never an actual distinctness check involved — the response
// just never finished. 2000 tokens comfortably covers 3 threads x up to 7
// Medium/Long posts with real headroom; verified against the actual prompt
// (lib/premiseAndLength.test.ts's fixtures) rather than picked at random.
export const THREAD_MAX_OUTPUT_TOKENS = 2000
// Generating ~2000 tokens legitimately takes longer than the default 15s
// interactive deadline (tuned for a ~400-token single post) — without this,
// a thread response that would have completed successfully could instead
// be cut off by the deadline itself.
export const THREAD_DEADLINE_MS = 30_000

/**
 * Thread Creator — ONE model call, 3 thread options, one credit
 * reservation (Included) / one provider call (BYOK). Never throws on a
 * malformed model response; returns [] so the caller can show a clear
 * "couldn't generate threads" state instead of crashing.
 */
export async function runThreadGenerate(
  store: AmintaStore,
  args: { input: string; voice: VoiceProfile; styleProfile: StyleProfile | null; tone: Tone; length: OutputLength; postCount?: ThreadPostCount; templateInstruction?: string }
): Promise<ThreadOption[]> {
  const postCount = args.postCount ?? 4
  if (shouldUseIncludedAi(store)) {
    const raw = await backendGenerate({ generationMode: "thread", ...args, postCount })
    return enforcePostCount(parseThreadResponse(raw), postCount)
  }
  const messages = buildThreadMessages(args.voice, args.input, args.styleProfile, args.tone, args.length, postCount, args.templateInstruction)
  const raw = await runAI(effectiveApiKey(store), store.model, messages, {
    generationType: "thread",
    maxOutputTokens: THREAD_MAX_OUTPUT_TOKENS,
    totalDeadlineMs: THREAD_DEADLINE_MS,
  })
  return enforcePostCount(parseThreadResponse(raw), postCount)
}

async function runByokGenerate(
  store: AmintaStore,
  args: TextGenerateArgs,
  onRetry?: GenerateOptions["onRetry"]
): Promise<string> {
  const messages = buildMessages(
    "x",
    args.generationMode,
    args.voice,
    args.input,
    args.styleProfile,
    args.tone,
    args.length,
    args.templateInstruction,
    args.hasImages,
    args.polishRevision
  )
  // Structured `{ text }` output for Gemini keys — args.generationMode is
  // always tweet/reply/polish here (TextGenerateArgs excludes style_profile),
  // so this is always real generation, never extraction.
  const geminiOptions: GenerateOptions = { structuredText: true, generationType: args.generationMode, onRetry }
  const raw = args.images && args.images.length > 0
    ? await generateFromImage(effectiveApiKey(store), store.model, messages, args.images, geminiOptions)
    : await runAI(effectiveApiKey(store), store.model, messages, geminiOptions)
  return cleanGenerationOutput(raw)
}

// Dispatcher for the direct call sites in GeneratorPanel.tsx (tweet/polish,
// and reply mode when not going through the image-aware
// lib/replyGeneration.ts orchestrator). Included-AI users route to the new
// backend; everyone else runs the exact same buildMessages()+generate()/
// generateFromImage() path that existed before this file did — no behavior
// change for BYOK beyond the one bounded corrective retry below.
export async function dispatchGenerate(
  store: AmintaStore,
  args: TextGenerateArgs,
  // Fired before each automatic retry of a transient Gemini error (BYOK
  // only — Included AI retries silently server-side, nothing to notify the
  // UI about mid-request). Lets GeneratorPanel.tsx show "Retrying
  // automatically…" instead of a raw provider error flashing on screen.
  onRetry?: GenerateOptions["onRetry"]
): Promise<string> {
  if (shouldUseIncludedAi(store)) {
    // No corrective retry here: reserveCredits() is idempotent per
    // requestId (a retried *identical* request is free), but a corrective
    // retry is a genuinely different, freshly-worded request — the server
    // has no free "correction" mode for that, so a second call here would
    // be a second, separately billed generation. Silently spending a
    // second credit to fix Aminta's own output would be exactly the
    // "unexpectedly double-charge" outcome this feature must never cause,
    // so Included AI relies on resolveLengthGuide's floor fix (see
    // lib/prompts.ts) to prevent the pathological case up front instead.
    return backendGenerate(args)
  }

  const text = await runByokGenerate(store, args, onRetry)

  // BYOK has no credit concept to protect — Aminta charges nothing for a
  // user's own key either way, so one bounded corrective retry is free to
  // attempt here. Never retried more than once, and the ORIGINAL result is
  // kept if the correction attempt is somehow still pathological, rather
  // than looping.
  let result = text
  if (args.generationMode !== "polish" && isPathologicallyShort(text, args.generationMode, args.length)) {
    const corrected = await runByokGenerate(
      store,
      { ...args, templateInstruction: withLengthCorrection(args.templateInstruction, args.length) },
      onRetry
    )
    if (!isPathologicallyShort(corrected, args.generationMode, args.length)) result = corrected
  }

  // Anti-slop — tweet mode only, mirroring Included AI's scope in
  // app/api/generate/route.ts (see lib/antiSlop.ts). Same "free to attempt,
  // never loops" reasoning as the length correction above: at most one more
  // call, and the best-available text is kept either way (never blocks on
  // the corrected attempt still being flagged).
  if (args.generationMode === "tweet") {
    // sourceText for the claim-provenance check — BYOK has no server-side
    // research (out of scope, see lib/antiSlop.ts), so this is just the
    // user's own input.
    const slopCheck = detectSlop(result, args.styleProfile, args.input)
    if (slopCheck.flagged) {
      const corrected = await runByokGenerate(
        store,
        { ...args, templateInstruction: withAntiSlopCorrection(args.templateInstruction, slopCheck.reasons) },
        onRetry
      )
      if (!detectSlop(corrected, args.styleProfile, args.input).flagged) result = corrected
    }
  }

  return result
}

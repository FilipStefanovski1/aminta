// Included-AI network client. Only ever invoked when shouldUseIncludedAi(store)
// is true — BYOK never calls this, never even imports it into its own code
// path (lib/ai.ts, lib/gemini.ts, lib/openrouter.ts are untouched and keep
// calling providers directly, exactly as before this file existed).
//
// Reuses the same Bearer-token + retry-once-on-401 pattern as
// lib/sync.ts's authedFetch, just pointed at a different endpoint.
import { getAuthSession, refreshAuthSession } from "~lib/auth"
import { getDeviceId } from "~lib/deviceId"
import { shouldUseIncludedAi } from "~lib/entitlements"
import { generate as runAI, generateFromImage, type GenerateOptions } from "~lib/ai"
import { buildMessages, type Mode, type OutputLength, type Tone } from "~lib/prompts"
import { cleanGenerationOutput } from "~lib/textCleanup"
import { setStore, type AmintaStore, type StyleProfile, type VoiceProfile } from "~lib/storage"

const API_URL = "https://amintaapp.com/api/generate"

export interface StyleCorpusEntry {
  text: string
  source: "example" | "tweet_dna" | "approved_edit"
}

export interface TextGenerateArgs {
  generationMode: Mode
  input: string
  voice: VoiceProfile
  styleProfile: StyleProfile | null
  tone: Tone
  length: OutputLength
  templateInstruction?: string
  images?: string[]
  hasImages?: boolean
}

export interface StyleProfileGenerateArgs {
  generationMode: "style_profile"
  corpus: StyleCorpusEntry[]
}

type BackendGenerateArgs = TextGenerateArgs | StyleProfileGenerateArgs

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

  const doFetch = (accessToken: string) =>
    fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Aminta-Device-Id": deviceId,
      },
      body: JSON.stringify(body),
    })

  let res: Response
  try {
    res = await doFetch(session.accessToken)
  } catch {
    throw new Error("Network error. Check your internet connection.")
  }

  if (res.status === 401) {
    const refreshed = await refreshAuthSession()
    if (!refreshed) throw new Error("Session expired. Please sign in again.")
    try {
      res = await doFetch(refreshed.accessToken)
    } catch {
      throw new Error("Network error. Check your internet connection.")
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
  // style_profile mode returns raw JSON (parsed client-side by
  // lib/styleProfile.ts's parseStyleProfile) — post-generation text cleanup
  // (label/quote stripping, punctuation normalization) would corrupt it, so
  // only apply it to actual post/reply/polish/template output. The backend
  // already runs the same cleanup server-side (see landing/lib/ai/
  // textCleanup.ts) before returning — this is a second, harmless pass in
  // case the two ever drift, not the primary cleanup step.
  return args.generationMode === "style_profile" ? json.text : cleanGenerationOutput(json.text)
}

// Dispatcher for the direct call sites in GeneratorPanel.tsx (tweet/polish,
// and reply mode when not going through the image-aware
// lib/replyGeneration.ts orchestrator). Included-AI users route to the new
// backend; everyone else runs the exact same buildMessages()+generate()/
// generateFromImage() path that existed before this file did — no behavior
// change for BYOK.
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
    return backendGenerate(args)
  }
  const messages = buildMessages(
    "x",
    args.generationMode,
    args.voice,
    args.input,
    args.styleProfile,
    args.tone,
    args.length,
    args.templateInstruction,
    args.hasImages
  )
  // Structured `{ text }` output for Gemini keys — args.generationMode is
  // always tweet/reply/polish here (TextGenerateArgs excludes style_profile),
  // so this is always real generation, never extraction.
  const geminiOptions: GenerateOptions = { structuredText: true, generationType: args.generationMode, onRetry }
  const raw = args.images && args.images.length > 0
    ? await generateFromImage(store.apiKey, store.model, messages, args.images, geminiOptions)
    : await runAI(store.apiKey, store.model, messages, geminiOptions)
  return cleanGenerationOutput(raw)
}

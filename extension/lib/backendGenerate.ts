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
import { generate as runAI, generateFromImage } from "~lib/ai"
import { buildMessages, type Mode, type OutputLength, type Tone } from "~lib/prompts"
import type { AmintaStore, StyleProfile, VoiceProfile } from "~lib/storage"

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
  return json.text
}

// Dispatcher for the direct call sites in GeneratorPanel.tsx (tweet/polish,
// and reply mode when not going through the image-aware
// lib/replyGeneration.ts orchestrator). Included-AI users route to the new
// backend; everyone else runs the exact same buildMessages()+generate()/
// generateFromImage() path that existed before this file did — no behavior
// change for BYOK.
export async function dispatchGenerate(store: AmintaStore, args: TextGenerateArgs): Promise<string> {
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
  return args.images && args.images.length > 0
    ? generateFromImage(store.apiKey, store.model, messages, args.images)
    : runAI(store.apiKey, store.model, messages)
}

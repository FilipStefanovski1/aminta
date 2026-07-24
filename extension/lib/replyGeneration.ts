// Image-aware reply orchestration. Pulled out of GeneratorPanel.tsx as a
// pure function with injected dependencies (same DI pattern as
// lib/templates.ts's runTemplate/RunTemplateDeps) so the decision tree —
// vision-capable provider? images actually fetchable? did the multimodal
// call succeed? — is unit-testable without mounting React or hitting a
// real network/provider.
import { buildMessages, type OutputLength, type Tone } from "~lib/prompts"
import type { ChatMessage } from "~lib/ai"
import type { StyleProfile, VoiceProfile } from "~lib/storage"

const isDev = (() => {
  try { return !("update_url" in chrome.runtime.getManifest()) } catch { return false }
})()

export interface GenerateReplyDeps {
  isGroqKey: (key: string) => boolean
  fetchImageAsDataUrl: (url: string) => Promise<string | null>
  generateText: (apiKey: string, model: string, messages: ChatMessage[]) => Promise<string>
  generateFromImages: (apiKey: string, model: string, messages: ChatMessage[], imageDataUrls: string[]) => Promise<string>
}

export interface GenerateReplyResult {
  text: string
  usedMultimodal: boolean
  imagesDetected: number
  imagesFetched: number
  fellBackToText: boolean
}

export async function generateReply(
  apiKey: string,
  model: string,
  voice: VoiceProfile,
  input: string,
  imageUrls: string[],
  styleProfile: StyleProfile | null,
  tone: Tone,
  length: OutputLength,
  deps: GenerateReplyDeps
): Promise<GenerateReplyResult> {
  const imagesDetected = imageUrls.length

  const textOnly = async (fellBackToText: boolean, imagesFetched = 0): Promise<GenerateReplyResult> => {
    const messages = buildMessages("x", "reply", voice, input, styleProfile, tone, length)
    const text = await deps.generateText(apiKey, model, messages)
    return { text, usedMultimodal: false, imagesDetected, imagesFetched, fellBackToText }
  }

  if (imagesDetected === 0) return textOnly(false)

  if (deps.isGroqKey(apiKey)) {
    if (isDev) console.log("[Aminta] reply images present but provider has no vision support — text-only", { imagesDetected, model })
    return textOnly(true)
  }

  const fetched = await Promise.all(imageUrls.map((url) => deps.fetchImageAsDataUrl(url)))
  const dataUrls = fetched.filter((d): d is string => !!d)

  if (isDev) console.log("[Aminta] reply image fetch", { imagesDetected, imagesFetched: dataUrls.length, model })

  if (dataUrls.length === 0) {
    if (isDev) console.warn("[Aminta] no reply images could be fetched — falling back to text-only")
    return textOnly(true)
  }

  try {
    const messages = buildMessages("x", "reply", voice, input, styleProfile, tone, length, undefined, true)
    const text = await deps.generateFromImages(apiKey, model, messages, dataUrls)
    if (isDev) console.log("[Aminta] reply generated via multimodal path", { imagesUsed: dataUrls.length, model })
    return { text, usedMultimodal: true, imagesDetected, imagesFetched: dataUrls.length, fellBackToText: false }
  } catch (e) {
    if (isDev) console.warn("[Aminta] multimodal reply generation failed — falling back to text-only:", e)
    return textOnly(true, dataUrls.length)
  }
}

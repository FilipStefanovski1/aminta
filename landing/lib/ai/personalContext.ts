// SOURCE OF TRUTH: extension/lib/personalContext.ts
//
// Intentional partial duplicate for the Included AI prompt builder — no
// shared package exists between extension/ and landing/ (see
// lib/ai/prompts.ts's header for the same convention). Only the two pieces
// the server actually needs are mirrored: the cap and the normalizer that
// every prompt read goes through. The extension-only UI pieces
// (HELPER_PROMPT, appendTranscript) are deliberately NOT copied here —
// nothing server-side renders the field or transcribes speech, and an
// unused copy would just be one more thing to keep in sync.
//
// Personal Context is free-text background about WHO the user is. It rides
// inside VoiceProfile (aminta_state.voice_profile jsonb), so it arrives
// here on the request body exactly like every other voice field.

/** Hard cap — this text goes into every generation prompt. */
export const MAX_PERSONAL_CONTEXT_CHARS = 2000

/** Trims and enforces the cap. Always run before prompting. */
export function normalizePersonalContext(raw: string | undefined | null): string {
  if (!raw) return ""
  return raw.trim().slice(0, MAX_PERSONAL_CONTEXT_CHARS)
}

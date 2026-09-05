// Personal Context — free-text background about WHO the user is, kept
// deliberately separate from every other voice signal:
//   voice.niche         — what they post about
//   voice.voiceStyle    — how they sound
//   voice.examples/DNA  — how they write (feeds StyleProfile)
//   voice.customRules   — explicit instructions (Instincts)
//   personalContext     — background knowledge a post might draw on
//
// It lives INSIDE VoiceProfile (see lib/storage.ts) rather than as a new
// top-level AmintaStore field on purpose: `voice` is already the canonical
// account-scoped blob that push/pullFromCloud round-trips through the
// aminta_state.voice_profile jsonb column, so this inherits the existing
// account isolation and sync with no new column, no migration, and no
// second storage path that could drift or leak across accounts.

/** Hard cap. A paragraph or two of background, not a document — this text
 *  is prepended to every generation prompt, so it stays bounded. */
export const MAX_PERSONAL_CONTEXT_CHARS = 2000

/** Trims and enforces the cap. Always run before storing or prompting. */
export function normalizePersonalContext(raw: string | undefined | null): string {
  if (!raw) return ""
  return raw.trim().slice(0, MAX_PERSONAL_CONTEXT_CHARS)
}

/**
 * Appends a speech-to-text chunk to whatever is already in the field.
 * Existing text is never replaced — the transcript joins on the end with a
 * single separating space (or straight after existing trailing whitespace,
 * so a user who left a newline keeps their own paragraph break).
 */
export function appendTranscript(existing: string, chunk: string): string {
  const addition = chunk.trim()
  if (!addition) return existing
  if (!existing) return addition.slice(0, MAX_PERSONAL_CONTEXT_CHARS)
  const joiner = /\s$/.test(existing) ? "" : " "
  return (existing + joiner + addition).slice(0, MAX_PERSONAL_CONTEXT_CHARS)
}

/**
 * The "Help me answer" prompt — plain text the user copies into whichever
 * AI they already use, answers there, then pastes the result back here.
 * Deliberately provider-agnostic (never names one) and deliberately NOT a
 * generation: copying this costs 0 Aminta credits and makes no API call.
 */
export const HELPER_PROMPT = `I'm setting up an AI writing companion that will help me write posts in my own voice.

Help me create a useful profile about myself that I can give to it.

Ask me questions one at a time about:
- who I am
- what I do
- what I'm building or working on
- my interests
- topics I know a lot about
- topics I like posting about
- my opinions and perspectives
- communities or industries I'm part of
- people, products or projects I care about
- my goals
- anything else that would help another AI understand me

Don't assume anything about me.

Once you have enough information, turn my answers into one detailed first-person paragraph that I can paste into another AI as background context.`

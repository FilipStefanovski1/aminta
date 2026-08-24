// Curated "Instincts" library — VoiceProfileForm.tsx's chip UI reads from
// this instead of leaving users to type every writing preference by hand.
//
// Each preset separates what the USER sees (`label`, a short human phrase)
// from what the MODEL receives (`internalPrompt`, a concrete instruction).
// This split only ever happens for presets added through this library —
// see VoiceProfileForm.tsx's addPreset()/addRule() for how a raw, freely
// typed custom instinct (no preset match) is stored and displayed as the
// same literal string, exactly as before this file existed. That's what
// keeps existing users' saved instincts working unchanged: an old saved
// customRules entry is just a string nothing here recognizes, and it's
// rendered and sent to the model exactly as it always was.
export type InstinctCategory =
  | "Formatting"
  | "Length"
  | "Tone"
  | "Engagement"
  | "Writing Style"
  | "Opinion"

export interface InstinctPreset {
  id: string
  label: string
  category: InstinctCategory
  // The literal string stored in VoiceProfile.customRules (joined with
  // other instincts by "\n") and sent to the model — never shown in the UI.
  internalPrompt: string
  popular: boolean
  // IDs of presets this one is directly, deterministically opposed to (e.g.
  // "use lowercase" vs. "use proper capitalization"). Deliberately only set
  // for a handful of genuinely mutually-exclusive pairs — this is not a
  // general compatibility system, just enough to stop a user from having
  // both halves of an obvious contradiction active at once. See
  // VoiceProfileForm.tsx's addInstinct().
  conflictsWith?: string[]
}

export const INSTINCT_CATEGORIES: InstinctCategory[] = [
  "Formatting",
  "Length",
  "Tone",
  "Engagement",
  "Writing Style",
  "Opinion",
]

export const INSTINCT_PRESETS: InstinctPreset[] = [
  // ── Formatting ──────────────────────────────────────────────────────────
  { id: "fmt-lowercase", label: "use lowercase", category: "Formatting", popular: true,
    internalPrompt: "Write entirely in lowercase unless proper nouns require capitalization.",
    conflictsWith: ["fmt-standard-capitalization"] },
  { id: "fmt-standard-capitalization", label: "use proper capitalization", category: "Formatting", popular: false,
    internalPrompt: "Use standard capitalization and sentence case — never write in all lowercase.",
    conflictsWith: ["fmt-lowercase"] },
  { id: "fmt-no-hashtags", label: "no hashtags", category: "Formatting", popular: true,
    internalPrompt: "Never include hashtags." },
  { id: "fmt-no-emojis", label: "no emojis", category: "Formatting", popular: false,
    internalPrompt: "Never include emojis." },
  { id: "fmt-one-sentence-paragraph", label: "one sentence per paragraph", category: "Formatting", popular: true,
    internalPrompt: "Insert a blank line after every sentence." },
  { id: "fmt-short-paragraphs", label: "short paragraphs", category: "Formatting", popular: false,
    internalPrompt: "Keep paragraphs short — no more than two sentences each." },
  { id: "fmt-no-quotes", label: "no quotation marks", category: "Formatting", popular: false,
    internalPrompt: "Never wrap the post, or any part of it, in quotation marks." },
  { id: "fmt-no-bullets", label: "no bullet points", category: "Formatting", popular: false,
    internalPrompt: "Never use bullet points." },
  { id: "fmt-no-numbered-lists", label: "no numbered lists", category: "Formatting", popular: false,
    internalPrompt: "Never use numbered lists." },
  { id: "fmt-minimal-punctuation", label: "minimal punctuation", category: "Formatting", popular: false,
    internalPrompt: "Use minimal punctuation — only what's essential for the sentence to read correctly." },
  { id: "fmt-no-ellipses", label: "no ellipses (...)", category: "Formatting", popular: false,
    internalPrompt: "Never use ellipses (...)." },
  { id: "fmt-no-em-dashes", label: "no em dashes (—)", category: "Formatting", popular: false,
    internalPrompt: "Never use em dashes (—)." },

  // ── Length ──────────────────────────────────────────────────────────────
  { id: "len-concise", label: "keep it concise", category: "Length", popular: true,
    internalPrompt: "Keep the post as concise as possible — cut every word that isn't essential.",
    conflictsWith: ["len-expand"] },
  { id: "len-under-100", label: "under 100 characters", category: "Length", popular: false,
    internalPrompt: "Keep the entire post under 100 characters." },
  { id: "len-under-180", label: "under 180 characters", category: "Length", popular: false,
    internalPrompt: "Keep the entire post under 180 characters." },
  { id: "len-expand", label: "expand the idea", category: "Length", popular: false,
    internalPrompt: "Develop the idea with more depth and detail rather than staying brief.",
    conflictsWith: ["len-concise"] },
  { id: "len-thread-ready", label: "thread-ready", category: "Length", popular: false,
    internalPrompt: "Write with enough substance that it could open a multi-post thread." },

  // ── Tone ────────────────────────────────────────────────────────────────
  { id: "tone-conversational", label: "sound conversational", category: "Tone", popular: true,
    internalPrompt: "Sound conversational, like talking to a friend, not writing a formal statement." },
  { id: "tone-confident", label: "sound confident", category: "Tone", popular: false,
    internalPrompt: "Sound confident and certain — avoid hedging language." },
  { id: "tone-curious", label: "sound curious", category: "Tone", popular: false,
    internalPrompt: "Sound genuinely curious and open, like exploring an idea out loud." },
  { id: "tone-playful", label: "sound playful", category: "Tone", popular: false,
    internalPrompt: "Sound playful and light, not overly serious." },
  { id: "tone-humble", label: "sound humble", category: "Tone", popular: false,
    internalPrompt: "Sound humble — avoid boasting or overselling." },
  { id: "tone-avoid-salesy", label: "avoid sounding salesy", category: "Tone", popular: false,
    internalPrompt: "Avoid sounding salesy or promotional." },
  { id: "tone-avoid-corporate", label: "avoid corporate language", category: "Tone", popular: true,
    internalPrompt: "Avoid corporate language and buzzwords entirely." },
  { id: "tone-simple-words", label: "use simple words", category: "Tone", popular: true,
    internalPrompt: "Use simple, everyday words instead of jargon or complex vocabulary." },

  // ── Engagement ──────────────────────────────────────────────────────────
  { id: "eng-hook", label: "first line should be a hook", category: "Engagement", popular: true,
    internalPrompt: "Make the opening sentence immediately grab attention." },
  { id: "eng-takeaway", label: "end with a takeaway", category: "Engagement", popular: false,
    internalPrompt: "End with a clear, memorable takeaway." },
  { id: "eng-question", label: "end with a question", category: "Engagement", popular: false,
    internalPrompt: "End the post with a genuine question for the reader." },
  { id: "eng-discussion", label: "encourage discussion", category: "Engagement", popular: false,
    internalPrompt: "Frame the post in a way that naturally invites discussion." },
  { id: "eng-make-reply", label: "make people want to reply", category: "Engagement", popular: false,
    internalPrompt: "Write in a way that makes people want to reply, not just like." },
  { id: "eng-curiosity", label: "create curiosity", category: "Engagement", popular: false,
    internalPrompt: "Create curiosity — leave something the reader wants to know more about." },
  { id: "eng-relatable", label: "make it relatable", category: "Engagement", popular: false,
    internalPrompt: "Make the post feel relatable to an everyday experience." },

  // ── Writing Style ───────────────────────────────────────────────────────
  { id: "ws-contractions", label: "use contractions", category: "Writing Style", popular: false,
    internalPrompt: "Use contractions (don't, it's, I'm) instead of formal full forms." },
  { id: "ws-active-voice", label: "active voice", category: "Writing Style", popular: false,
    internalPrompt: "Write in active voice, not passive voice." },
  { id: "ws-vary-sentence-length", label: "vary sentence length", category: "Writing Style", popular: false,
    internalPrompt: "Vary sentence length — mix short and long sentences instead of a uniform rhythm." },
  { id: "ws-avoid-repetition", label: "avoid repetition", category: "Writing Style", popular: false,
    internalPrompt: "Avoid repeating the same words or phrasing within the post." },
  { id: "ws-avoid-filler", label: "avoid filler words", category: "Writing Style", popular: false,
    internalPrompt: "Cut filler words and phrases that don't add meaning." },
  { id: "ws-dont-overexplain", label: "don't overexplain", category: "Writing Style", popular: false,
    internalPrompt: "Don't overexplain — trust the reader to follow without spelling everything out." },

  // ── Opinion ─────────────────────────────────────────────────────────────
  { id: "op-stronger-stance", label: "take a stronger stance", category: "Opinion", popular: false,
    internalPrompt: "Take a clear, stronger stance instead of a balanced or neutral position." },
  { id: "op-stay-neutral", label: "stay neutral", category: "Opinion", popular: false,
    internalPrompt: "Stay neutral and avoid taking a strong side." },
  { id: "op-challenge-advice", label: "challenge common advice", category: "Opinion", popular: false,
    internalPrompt: "Challenge commonly accepted advice on the topic instead of restating it." },
  { id: "op-back-claims", label: "back claims with reasoning", category: "Opinion", popular: false,
    internalPrompt: "Back any claim made with clear reasoning, not just assertion." },
]

export const POPULAR_INSTINCT_PRESETS: InstinctPreset[] = INSTINCT_PRESETS.filter(p => p.popular)

// Keyed by internalPrompt (what's actually stored), not by label — so a
// saved rule that happens to match a preset's instruction resolves back to
// its friendly label for display, while anything unrecognized (all
// pre-existing freeform custom instincts) falls through untouched.
export const PRESET_BY_PROMPT: ReadonlyMap<string, InstinctPreset> = new Map(
  INSTINCT_PRESETS.map(p => [p.internalPrompt, p])
)

// Keyed by lowercased label — lets a typed custom instinct that happens to
// match a preset's label (e.g. typing "no hashtags" instead of clicking it)
// resolve to the same internalPrompt rather than being stored as a second,
// differently-worded duplicate of the same intent.
export const PRESET_BY_LABEL: ReadonlyMap<string, InstinctPreset> = new Map(
  INSTINCT_PRESETS.map(p => [p.label.toLowerCase(), p])
)

export function searchInstinctPresets(query: string): InstinctPreset[] {
  const q = query.trim().toLowerCase()
  if (!q) return INSTINCT_PRESETS
  return INSTINCT_PRESETS.filter(p => p.label.toLowerCase().includes(q))
}

// THE one parse for VoiceProfile.customRules (newline-joined active
// instincts, preset-resolved or freeform — see the file header). Every
// call site that needs the active list — Train's own state init, Home's
// voice-progress count, generation's instinct-count display — reads
// through this instead of re-deriving its own split/trim/filter.
export function parseCustomRules(raw: string | undefined): string[] {
  return (raw ?? "").split("\n").map((s) => s.trim()).filter(Boolean)
}

// Deterministic, metadata-driven only — never an AI call. Finds an
// ALREADY-ACTIVE rule (by its stored internalPrompt) that the given preset
// is declared to conflict with, if any. `preset` is undefined for a
// freeform custom instinct — those carry no conflict metadata and are
// never blocked this way. See VoiceProfileForm.tsx's addInstinct().
export function findConflictingPreset(
  preset: InstinctPreset | undefined,
  activeInternalPrompts: readonly string[]
): InstinctPreset | null {
  if (!preset?.conflictsWith?.length) return null
  for (const id of preset.conflictsWith) {
    const other = INSTINCT_PRESETS.find((p) => p.id === id)
    if (other && activeInternalPrompts.includes(other.internalPrompt)) return other
  }
  return null
}

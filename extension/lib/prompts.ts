import type { ChatMessage } from "~lib/openrouter"
import type { StyleProfile, VoiceProfile } from "~lib/storage"

export type Platform     = "x"
export type Mode         = "tweet" | "reply" | "polish"
export type Tone         = "direct" | "witty" | "analytical" | "inspiring"
export type OutputLength = "short" | "medium" | "long"

const TONE_GUIDE: Record<Tone, string> = {
  direct:     "Be direct and concise. Cut all fluff. Get to the point fast.",
  witty:      "Inject dry wit and subtle humor where it feels natural. Don't force it.",
  analytical: "Be analytical and data-driven. Use reasoning and structured thinking.",
  inspiring:  "Be inspiring. End with energy, conviction, or a strong clear vision.",
}

const LENGTH_GUIDE: Record<OutputLength, string> = {
  short:  "LENGTH PREFERENCE: Write exactly ONE sentence, one tight idea expressed as directly as possible. Cut everything that isn't essential.",
  medium: "LENGTH PREFERENCE: Write exactly TWO short paragraphs (separated by a line break). Make your point clearly and give it room to breathe, but don't pad.",
  long:   "LENGTH PREFERENCE: Write exactly THREE short paragraphs (separated by line breaks). Develop the idea — give context, reasoning, or examples that earn the length. Don't pad for the sake of it.",
}

// Content/style hierarchy: topic comes exclusively from the current
// request; niche/inspiration below may only shape framing when relevant;
// the StyleProfile shapes HOW it's written, never WHAT it's about. Raw
// Voice examples / Tweet DNA are never injected here — see
// lib/styleProfile.ts, which distills them into StyleProfile once and
// caches it. This function only ever sees that distilled, topic-free
// representation.
const TOPIC_SOURCE_RULE =
  "TOPIC SOURCE: The topic, subject matter, and all entities/opinions must come exclusively from the user's request below. Niche and inspiration may only shape framing when relevant to that request — never introduce an unrelated topic, brand, or opinion."

function confidencePrefix(score: number): string {
  if (score >= 0.85) return "Apply these traits closely — this is a well-established pattern."
  if (score >= 0.6)  return "Apply these traits — evidence is reasonably solid."
  if (score > 0)     return "Limited evidence — apply these traits loosely, don't force them."
  return ""
}

function styleProfileBlock(sp: StyleProfile | null): string {
  if (!sp) return ""
  const lines = [
    `- Confidence: ${sp.confidence}`,
    `- Energy: ${sp.energy}`,
    `- Vocabulary: ${sp.vocabularyComplexity}`,
    `- Capitalization: ${sp.capitalization}`,
    `- Directness: ${sp.directness}`,
    sp.rhythm && `- Rhythm: ${sp.rhythm}`,
    sp.punctuation && `- Punctuation: ${sp.punctuation}`,
    sp.emojiUsage && `- Emoji usage: ${sp.emojiUsage}`,
    sp.humorStyle && `- Humor: ${sp.humorStyle}`,
    sp.formattingPreferences && `- Formatting: ${sp.formattingPreferences}`,
    sp.rhetoricalDevices && `- Rhetorical devices: ${sp.rhetoricalDevices}`,
    sp.cadence && `- Cadence: ${sp.cadence}`,
  ].filter(Boolean)

  const prefix = confidencePrefix(sp.confidenceScore)
  const header = "WRITING STYLE (apply these traits ONLY — never introduce topics, names, brands, opinions, or facts):"

  return [header, prefix, ...lines].filter(Boolean).join("\n")
}

// Templates are a third, independent input alongside topic and style — they
// determine STRUCTURE/workflow, never voice. See lib/templates.ts.
function templateBlock(templateInstruction?: string): string {
  if (!templateInstruction?.trim()) return ""
  return `TEMPLATE STRUCTURE (follow this structure/instruction — the Writing Style below still governs tone/voice, this only governs the shape/workflow):\n${templateInstruction.trim()}`
}

function voiceBlock(voice: VoiceProfile, styleProfile: StyleProfile | null, templateInstruction?: string): string {
  const inspiration =
    voice.voiceInspiration && voice.voiceInspiration !== "nobody"
      ? `INSPIRED BY: ${voice.voiceInspiration}`
      : ""

  const context = [`NICHE: ${voice.niche || "general"}`, inspiration].filter(Boolean).join("\n")

  const rules = voice.customRules?.trim()
    ? `CUSTOM RULES:\n${voice.customRules}`
    : ""

  return [
    TOPIC_SOURCE_RULE,
    templateBlock(templateInstruction),
    `CONTEXT (use only if relevant to the current request):\n${context}`,
    `TONE: ${voice.tone || "natural, human"}`,
    styleProfileBlock(styleProfile),
    rules,
  ]
    .filter(Boolean)
    .join("\n")
}

function systemX(voice: VoiceProfile, styleProfile: StyleProfile | null, templateInstruction?: string): string {
  return [
    "You write posts for X (Twitter) as a specific person. Match their voice precisely.",
    voiceBlock(voice, styleProfile, templateInstruction),
    "RULES:",
    "- Keep it under 280 characters unless explicitly asked otherwise.",
    "- Write complete, grammatically correct sentences with normal punctuation (periods, commas) unless the WRITING STYLE section above explicitly says the user's own posts drop punctuation — don't infer that from brevity alone.",
    "- Never run two separate thoughts together with no separator. Each sentence ends before the next begins.",
    "- No hashtags unless their examples use them.",
    "- No emojis unless their examples use them.",
    '- Never say "as an AI". Sound human.',
    "- Return ONLY the post text. No surrounding quotes, no preamble, no explanation.",
  ]
    .filter(Boolean)
    .join("\n")
}

export function buildMessages(
  platform: Platform,
  mode: Mode,
  voice: VoiceProfile,
  input: string,
  styleProfile: StyleProfile | null = null,
  tone: Tone = "direct",
  length: OutputLength = "medium",
  templateInstruction?: string,
  // Reply mode only. When true, the tweet has one or more images attached
  // (sent alongside this call as vision parts — see lib/ai.ts's
  // generateFromImage) and the prompt below is written for that combined
  // input instead of assuming `input` is the whole post.
  hasImages?: boolean
): ChatMessage[] {
  const toneNote = `\nTONE DIRECTION: ${TONE_GUIDE[tone]}\n${LENGTH_GUIDE[length]}`
  const trimmed = input.trim()

  const system = systemX(voice, styleProfile, templateInstruction) + toneNote
  let user = ""
  if (mode === "tweet") {
    user = `Write ONE original X post about this topic:\n"""${trimmed}"""`
  } else if (mode === "reply") {
    user = hasImages
      ? `Someone posted this on X. Their post includes one or more images attached below, alongside this caption:\n"""${trimmed || "(no caption text)"}"""\nLook at the images first — they may carry more of the actual meaning than the caption does (a meme, a screenshot, a chart, a location, a visual joke, a flex post). Understand what the image(s) and caption say TOGETHER, then write ONE short, engaging reply in my voice that reacts to that combined meaning — agree, push back, riff on it, or add something specific. Do not just describe what's in the image. Return only the reply text.`
      : `Someone posted this on X:\n"""${trimmed}"""\nWrite ONE short, engaging reply in my voice. Pick ONE specific detail, number, or claim from their post and react to it directly — agree, push back, add a fact, or riff on it with wit. Do not write a generic compliment that just restates their post back to them.`
  } else {
    user = `Here is my rough draft for an X post:\n"""${trimmed}"""\nRewrite it to be cleaner, punchier and more readable. PRESERVE my meaning and voice. Do not add new ideas.`
  }
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

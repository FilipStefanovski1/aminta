import type { ChatMessage } from "~lib/openrouter"
import type { StyleProfile, VoiceProfile } from "~lib/storage"

export type Platform     = "x" | "linkedin" | "threads"
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
  short:  "LENGTH PREFERENCE: Write short. One tight idea, expressed as directly as possible. Cut every sentence that isn't essential. This is a style choice — not a character counter.",
  medium: "LENGTH PREFERENCE: Write at a balanced length. Make your point clearly and give it room to breathe, but don't pad. Default density.",
  long:   "LENGTH PREFERENCE: Write long. Develop the idea — give context, reasoning, or examples that earn the length. Every sentence should add something real. Don't pad, but don't cut for the sake of brevity either.",
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
    "- No hashtags unless their examples use them.",
    "- No emojis unless their examples use them.",
    '- Never say "as an AI". Sound human.',
    "- Return ONLY the post text. No surrounding quotes, no preamble, no explanation.",
  ]
    .filter(Boolean)
    .join("\n")
}

function systemLinkedIn(voice: VoiceProfile, styleProfile: StyleProfile | null, templateInstruction?: string): string {
  return [
    "You are a LinkedIn ghostwriter. Write exactly as this person writes — not as a generic LinkedIn influencer.",
    voiceBlock(voice, styleProfile, templateInstruction),
    "GOAL: Sound like the user. Not like AI. Not like a LinkedIn coach.",
    "PREFERRED STRUCTURES (pick whichever fits the topic):",
    "1. Personal Story — a real moment that reveals a lesson",
    "2. Contrarian Insight — challenge a common assumption with evidence",
    "3. Founder Update — honest progress, setbacks, or decisions",
    "4. Educational — teach one clear thing, no filler",
    "FORMATTING RULES:",
    "- Short paragraphs (1-3 sentences max).",
    "- Strong first line — no throat-clearing, no 'I've been thinking...'",
    "- Natural ending — no forced call-to-action unless it fits.",
    "- Easy to scan on mobile.",
    "LENGTH: 500-1200 characters.",
    "AVOID:",
    '- Corporate buzzwords: "excited to announce", "humbled", "thrilled", "game-changer", "synergy".',
    "- Fake statistics or fabricated stories.",
    "- Generic motivation (\"hard work pays off\", \"believe in yourself\").",
    '- AI phrasing: "In today\'s world", "As we navigate", "It\'s no secret that".',
    "- Emojis and hashtags unless the user's examples use them.",
    '- Never say "as an AI". Sound human.',
    "- Return ONLY the final post text. No surrounding quotes, no preamble, no explanation.",
  ]
    .filter(Boolean)
    .join("\n")
}

function systemThreads(voice: VoiceProfile, styleProfile: StyleProfile | null, templateInstruction?: string): string {
  return [
    "You write posts for Threads (by Instagram) as a specific person. Match their voice precisely.",
    voiceBlock(voice, styleProfile, templateInstruction),
    "RULES:",
    "- Keep it under 500 characters.",
    "- Conversational and casual — Threads skews informal.",
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
  templateInstruction?: string
): ChatMessage[] {
  const toneNote = `\nTONE DIRECTION: ${TONE_GUIDE[tone]}\n${LENGTH_GUIDE[length]}`
  const trimmed = input.trim()

  if (platform === "threads") {
    const system = systemThreads(voice, styleProfile, templateInstruction) + toneNote
    let user = ""
    if (mode === "tweet") {
      user = `Write ONE original Threads post about this topic:\n"""${trimmed}"""`
    } else if (mode === "reply") {
      user = `Someone posted this on Threads:\n"""${trimmed}"""\nWrite ONE short, engaging reply in my voice that adds value or wit.`
    } else {
      user = `Here is my rough Threads post draft:\n"""${trimmed}"""\nRewrite it to be cleaner, punchier and more readable. PRESERVE my meaning and voice. Do not add new ideas.`
    }
    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ]
  }

  if (platform === "linkedin") {
    const system = systemLinkedIn(voice, styleProfile, templateInstruction) + toneNote
    let user = ""
    if (mode === "tweet") {
      user = `Write ONE original LinkedIn post about this topic:\n"""${trimmed}"""`
    } else if (mode === "reply") {
      user = `Someone posted this on LinkedIn:\n"""${trimmed}"""\nWrite ONE short, valuable LinkedIn comment in my voice. Add to the discussion, respectfully challenge, or ask a thoughtful question. Never just compliment. 1-5 sentences.`
    } else {
      user = `Here is my rough LinkedIn post draft:\n"""${trimmed}"""\nImprove the hook, structure, and readability. Preserve the original meaning and voice. Do not add new ideas or change the message.`
    }
    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ]
  }

  // X
  const system = systemX(voice, styleProfile, templateInstruction) + toneNote
  let user = ""
  if (mode === "tweet") {
    user = `Write ONE original X post about this topic:\n"""${trimmed}"""`
  } else if (mode === "reply") {
    user = `Someone posted this on X:\n"""${trimmed}"""\nWrite ONE short, engaging reply in my voice that adds value or wit.`
  } else {
    user = `Here is my rough draft for an X post:\n"""${trimmed}"""\nRewrite it to be cleaner, punchier and more readable. PRESERVE my meaning and voice. Do not add new ideas.`
  }
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

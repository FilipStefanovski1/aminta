import type { ChatMessage } from "~lib/openrouter"
import type { VoiceProfile } from "~lib/storage"

export type Platform = "x" | "linkedin" | "threads"
export type Mode     = "tweet" | "reply" | "polish"
export type Tone     = "direct" | "witty" | "analytical" | "inspiring"

const TONE_GUIDE: Record<Tone, string> = {
  direct:     "Be direct and concise. Cut all fluff. Get to the point fast.",
  witty:      "Inject dry wit and subtle humor where it feels natural. Don't force it.",
  analytical: "Be analytical and data-driven. Use reasoning and structured thinking.",
  inspiring:  "Be inspiring. End with energy, conviction, or a strong clear vision.",
}

function parseExamples(raw: string): string[] {
  if (!raw) return []
  if (raw.trim().startsWith("[")) {
    try { return JSON.parse(raw) as string[] } catch {}
  }
  return raw.split("\n").map((s) => s.trim()).filter(Boolean)
}

function voiceBlock(voice: VoiceProfile, tweetDNA: string[]): string {
  const examples = parseExamples(voice.examples)
    .map((l) => `- ${l}`)
    .join("\n")

  const dnaBlock =
    tweetDNA.length > 0
      ? `STYLE DNA (additional writing samples — match rhythm, length and energy, never copy verbatim):\n${tweetDNA.map((t) => `- ${t}`).join("\n")}`
      : ""

  const inspiration =
    voice.voiceInspiration && voice.voiceInspiration !== "nobody"
      ? `INSPIRED BY: ${voice.voiceInspiration}`
      : ""

  const rules = voice.customRules?.trim()
    ? `CUSTOM RULES:\n${voice.customRules}`
    : ""

  return [
    `NICHE: ${voice.niche || "general"}`,
    `TONE: ${voice.tone || "natural, human"}`,
    examples
      ? `THEIR EXAMPLE POSTS (mimic rhythm, length and energy — never copy verbatim):\n${examples}`
      : "",
    dnaBlock,
    inspiration,
    rules,
  ]
    .filter(Boolean)
    .join("\n")
}

function systemX(voice: VoiceProfile, tweetDNA: string[]): string {
  return [
    "You write posts for X (Twitter) as a specific person. Match their voice precisely.",
    voiceBlock(voice, tweetDNA),
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

function systemLinkedIn(voice: VoiceProfile, tweetDNA: string[]): string {
  return [
    "You are a LinkedIn ghostwriter. Write exactly as this person writes — not as a generic LinkedIn influencer.",
    voiceBlock(voice, tweetDNA),
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

function systemThreads(voice: VoiceProfile, tweetDNA: string[]): string {
  return [
    "You write posts for Threads (by Instagram) as a specific person. Match their voice precisely.",
    voiceBlock(voice, tweetDNA),
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
  tweetDNA: string[] = [],
  tone: Tone = "direct"
): ChatMessage[] {
  const toneNote = `\nTONE DIRECTION: ${TONE_GUIDE[tone]}`
  const trimmed = input.trim()

  if (platform === "threads") {
    const system = systemThreads(voice, tweetDNA) + toneNote
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
    const system = systemLinkedIn(voice, tweetDNA) + toneNote
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
  const system = systemX(voice, tweetDNA) + toneNote
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

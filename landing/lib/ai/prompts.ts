// SOURCE OF TRUTH: extension/lib/prompts.ts (buildMessages) and
// extension/lib/styleProfile.ts (buildExtractionMessages).
//
// This is an intentional duplicate for app/api/generate/route.ts — no shared
// package exists between extension/ and landing/ (two independently deployed
// apps, no monorepo tooling), matching the same convention already used by
// lib/entitlements.ts. If you change prompt logic in either extension source
// file, you MUST update this file identically. Diff them before shipping.
//
// Only the prompt-building logic is ported — parsing/sanitizing a style
// profile extraction's raw JSON output stays entirely client-side
// (extension/lib/styleProfile.ts's parseStyleProfile), since that's pure,
// has no security implications, and doesn't need to be duplicated here. This
// file only ever returns a ChatMessage[] for the provider call.

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }

export type ChatMessage = {
  role: "system" | "user"
  content: string | ContentPart[]
}

// Injects one or more images into the last user message as vision parts,
// all images first then the caption text — mirrors
// extension/lib/ai.ts's generateFromImage() exactly.
export function withImages(messages: ChatMessage[], imageDataUrls: string[]): ChatMessage[] {
  if (imageDataUrls.length === 0) return messages
  return messages.map((m, i) => {
    if (m.role === "user" && i === messages.length - 1) {
      const text = typeof m.content === "string" ? m.content : ""
      return {
        ...m,
        content: [
          ...imageDataUrls.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "low" as const } })),
          { type: "text" as const, text },
        ],
      }
    }
    return m
  })
}

export type Mode = "tweet" | "reply" | "polish"
export type Tone = "direct" | "witty" | "analytical" | "inspiring"
export type OutputLength = "short" | "medium" | "long"

export interface VoiceProfile {
  niche: string
  tone: string
  examples: string
  voiceStyle: string
  voiceInspiration: string
  customRules: string
}

export type Confidence = "hedging" | "balanced" | "assertive" | "declarative"
export type Energy = "low" | "moderate" | "high" | "intense"
export type VocabComplexity = "simple" | "casual" | "moderate" | "sophisticated"
export type Capitalization = "lowercase-leaning" | "standard" | "emphatic-caps"
export type Directness = "indirect" | "balanced" | "direct" | "blunt"

export interface StyleProfile {
  confidence: Confidence
  energy: Energy
  vocabularyComplexity: VocabComplexity
  capitalization: Capitalization
  directness: Directness
  rhythm: string
  punctuation: string
  emojiUsage: string
  humorStyle: string
  formattingPreferences: string
  rhetoricalDevices: string
  cadence: string
  confidenceScore: number
}

const TONE_GUIDE: Record<Tone, string> = {
  direct: "Be direct and concise. Cut all fluff. Get to the point fast.",
  witty: "Inject dry wit and subtle humor where it feels natural. Don't force it.",
  analytical: "Be analytical and data-driven. Use reasoning and structured thinking.",
  inspiring: "Be inspiring. End with energy, conviction, or a strong clear vision.",
}

const LENGTH_GUIDE: Record<OutputLength, string> = {
  short: "LENGTH PREFERENCE: Write exactly ONE sentence, one tight idea expressed as directly as possible. Cut everything that isn't essential.",
  medium: "LENGTH PREFERENCE: Write exactly TWO short paragraphs (separated by a line break). Make your point clearly and give it room to breathe, but don't pad.",
  long: "LENGTH PREFERENCE: Write exactly THREE short paragraphs (separated by line breaks). Develop the idea — give context, reasoning, or examples that earn the length. Don't pad for the sake of it.",
}

const TOPIC_SOURCE_RULE =
  "TOPIC SOURCE: The topic, subject matter, and all entities/opinions must come exclusively from the user's request below. Niche and inspiration may only shape framing when relevant to that request — never introduce an unrelated topic, brand, or opinion."

function confidencePrefix(score: number): string {
  if (score >= 0.85) return "Apply these traits closely — this is a well-established pattern."
  if (score >= 0.6) return "Apply these traits — evidence is reasonably solid."
  if (score > 0) return "Limited evidence — apply these traits loosely, don't force them."
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

  const rules = voice.customRules?.trim() ? `CUSTOM RULES:\n${voice.customRules}` : ""

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
  mode: Mode,
  voice: VoiceProfile,
  input: string,
  styleProfile: StyleProfile | null = null,
  tone: Tone = "direct",
  length: OutputLength = "medium",
  templateInstruction?: string,
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

// ─── Style profile extraction — ported from extension/lib/styleProfile.ts's
// buildExtractionMessages(). Only the prompt-building; parsing the model's
// JSON output stays client-side (see file header comment).

const CONFIDENCE_VALUES: Confidence[] = ["hedging", "balanced", "assertive", "declarative"]
const ENERGY_VALUES: Energy[] = ["low", "moderate", "high", "intense"]
const VOCAB_VALUES: VocabComplexity[] = ["simple", "casual", "moderate", "sophisticated"]
const CAPITALIZATION_VALUES: Capitalization[] = ["lowercase-leaning", "standard", "emphatic-caps"]
const DIRECTNESS_VALUES: Directness[] = ["indirect", "balanced", "direct", "blunt"]

export interface StyleCorpusEntry {
  text: string
  source: "example" | "tweet_dna" | "approved_edit"
}

export function buildStyleProfileMessages(corpus: StyleCorpusEntry[]): ChatMessage[] {
  const samples = corpus.map((e) => `- ${e.text}`).join("\n")

  const system = [
    "You are a writing-STYLE analyst. You analyze ONLY the structural and stylistic patterns in the writing samples below — never what they say.",
    "",
    "You must NEVER extract, mention, restate, paraphrase, or allude to: topics, industries, brands, companies, products, technologies, named people, opinions, facts, or recurring themes from the samples. Only describe HOW the person writes, never WHAT they write about.",
    "",
    `Return ONLY a JSON object with exactly these keys:`,
    `- confidence: one of ${JSON.stringify(CONFIDENCE_VALUES)}`,
    `- energy: one of ${JSON.stringify(ENERGY_VALUES)}`,
    `- vocabularyComplexity: one of ${JSON.stringify(VOCAB_VALUES)}`,
    `- capitalization: one of ${JSON.stringify(CAPITALIZATION_VALUES)}`,
    `- directness: one of ${JSON.stringify(DIRECTNESS_VALUES)}`,
    `- rhythm: short phrase, sentence-length/pacing pattern only (e.g. "short, punchy, frequent fragments")`,
    `- punctuation: short phrase, punctuation habits only (e.g. "dashes over commas, no semicolons")`,
    `- emojiUsage: short phrase (e.g. "none" or "sparing, 1 per post")`,
    `- humorStyle: short phrase, the FORM of humor only, never its subject (e.g. "dry, deadpan" — NOT "dry humor about X")`,
    `- formattingPreferences: short phrase (e.g. "single-line, no line breaks")`,
    `- rhetoricalDevices: short phrase (e.g. "rhetorical questions, contrast pairs")`,
    `- cadence: short phrase, rhythm/flow only (e.g. "builds to a short punchline")`,
    "",
    "Every free-text value must be a SHORT phrase (under 8 words) describing a structural/stylistic trait only — it must never contain a topic, name, brand, or opinion. If you cannot describe a dimension without referencing content, leave it as an empty string.",
    "Return raw JSON only — no markdown code fences, no explanation.",
  ].join("\n")

  const user = `WRITING SAMPLES:\n${samples}`

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

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

// Mode-aware length targets, expressed as approximate character ranges
// rather than a fixed paragraph count. A reply is a conversational
// fragment, not a mini-essay — its "long" is still shorter than a
// standalone post's "medium". Ranges are guidance, not a template: the
// model picks whatever shape (one line, a couple of short lines, one
// paragraph) actually fits the content, instead of being forced into an
// exact structure regardless of what the idea needs.
//
// SOURCE OF TRUTH: extension/lib/prompts.ts's LENGTH_GUIDE — this also
// resolves the same real conflict the old prompt had there: the RULES
// block said "keep it under 280 characters" while "long" separately
// demanded three full paragraphs, which routinely blows past 280. Length
// now lives in one place and the 280-character X ceiling is folded
// directly into short/medium's own ranges instead of a separate,
// contradicting rule.
const LENGTH_GUIDE: Record<Mode, Record<OutputLength, string>> = {
  tweet: {
    short:  "LENGTH TARGET: roughly 40-100 characters. One tight, complete thought. A single short line is fine — don't stretch it into more sentences than it needs.",
    medium: "LENGTH TARGET: roughly 150-260 characters (X's classic single-post ceiling). Give the idea room to breathe — one solid paragraph, or a couple of naturally separated short lines, whichever actually fits the content. Don't pad to fill space.",
    long:   "LENGTH TARGET: roughly 350-700 characters — deliberately past the classic 280-character post. Develop the idea with real substance: context, reasoning, a concrete example, a turn in the thought. Only break it into separate lines or short paragraphs where a real pause belongs, not on a fixed schedule.",
  },
  reply: {
    short:  "LENGTH TARGET: one short sentence, well under 100 characters. Sharp and specific.",
    medium: "LENGTH TARGET: 1-2 sentences, under roughly 180 characters. A real reply, not a paragraph — X replies read as conversation, not essays.",
    long:   "LENGTH TARGET: up to about 3 short sentences, under roughly 320 characters. Still a reply, not a standalone post — stay conversational, don't lecture.",
  },
  polish: {
    short:  "LENGTH: only shrink the draft if that's clearly what's being asked for. Otherwise keep its approximate length as-is — polish is about quality, not length.",
    medium: "LENGTH: keep the draft's approximate length as-is. Polish is about quality, not length.",
    long:   "LENGTH: only expand the draft if that's clearly what's being asked for. Otherwise keep its approximate length as-is — polish is about quality, not length.",
  },
}

// Explicit, ordered priority for what wins when inputs pull in different
// directions. Everything below WRITING STYLE only ever shapes HOW
// something is written; it can never introduce a new topic, override the
// source post, or outrank an attached image's actual content. This is the
// single place that hierarchy lives — call sites don't need to repeat it.
//
// SOURCE OF TRUTH: extension/lib/prompts.ts's CONTEXT_PRIORITY.
const CONTEXT_PRIORITY =
  "CONTEXT PRIORITY (highest to lowest): the topic/request below, then the source post if replying, then an attached image if present, then WRITING STYLE, then tone. WRITING STYLE is a pattern to follow, never a script to copy line-for-line, and it never changes WHAT gets said — only HOW."

// Distinct premises/angles a tweet can take on the same topic — sampled
// externally (Math.random, see pickAngles below) rather than left to the
// model's own judgment. Asking the model to "just pick a different angle
// each time" doesn't work: with no history and a stateless prompt, its
// internal choice collapses onto the same statistically safest angle every
// call, so the randomness has to come from outside the model.
//
// SOURCE OF TRUTH: extension/lib/prompts.ts's TWEET_ANGLES/pickAngles.
const TWEET_ANGLES = [
  "personal experience", "hot take", "unpopular opinion", "observation",
  "prediction", "analogy", "founder lesson", "technical insight", "humor",
  "storytelling", "question", "contrarian viewpoint", "productivity angle",
  "marketing angle", "business angle", "psychology", "culture", "future trend",
] as const

function pickAngles(): string[] {
  const pool = [...TWEET_ANGLES]
  const picked: string[] = []
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

// Lightweight, mode-specific internal planning. Concrete judgment
// questions, not "think step by step" — the model works through these
// silently and only ever outputs the finished text. This is what lets
// RULES below stay short: a judgment call (does a hook help here, is
// agreement the honest reaction) generalizes better than a long list of
// explicit dos and don'ts trying to cover every case in advance.
//
// SOURCE OF TRUTH: extension/lib/prompts.ts's PLANNING/tweetPlanning.
function tweetPlanning(angles: string[]): string {
  return `THINK FIRST, SILENTLY (never write this part down): this post must commit to ONE distinct angle — choose whichever of these fits the topic best and commit to it fully: ${angles.join(", ")}. Don't hedge across angles and don't default to the safe, balanced middle-ground take — pick the one lens that fits and follow it all the way through. What's the one real point, seen through that angle? If a hook would genuinely help it land, use one — if it would just delay the point, skip it. Pick whatever shape actually fits (one line, a few natural sentences, a short paragraph) instead of forcing structure the idea doesn't need. Cut anything that isn't earning its place. Let the ending land on its own instead of reaching for a closer.`
}

const PLANNING: Record<Exclude<Mode, "tweet">, string> = {
  reply:
    "THINK FIRST, SILENTLY (never write this part down): what is this person actually saying, and what's the most interesting part of it? Is agreement genuinely the honest reaction, or is there a sharper angle — something missing, something to push back on, an implication they haven't drawn out? Only ask a question if it would genuinely move the conversation forward. If the original already says everything clearly, a short, real reaction beats a forced insight.",
  polish:
    "THINK FIRST, SILENTLY (never write this part down): what is the author actually trying to say? Which parts are genuinely awkward versus just this person's intentional style? Fix the former, leave the latter untouched.",
}

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
  const header = "WRITING STYLE (apply these as tendencies, not an exaggerated impression — recognizable, not a caricature; never introduce topics, names, brands, opinions, or facts):"

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
    CONTEXT_PRIORITY,
    templateBlock(templateInstruction),
    `CONTEXT (use only if relevant to the current request):\n${context}`,
    `TONE: ${voice.tone || "natural, human"}`,
    styleProfileBlock(styleProfile),
    rules,
  ]
    .filter(Boolean)
    .join("\n")
}

function systemX(mode: Mode, voice: VoiceProfile, styleProfile: StyleProfile | null, templateInstruction?: string): string {
  const planning = mode === "tweet" ? tweetPlanning(pickAngles()) : PLANNING[mode]
  return [
    "You write posts for X (Twitter) as a specific person. Match their voice precisely.",
    voiceBlock(voice, styleProfile, templateInstruction),
    planning,
    "RULES:",
    "- Write like a real person posting on X, not marketing copy — no corporate tone, no forced enthusiasm, no hedge-everything disclaimers.",
    "- Avoid worn-out openers (\"hot take\", \"unpopular opinion\", \"here's the thing\", \"let that sink in\", \"this changes everything\") and worn-out closers (\"thoughts?\", \"agree?\", generic motivational lines) — use them only if they'd genuinely fit, which is rare.",
    "- Write complete, grammatically correct sentences with normal punctuation — never run two separate thoughts together with no separator — unless WRITING STYLE explicitly says the user's own posts drop punctuation; don't infer that from brevity alone.",
    "- Don't default to em dashes — only if WRITING STYLE's punctuation notes show the user's own writing actually uses them.",
    "- No hashtags or emojis unless their examples use them.",
    '- Never say "as an AI". Sound human.',
    "- Return ONLY the finished text — never your thinking, notes, or process. No surrounding quotes, no labels like \"Tweet:\" or \"Reply:\" or \"Here's a polished version:\", no preamble, no explanation.",
  ]
    .filter(Boolean)
    .join("\n")
}

// Deliberately the LAST thing the model reads before generating — see
// extension/lib/prompts.ts's identical constant for the full rationale
// (SOURCE OF TRUTH there).
const FINAL_OUTPUT_INSTRUCTION =
  "\n\nFINAL INSTRUCTION — this overrides everything above if there's ever a conflict: return only the finished post. Do not return writing instructions, tone descriptions, analysis, labels, quotation marks, markdown, or commentary."

// ─── Thread Creator — SOURCE OF TRUTH: extension/lib/prompts.ts's
// buildThreadMessages/parseThreadResponse (identical duplicate, same
// convention as the rest of this file). ONE model call requests all 3
// variants in one JSON response, so Thread Creator is one credit
// reservation, never three.
export interface ThreadOption {
  angle: string
  posts: string[]
}

export function buildThreadMessages(
  voice: VoiceProfile,
  input: string,
  styleProfile: StyleProfile | null,
  tone: Tone = "direct"
): ChatMessage[] {
  const system = [
    "You write X (Twitter) threads for a specific person. Match their voice precisely.",
    voiceBlock(voice, styleProfile),
    `TONE DIRECTION: ${TONE_GUIDE[tone]}`,
    "THINK FIRST, SILENTLY (never write this part down): this topic can be approached from genuinely different angles — pick 3 that are ACTUALLY different premises (e.g. a personal story, a contrarian take, a step-by-step breakdown), not 3 rewrites of the same point. Each thread must stand on its own: a different opening idea, different supporting posts, a different close. Never reuse the same hook, transition phrase, or closing line across the 3 threads.",
    "RULES FOR EVERY THREAD:",
    "- The FIRST post must work as a strong standalone X hook — someone scrolling past should want to open the thread from that post alone.",
    "- Choose a sensible number of posts for the idea (roughly 3-7) — never pad to hit a count, never cram everything into 2 posts if the idea needs more room.",
    "- Each post should be a complete thought that also flows into the next — not a sentence chopped mid-idea.",
    "- Avoid a generic AI-sounding conclusion (\"In summary...\", \"The bottom line is...\", forced calls to action) unless it's genuinely earned.",
    "- Write like a real person, not marketing copy. No hashtags or emojis unless their examples use them.",
    "- Each individual post should read naturally as a single X post (roughly under 280 characters where possible; a little over is fine if the idea needs it, never pad to fill space).",
    "",
    "Return ONLY a JSON object: { \"threads\": [ { \"angle\": \"short label for this thread's angle\", \"posts\": [\"post 1\", \"post 2\", ...] }, ... 3 items total ] }",
    "No markdown fences, no explanation, no text outside the JSON object.",
  ].filter(Boolean).join("\n")

  const user = `Write a thread about this topic:\n"""${input.trim()}"""`

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
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
  const toneNote = `\nTONE DIRECTION: ${TONE_GUIDE[tone]}\n${LENGTH_GUIDE[mode][length]}`
  const trimmed = input.trim()

  const system = systemX(mode, voice, styleProfile, templateInstruction) + toneNote + FINAL_OUTPUT_INSTRUCTION
  let user = ""
  if (mode === "tweet") {
    user = `Write ONE original X post about this topic:\n"""${trimmed}"""`
  } else if (mode === "reply") {
    user = hasImages
      ? `Someone posted this on X, with one or more images attached below and this caption:\n"""${trimmed || "(no caption text)"}"""\nLook at the images and caption together — the image may carry more of the meaning than the caption does (a meme, a chart, a screenshot, a flex post). Write ONE reply in my voice that responds to the combined meaning. If the image adds nothing beyond the caption, just reply to the caption instead of forcing a visual observation. Never invent specific text, people, brands, numbers, or events you can't actually make out. Return only the reply text.`
      : `Someone posted this on X:\n"""${trimmed}"""\nWrite ONE reply in my voice — respond to something specific in their post, not the post as a whole, not a generic reaction to it. Return only the reply text.`
  } else {
    user = `Here is my rough draft for an X post:\n"""${trimmed}"""\nFix grammar, punctuation, awkward phrasing, and spacing. Leave anything that's clearly intentional style alone. PRESERVE my meaning, personality, formality, and language exactly — no new ideas, claims, or facts, and don't let it drift into corporate or LinkedIn tone.`
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
  source: "example" | "tweet_dna" | "approved_edit" | "x_history"
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

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

// Mode-aware length targets, expressed as approximate character ranges
// rather than a fixed paragraph count. A reply is a conversational
// fragment, not a mini-essay — its "long" is still shorter than a
// standalone post's "medium". Ranges are guidance, not a template: the
// model picks whatever shape (one line, a couple of short lines, one
// paragraph) actually fits the content, instead of being forced into an
// exact structure regardless of what the idea needs.
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
const CONTEXT_PRIORITY =
  "CONTEXT PRIORITY (highest to lowest): the topic/request below, then the source post if replying, then an attached image if present, then WRITING STYLE, then tone. WRITING STYLE is a pattern to follow, never a script to copy line-for-line, and it never changes WHAT gets said — only HOW."

// Distinct premises/angles a tweet can take on the same topic — sampled
// externally (Math.random, see pickAngles below) rather than left to the
// model's own judgment. Asking the model to "just pick a different angle
// each time" doesn't work: with no history and a stateless prompt, its
// internal choice collapses onto the same statistically safest angle every
// call (that's the bug this fixes), so the randomness has to come from
// outside the model, before generation starts.
const TWEET_ANGLES = [
  "personal experience", "hot take", "unpopular opinion", "observation",
  "prediction", "analogy", "founder lesson", "technical insight", "humor",
  "storytelling", "question", "contrarian viewpoint", "productivity angle",
  "marketing angle", "business angle", "psychology", "culture", "future trend",
] as const

// Draws 3 distinct angles at random. A shortlist, not a single forced
// angle, so the model still exercises judgment on which one actually fits
// the topic (avoids incoherent posts) — but the *candidates* are externally
// randomized, so which region of idea-space gets explored no longer depends
// on the model's own (collapsing) internal choice.
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
// tweetPlanning() takes the randomly-drawn angle shortlist as a parameter
// (rather than PLANNING.tweet being a static string like the other modes)
// specifically so a fresh set is drawn per buildMessages() call — see
// TWEET_ANGLES/pickAngles above for why the randomness must be external.
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
  const header = "WRITING STYLE (apply these as tendencies, not an exaggerated impression — recognizable, not a caricature; never introduce topics, names, brands, opinions, or facts):"

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
  const toneNote = `\nTONE DIRECTION: ${TONE_GUIDE[tone]}\n${LENGTH_GUIDE[mode][length]}`
  const trimmed = input.trim()

  const system = systemX(mode, voice, styleProfile, templateInstruction) + toneNote
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

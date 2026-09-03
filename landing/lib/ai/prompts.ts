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

import { classifyDraftIntent, preservationLevelFor, type PreservationLevel } from "./draftIntent"
import type { EntityContext } from "./contextEnrichment"
import { describeViolation, type FidelityViolation } from "./claimFidelity"

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
// Thread Creator only — how many posts, independent from OutputLength
// (which controls per-post depth, not post count). SOURCE OF TRUTH:
// extension/lib/prompts.ts's identical type.
export type ThreadPostCount = 2 | 3 | 4 | 5 | "6+"

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
  // SOURCE OF TRUTH: extension/lib/storage.ts's StyleProfile.
  hashtagUsage: string
  humorStyle: string
  formattingPreferences: string
  rhetoricalDevices: string
  cadence: string
  confidenceScore: number
  // SOURCE OF TRUTH: extension/lib/storage.ts's StyleProfile — was missing
  // here entirely, which meant Included AI generation (this file) silently
  // never received the user's personalized posting length at all: the
  // client sends the full profile including this field over the wire, but
  // without it in this type/resolveLengthGuide below, Medium/Short/Long
  // always fell back to the generic fixed LENGTH_GUIDE range for every
  // Included AI user, regardless of how long their own posts actually are.
  lengthProfile?: { p25: number; median: number; p75: number } | null
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

// Personalizes Short/Medium/Long against the user's own learned posting
// length instead of one fixed range for everyone.
//
// SOURCE OF TRUTH: extension/lib/prompts.ts's identical resolveLengthGuide —
// this was missing here entirely (this file always used the flat
// LENGTH_GUIDE above regardless of styleProfile.lengthProfile), which was
// the primary reason Included AI generation (Free/Pro without BYOK) ignored
// personalized length altogether. Tweet mode only: replies/polish already
// scale off the source post/draft itself. Falls back to the fixed
// LENGTH_GUIDE when there's no baseline yet (never refreshed, or too few
// posts) — generation must never break either way.
export function resolveLengthGuide(mode: Mode, length: OutputLength, styleProfile: StyleProfile | null): string {
  const lp = mode === "tweet" ? styleProfile?.lengthProfile : null
  if (!lp) return LENGTH_GUIDE[mode][length]

  const { p25, median, p75 } = lp
  if (length === "short") {
    const lo = Math.max(20, Math.round(p25 * 0.55))
    const hi = Math.max(lo + 15, p25)
    return `LENGTH TARGET: roughly ${lo}-${hi} characters — noticeably shorter than this person's normal post (their usual range centers around ${median} characters). One tight, complete thought.`
  }
  if (length === "long") {
    const lo = Math.max(p75, median + 20)
    const hi = Math.max(lo + 100, Math.round(p75 * 1.6))
    return `LENGTH TARGET: roughly ${lo}-${hi} characters — longer and more developed than this person's normal post (their usual range centers around ${median} characters). Real substance, not padding.`
  }
  const lo = Math.min(p25, median - 10)
  const hi = Math.max(p75, median + 10)
  return `LENGTH TARGET: roughly ${lo}-${hi} characters — this is close to how this person normally writes (their usual length centers around ${median} characters). Don't force it longer or shorter than the idea needs.`
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

// SOURCE OF TRUTH: extension/lib/prompts.ts's STYLE_PRIORITY.
const STYLE_PRIORITY =
  "STYLE PRIORITY (highest to lowest): CUSTOM RULES (explicit instructions from the user) > WRITING STYLE (patterns learned from real writing) > TONE DIRECTION > generic default phrasing. If CUSTOM RULES ever conflicts with a pattern in WRITING STYLE or with TONE DIRECTION, CUSTOM RULES wins — e.g. a learned pattern showing past hashtag use never overrides an explicit 'no hashtags' rule."

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

// SOURCE OF TRUTH: extension/lib/prompts.ts's identical constants — see
// there for the full rationale (model's own pretraining bias toward
// compressed lowercase "AI-caption" X style, active regardless of profile
// confidence, and tone being wrongly read as license to drop punctuation).
const DEFAULT_FORM_BASELINE =
  "DEFAULT — unless a field below clearly says otherwise: write real sentences with normal commas, periods, capitalization, and natural spacing between thoughts, the way an actual person writes. Never default to a compressed lowercase AI-caption style (no punctuation, one fragment per line) just because this is X — that is not how most people actually write, and it is a formatting habit to avoid, not a target."

const TONE_VS_FORM_INDEPENDENCE =
  "Tone changes attitude and word choice ONLY — it never overrides the punctuation, capitalization, or line-break instructions above. A direct tone still uses this person's normal commas and full sentences; it does not mean fragments or no punctuation. Witty does not mean fragment-only. Analytical does not mean generic structured AI prose."

function structuralConstraints(sp: StyleProfile): string {
  const punctuation = sp.punctuation
    ? `PUNCTUATION: Match exactly how this person uses commas, periods, dashes, and apostrophes — ${sp.punctuation}.`
    : ""
  const lineBreaks = sp.formattingPreferences
    ? `LINE BREAKS & SPACING: Match how this person separates sentences and thoughts, and how they break lines or paragraphs — ${sp.formattingPreferences}.`
    : ""
  const cadenceSource = [sp.cadence, sp.rhythm].filter(Boolean).join("; ")
  const cadence = cadenceSource
    ? `CADENCE: Match this person's sentence lengths and transitions — ${cadenceSource}.`
    : ""
  return [punctuation, lineBreaks, cadence].filter(Boolean).join("\n")
}

function styleProfileBlock(sp: StyleProfile | null): string {
  const header = "WRITING STYLE (hard constraints on HOW to write, not decoration — apply as tendencies, recognizable not a caricature; never introduce topics, names, brands, opinions, or facts):"

  if (!sp) return [header, DEFAULT_FORM_BASELINE].join("\n")

  const lines = [
    `- Confidence: ${sp.confidence}`,
    `- Energy: ${sp.energy}`,
    `- Vocabulary: ${sp.vocabularyComplexity}`,
    `- Capitalization: ${sp.capitalization}`,
    `- Directness: ${sp.directness}`,
    sp.emojiUsage && `- Emoji usage: ${sp.emojiUsage}`,
    sp.hashtagUsage && `- Hashtag usage: ${sp.hashtagUsage}`,
    sp.humorStyle && `- Humor: ${sp.humorStyle}`,
    sp.rhetoricalDevices && `- Rhetorical devices: ${sp.rhetoricalDevices}`,
  ].filter(Boolean)

  const prefix = confidencePrefix(sp.confidenceScore)

  return [
    header,
    DEFAULT_FORM_BASELINE,
    prefix,
    structuralConstraints(sp),
    ...lines,
    TONE_VS_FORM_INDEPENDENCE,
  ].filter(Boolean).join("\n")
}

function templateBlock(templateInstruction?: string): string {
  if (!templateInstruction?.trim()) return ""
  return `TEMPLATE STRUCTURE (follow this structure/instruction — the Writing Style below still governs tone/voice, this only governs the shape/workflow):\n${templateInstruction.trim()}`
}

function voiceBlock(voice: VoiceProfile, styleProfile: StyleProfile | null, templateInstruction?: string, entityContext?: EntityContext | null): string {
  const inspiration =
    voice.voiceInspiration && voice.voiceInspiration !== "nobody"
      ? `INSPIRED BY: ${voice.voiceInspiration}`
      : ""

  const context = [`NICHE: ${voice.niche || "general"}`, inspiration].filter(Boolean).join("\n")

  const rules = voice.customRules?.trim()
    ? `CUSTOM RULES (highest priority — explicit instructions from the user for HOW to write; these override WRITING STYLE or TONE below if they ever conflict. Apply each rule silently — never quote, restate, or work a rule's own wording into the finished post):\n${voice.customRules}`
    : ""

  return [
    CONTEXT_PRIORITY,
    STYLE_PRIORITY,
    templateBlock(templateInstruction),
    `CONTEXT (use only if relevant to the current request):\n${context}`,
    buildContextBlock(entityContext ?? null),
    `TONE: ${voice.tone || "natural, human"}`,
    styleProfileBlock(styleProfile),
    rules,
  ]
    .filter(Boolean)
    .join("\n")
}

function systemX(mode: Mode, voice: VoiceProfile, styleProfile: StyleProfile | null, templateInstruction?: string, entityContext?: EntityContext | null): string {
  const planning = mode === "tweet" ? tweetPlanning(pickAngles()) : PLANNING[mode]
  return [
    "You write posts for X (Twitter) as a specific person. Match their voice precisely.",
    voiceBlock(voice, styleProfile, templateInstruction, entityContext),
    planning,
    "RULES:",
    "- Write like a real person posting on X, not marketing copy — no corporate tone, no forced enthusiasm, no hedge-everything disclaimers.",
    "- Avoid worn-out openers (\"hot take\", \"unpopular opinion\", \"here's the thing\", \"let that sink in\", \"this changes everything\") and worn-out closers (\"thoughts?\", \"agree?\", generic motivational lines) — use them only if they'd genuinely fit, which is rare.",
    "- Not every post needs a hook + lesson + call-to-action. Many good posts just make a point and stop. Only add a closing 'lesson'/takeaway line if WRITING STYLE clearly shows this person naturally writes that way — otherwise let the post end when the thought is finished.",
    "- Follow the PUNCTUATION and LINE BREAKS & SPACING instructions in WRITING STYLE above exactly. Never run two separate thoughts together with no separator, and never collapse into a compressed lowercase fragment style unless WRITING STYLE clearly says this person's own posts actually look like that — don't infer that from brevity or tone alone.",
    "- Don't default to em dashes — only if WRITING STYLE's punctuation notes show the user's own writing actually uses them.",
    "- No hashtags unless WRITING STYLE's Hashtag usage line clearly shows this person uses them; no emojis unless WRITING STYLE's Emoji usage line shows the same. Never invent either from the topic alone.",
    '- Never say "as an AI". Sound human.',
    NEVER_INVENT_PERSONAL_EXPERIENCE,
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

// Universal, level-independent — research/context can only ever supply
// verifiable PUBLIC facts (see buildContextBlock below); it can never stand
// in for the user's own personal experience. This is a hard rule, not a
// preservation-level tendency, so it's included in RULES at every level.
// SOURCE OF TRUTH: extension/lib/prompts.ts's identical constant.
const NEVER_INVENT_PERSONAL_EXPERIENCE =
  "Never invent personal experience: who the user met, how they felt, what conversations they had, what surprised them, what they personally learned or enjoyed. Personal experience can ONLY come from the user's own input above — verified context (if present) may only ever supply objective public facts (what/when/where/who publicly), never fill in what the user themselves thought or did."

// Draft-preservation levels — how much freedom Aminta has to construct the
// post vs. how much it must preserve the user's own words/order/claims,
// scaled to how much the user actually wrote (see lib/ai/draftIntent.ts).
// SOURCE OF TRUTH: extension/lib/prompts.ts's identical function — replaces
// the old single fixed PREMISE_DEVELOPMENT_RULE, which treated a bare topic
// and an already-substantial draft identically (a sparse topic used to
// collapse into a near-verbatim paraphrase instead of a developed post,
// overriding the LENGTH TARGET below it — the fix for THAT failure mode is
// preserved verbatim in the "low" branch below).
const PRESERVATION_INSTRUCTIONS: Record<PreservationLevel, string> = {
  low:
    "The topic above is a SEED, not a complete draft — a short topic (a few words) is not an instruction to write a short post, and it is never a reason to refuse or ask for more detail. Infer a safe, subjective angle: opinion, anticipation, personal perspective, general observation, a builder's/founder's angle, a question, or a reflection. Develop that angle into a complete, substantive thought that actually reaches the LENGTH TARGET below — while still following the WRITING STYLE punctuation/formatting/cadence instructions above, not generic AI paragraph structure. If VERIFIED CONTEXT is present below, you may use it for specificity (the correct name/date/location), but it stays supporting, not the center of the post. Do NOT invent statistics, event details, speaker names, dates, attendance numbers, or announcements beyond what the topic or VERIFIED CONTEXT actually gave you. If factual specificity isn't known, stay subjective/general — that is a feature of a good response here, not a limitation.",
  medium:
    "The user gave a rough, short thought, not a finished draft — but it already contains their real opinion, claim, example, or emotional direction. PRESERVE that content: their stated reaction, the specific thing they mentioned, their point of view. Your job is to improve structure and expression around it, not replace it with a different, more polished idea. If VERIFIED CONTEXT is present below, you may add the correct specific name/date/location where it fits naturally, but never let it crowd out or overwrite what the user actually said. Do not invent new opinions, claims, or experiences beyond what they gave you.",
  high:
    "The user already wrote a real, multi-sentence draft. Retain most of their ideas and their order — this is a selective rewrite, not a from-scratch composition. Improve clarity, structure, and voice-fit where it genuinely helps; leave sections that already work alone. Do not introduce new claims, opinions, or experiences the user didn't write, and do not restructure the post into a different shape than what they gave you unless it's clearly broken.",
  max:
    "The user's draft already reads like a finished or near-finished post. Make minimal intervention — fix what's genuinely broken (grammar, an awkward phrase, unclear wording), and leave everything else, including their personality and any rough edges that are clearly part of their voice, untouched. Do not replace their voice with polished, generic phrasing. This is closer to a light copyedit than a rewrite.",
}

function preservationInstruction(level: PreservationLevel): string {
  return PRESERVATION_INSTRUCTIONS[level]
}

// ─── Context enrichment — VERIFIED CONTEXT block ───────────────────────────
// Deliberately its own labeled block, separate from CONTEXT PRIORITY/STYLE
// PRIORITY above and from the user's own draft — see the product spec's
// "three concepts" split (user intent / verified context / voice). Absent
// entirely when there's no context (the common case — most generations
// never research anything), so this never adds prompt weight for nothing.
function buildContextBlock(context: EntityContext | null): string {
  if (!context) return ""
  const lines = [
    context.entityName && `Name: ${context.entityName}`,
    context.entityType && `Type: ${context.entityType}`,
    context.dates.length > 0 && `Dates: ${context.dates.join(", ")}`,
    context.people.length > 0 && `People: ${context.people.join(", ")}`,
    context.notableTopics.length > 0 && `Notable topics: ${context.notableTopics.join(", ")}`,
    ...context.verifiedFacts.map((f) => `- ${f}`),
  ].filter(Boolean)
  if (lines.length === 0) return ""
  return [
    "VERIFIED CONTEXT (public facts only — supporting detail, never the center of the post; see the personal-experience rule below):",
    ...lines,
  ].join("\n")
}

// ─── Thread Creator — SOURCE OF TRUTH: extension/lib/prompts.ts's
// buildThreadMessages/parseThreadResponse (identical duplicate, same
// convention as the rest of this file). ONE model call requests all 3
// variants in one JSON response, so Thread Creator is one credit
// reservation, never three.
export interface ThreadOption {
  angle: string
  posts: string[]
}

// SOURCE OF TRUTH: extension/lib/prompts.ts's identical function — see
// there for the full rationale. Thread Creator's Short/Medium/Long selector
// was completely disconnected from generation here (buildThreadMessages
// took no length parameter at all), so every thread used one fixed
// "under 280 characters" per-post cap with no floor regardless of what the
// user picked in the UI — exactly what let a real generation collapse into
// 13-character slogans.
function threadPostDepthGuide(length: OutputLength, styleProfile: StyleProfile | null): string {
  const lp = styleProfile?.lengthProfile
  const anchor = lp
    ? ` This person's own posts typically run around ${lp.median} characters — use that as the real anchor for what "developed" means for them, not a generic paragraph length.`
    : ""

  if (length === "short") {
    return `PER-POST DEPTH: SHORT — noticeably tighter than this person's normal post: one clear, complete thought, said efficiently. Tight does not mean a bare slogan or tagline — it still has to read as a real sentence with a point.${anchor}`
  }
  if (length === "long") {
    return `PER-POST DEPTH: LONG — more developed than this person's normal post: real reasoning, a concrete detail, or a fuller turn of thought in the posts that call for it — not uniform padding across every post.${anchor}`
  }
  return `PER-POST DEPTH: MEDIUM — roughly this person's own normal post depth: a developed thought with real content, not a one-line fragment or slogan.${anchor} A post under about 60-80 characters should be rare and only when it's a deliberately earned beat (e.g. a punchline close) — not the default shape for most posts in the thread.`
}

// SOURCE OF TRUTH: extension/lib/prompts.ts's identical function.
// Independent from threadPostDepthGuide: this controls HOW MANY posts, that
// controls how developed each one is. A fixed count (2-5) is a hard
// instruction — the model must not pad a weak idea to reach it. "6+" is a
// range, not a fixed number: the model picks what the topic supports.
function threadPostCountGuide(postCount: ThreadPostCount): string {
  if (postCount === "6+") {
    return "POST COUNT: choose a sensible number of posts between 6 and 8 based on what this topic can actually support. Never pad a weak idea just to reach 6 — if it can't sustain that many posts without repeating itself, it's better as a shorter, genuinely distinct sequence than a padded one."
  }
  return `POST COUNT: write EXACTLY ${postCount} posts in this thread — not more, not fewer. If the topic doesn't obviously fill ${postCount} posts on its own, develop different angles, steps, or supporting details rather than repeating the same point in different words.`
}

export function buildThreadMessages(
  voice: VoiceProfile,
  input: string,
  styleProfile: StyleProfile | null,
  tone: Tone = "direct",
  length: OutputLength = "medium",
  postCount: ThreadPostCount = 4,
  templateInstruction?: string
): ChatMessage[] {
  const postCountLabel = postCount === "6+" ? "6-8" : String(postCount)
  const system = [
    "You write X (Twitter) threads for a specific person. Match their voice precisely.",
    voiceBlock(voice, styleProfile, templateInstruction),
    `TONE DIRECTION: ${TONE_GUIDE[tone]}`,
    "THINK FIRST, SILENTLY (never write this part down): this topic can be approached from genuinely different angles — pick 3 that are ACTUALLY different premises (e.g. a personal story, a contrarian take, a step-by-step breakdown), not 3 rewrites of the same point. Each thread must stand on its own: a different opening idea, different supporting posts, a different close. Never reuse the same hook, transition phrase, or closing line across the 3 threads.",
    "RULES FOR EVERY THREAD:",
    "- The topic is a SEED, not a complete draft — a short topic (a few words) is not an instruction to write a short, thin thread, and it is never a reason to refuse or ask for a more detailed topic. Infer a safe, subjective angle (opinion, anticipation, personal perspective, general observation, a builder's/founder's angle, a question, a reflection) and develop real substance across the posts. Do NOT invent statistics, event details not provided, speaker names, dates, attendance numbers, announcements, or any claim presented as factual knowledge the topic didn't provide — stay subjective/general when specifics aren't known.",
    "- THREAD SHAPE (a flexible guide, not a rigid template — adapt to what the idea actually needs): a hook/observation, then why it matters, then a perspective (personal, builder's, contrarian — whatever actually fits), then a close that pays it off. This must read as ONE coherent idea developing across the posts, not a single point chopped into fragments — never restate the same point in slightly different words just to hit a post count; a thread of near-duplicate one-liners is a failure, not a valid thread.",
    threadPostCountGuide(postCount),
    templateInstruction?.trim()
      ? `- The TEMPLATE STRUCTURE above is a shape/pattern to follow (new wording, new content — never reuse its old posts verbatim). Its own number of example posts is irrelevant to length — POST COUNT above always wins, even if it differs from how many posts the template shows.`
      : "",
    threadPostDepthGuide(length, styleProfile),
    "- POST 1 (the hook): the strongest line in the thread, introducing the central idea. Someone scrolling past should want to open the thread from this post alone. It sets up what follows — it does not summarize or preview the whole thread.",
    "- MIDDLE POSTS: each one must advance the idea with something genuinely new — a new angle, step, reason, or detail the reader didn't already have. Never restate or rephrase the hook. Never repeat an earlier post's point to pad length or hit the count. Maintain a logical progression — each post should read as the natural next beat, not an interchangeable, standalone fragment.",
    "- FINAL POST (the payoff): delivers the actual conclusion or takeaway the earlier posts were building toward — it should feel like a deliberate, earned ending, not just another point in the list. Do not force a generic call to action, and do not default to bait like \"Agree?\" or \"Thoughts?\" — end that way only if it's genuinely the right note for this specific thread.",
    "- Never number the posts yourself (no \"1/5\", \"2/5\", etc.) and never use generic AI transition phrases (\"Firstly\", \"Moreover\", \"In conclusion\") to glue posts together — let the ideas connect naturally.",
    "- Avoid a generic AI-sounding conclusion (\"In summary...\", \"The bottom line is...\", forced calls to action) unless it's genuinely earned.",
    "- Write like a real person, not marketing copy. No hashtags unless WRITING STYLE's Hashtag usage line clearly shows this person uses them; no emojis unless WRITING STYLE's Emoji usage line shows the same.",
    "- Stay within X's ~280 character ceiling per post where possible — a little over is fine if the idea genuinely needs it, but this is an upper bound, not the depth target above.",
    "",
    `Return ONLY a JSON object: { "threads": [ { "angle": "short label for this thread's angle", "posts": ["post 1", "post 2", ...] (exactly ${postCountLabel} posts) }, ... 3 items total ] }`,
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
  hasImages?: boolean,
  // Polish mode only — Quick Rewrite actions (extension's OutputCard
  // Shorter/Sharper/More casual). See extension/lib/prompts.ts's matching
  // buildMessages for the full comment; kept identical here.
  polishRevision?: string,
  // Tweet mode only — VERIFIED CONTEXT from lib/ai/contextEnrichment.ts.
  // Not part of extension/lib/prompts.ts's identical signature: research
  // is server-only (see contextEnrichment.ts's header), so BYOK generation
  // (which calls the extension's copy of this function directly, never
  // this one) never has this param at all.
  entityContext?: EntityContext | null
): ChatMessage[] {
  const premiseNote = mode === "tweet" ? `\n${preservationInstruction(preservationLevelFor(classifyDraftIntent(input)))}` : ""
  const toneNote = `\nTONE DIRECTION: ${TONE_GUIDE[tone]}${premiseNote}\n${resolveLengthGuide(mode, length, styleProfile)}`
  const trimmed = input.trim()

  const system = systemX(mode, voice, styleProfile, templateInstruction, mode === "tweet" ? entityContext : null) + toneNote + FINAL_OUTPUT_INSTRUCTION
  let user = ""
  if (mode === "tweet") {
    user = `Write ONE original X post about this topic:\n"""${trimmed}"""`
  } else if (mode === "reply") {
    user = hasImages
      ? `Someone posted this on X, with one or more images attached below and this caption:\n"""${trimmed || "(no caption text)"}"""\nLook at the images and caption together — the image may carry more of the meaning than the caption does (a meme, a chart, a screenshot, a flex post). Write ONE reply in my voice that responds to the combined meaning. If the image adds nothing beyond the caption, just reply to the caption instead of forcing a visual observation. Never invent specific text, people, brands, numbers, or events you can't actually make out. Return only the reply text.`
      : `Someone posted this on X:\n"""${trimmed}"""\nWrite ONE reply in my voice — respond to something specific in their post, not the post as a whole, not a generic reaction to it. Return only the reply text.`
  } else if (polishRevision?.trim()) {
    user = `CURRENT OUTPUT:\n"""${trimmed}"""\nREQUESTED REVISION: ${polishRevision.trim()}\nApply ONLY this revision. PRESERVE my meaning, voice, personality, and every specific detail this revision doesn't ask you to change — this is a targeted edit of the text above, not a rewrite from scratch and not a generic summary.`
  } else {
    user = `Here is my rough draft for an X post:\n"""${trimmed}"""\nFix grammar, punctuation, awkward phrasing, and spacing. Leave anything that's clearly intentional style alone. PRESERVE my meaning, personality, formality, and language exactly — no new ideas, claims, or facts, and don't let it drift into corporate or LinkedIn tone.`
  }
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

// ─── Anti-slop bounded rewrite ──────────────────────────────────────────
// ONE corrective pass after lib/ai/antiSlop.ts's detectSlop() flags a first
// draft. Reuses the exact system message from the original buildMessages()
// call (same voice/style/context/rules — nothing rebuilt or redrawn) so the
// only thing that changes is being shown its own flagged draft and asked to
// fix specifically what was flagged. This is a single-turn ChatMessage
// format (see the file header: role is "system" | "user" only, no
// "assistant" — Gemini's own multi-turn isn't modeled here), so the flagged
// draft is embedded as text within one fresh user message rather than a
// simulated prior turn.
// `fidelityViolations` (v2.2, optional, defaults to none — existing 3-arg
// call sites are unaffected) — findings from lib/ai/claimFidelity.ts's
// model-assisted semantic-fidelity check, the harder class of problem this
// project's phrase-marker anti-slop detector structurally can't catch (see
// claimFidelity.ts's header for the real motivating failure: a hedged
// future prediction silently rewritten into an unhedged present-tense
// claim). When present, the rewrite instruction adds an explicit
// certainty/tense/scope/numbers preservation rule on top of the existing
// style-only correction.
export function buildAntiSlopRewriteMessages(
  originalMessages: ChatMessage[],
  draft: string,
  reasons: string[],
  fidelityViolations: FidelityViolation[] = []
): ChatMessage[] {
  const system = originalMessages.find((m) => m.role === "system")?.content ?? ""
  const issues = [...reasons, ...fidelityViolations.map(describeViolation)]
  const meaningNote = fidelityViolations.length > 0
    ? " Most importantly: you may change HOW something is worded, but you must NOT change WHAT is being claimed — keep the exact certainty (a hedge stays a hedge, a firm claim stays firm), the exact tense (a future prediction stays future, never an accomplished fact), the exact scope (some/a few/one stays that way, never everyone/the industry/the ecosystem), and any specific numbers or names exactly as given."
    : ""
  const user = `A first attempt at this same request produced the following draft:\n"""${draft}"""\nThis draft has real problems — specifically: ${issues.join("; ")}.\nRewrite it ONCE, fixing ONLY these issues.${meaningNote} Preserve the original meaning, any specific facts or claims it makes, and its approximate length. Do not introduce new issues. Return only the finished rewrite.`
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
    `- rhythm: short phrase, sentence-length/pacing pattern only (e.g. "short, punchy, frequent fragments" or "longer flowing sentences with subordinate clauses")`,
    `- punctuation: short phrase, punctuation habits only (e.g. "commas and periods used naturally, occasional dash for emphasis" or "dashes over commas, no semicolons")`,
    `- emojiUsage: short phrase (e.g. "none" or "sparing, 1 per post")`,
    `- hashtagUsage: short phrase (e.g. "never" or "one relevant hashtag at the end")`,
    `- humorStyle: short phrase, the FORM of humor only, never its subject (e.g. "dry, deadpan" — NOT "dry humor about X")`,
    `- formattingPreferences: short phrase describing how they separate sentences/thoughts and break lines or paragraphs (e.g. "blank line between separate thoughts, full sentences" or "single-line, no line breaks")`,
    `- rhetoricalDevices: short phrase (e.g. "rhetorical questions, contrast pairs")`,
    `- cadence: short phrase, rhythm/flow only (e.g. "builds to a short punchline")`,
    "",
    "IMPORTANT — most real writing uses normal commas, periods, capitalization, and multi-sentence structure. Describe punctuation/formatting/rhythm as minimal, fragment-only, single-line, or lowercase-only ONLY if the samples clearly and consistently show that. Do not default to a compressed 'X-caption' description out of habit — describe what the samples actually show, even when that's ordinary, fully-punctuated writing.",
    "Every free-text value must be a SHORT phrase (under 14 words) describing a structural/stylistic trait only — it must never contain a topic, name, brand, or opinion. If you cannot describe a dimension without referencing content, leave it as an empty string.",
    "Return raw JSON only — no markdown code fences, no explanation.",
  ].join("\n")

  const user = `WRITING SAMPLES:\n${samples}`

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

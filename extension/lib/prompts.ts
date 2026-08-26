import type { ChatMessage } from "~lib/openrouter"
import type { StyleProfile, VoiceProfile } from "~lib/storage"

export type Platform     = "x"
export type Mode         = "tweet" | "reply" | "polish"

// ── Quick Rewrite actions (OutputCard) ──────────────────────────────────
// Routed through polish mode's polishRevision param (see buildMessages) —
// a targeted edit of the CURRENT output, never a from-scratch rewrite.
export type QuickRewriteAction = "shorter" | "sharper" | "casual"

export const QUICK_REWRITE_INSTRUCTIONS: Record<QuickRewriteAction, string> = {
  shorter:
    "Make this meaningfully shorter. Cut unnecessary words, repetition, filler, and overexplaining — do not just delete the last sentence, and do not summarize it into generic language. Preserve the main point, the useful specifics, and the intended meaning.",
  sharper:
    "Make this sharper: stronger opening, clearer sentences, more specific language, better pacing. Remove weak or filler language. Do NOT make it aggressive, clickbait, corporate, fake-controversial, or add an excessive hook — this is a clarity and precision pass, not a tone change.",
  casual:
    "Make this feel more natural and conversational, like the user is actually talking, not writing a polished statement. Do not force lowercase, add slang, add \"lol\", add emojis, add profanity, or introduce spelling mistakes unless the WRITING STYLE/CUSTOM RULES above already show this person's own writing does that.",
}
export type Tone         = "direct" | "witty" | "analytical" | "inspiring"
export type OutputLength = "short" | "medium" | "long"
// Thread Creator only — how many posts, independent from OutputLength
// (which controls per-post depth, not post count). "6+" lets the model pick
// a sensible count in [6, 8] rather than a fixed number.
export type ThreadPostCount = 2 | 3 | 4 | 5 | "6+"

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

// A separate axis from CONTEXT_PRIORITY above: that one governs WHAT gets
// said (content), this one governs HOW (style) — CUSTOM RULES weren't
// previously ranked against WRITING STYLE/TONE at all, so an explicit
// instinct like "no hashtags" had no stated precedence over a learned
// pattern showing hashtag use, or over whatever a tone happened to imply.
const STYLE_PRIORITY =
  "STYLE PRIORITY (highest to lowest): CUSTOM RULES (explicit instructions from the user) > WRITING STYLE (patterns learned from real writing) > TONE DIRECTION > generic default phrasing. If CUSTOM RULES ever conflicts with a pattern in WRITING STYLE or with TONE DIRECTION, CUSTOM RULES wins — e.g. a learned pattern showing past hashtag use never overrides an explicit 'no hashtags' rule."

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

// Without an active countermeasure, the model's own pretraining bias
// pulls generic X writing toward compressed, lowercase, fragment-heavy
// "AI-caption" style regardless of what a specific user's profile says —
// especially when a field is thin/empty (small corpus) and there's nothing
// forceful pushing back. This is the default EVERY prompt gets, populated
// profile or not, so there's always an active instruction to write like a
// real person unless the profile clearly says this person doesn't.
const DEFAULT_FORM_BASELINE =
  "DEFAULT — unless a field below clearly says otherwise: write real sentences with normal commas, periods, capitalization, and natural spacing between thoughts, the way an actual person writes. Never default to a compressed lowercase AI-caption style (no punctuation, one fragment per line) just because this is X — that is not how most people actually write, and it is a formatting habit to avoid, not a target."

// Tone (direct/witty/analytical/inspiring) only ever changes attitude and
// word choice — it must never be read as license to drop the punctuation/
// line-break identity above. This used to be unstated, which let a
// "direct" tone alone push the model toward fragments even when the
// profile clearly showed normal punctuation.
const TONE_VS_FORM_INDEPENDENCE =
  "Tone changes attitude and word choice ONLY — it never overrides the punctuation, capitalization, or line-break instructions above. A direct tone still uses this person's normal commas and full sentences; it does not mean fragments or no punctuation. Witty does not mean fragment-only. Analytical does not mean generic structured AI prose."

// Headed, imperative constraints (not decorative bullets) for the fields
// most responsible for a generated post actually resembling the user's
// real writing rather than generic AI-caption formatting. Each header maps
// to a real StyleProfile field rather than inventing new schema — rhythm
// and cadence both describe pacing, so they're folded into one CADENCE
// line rather than two overlapping ones.
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
    ? `CUSTOM RULES (highest priority — explicit instructions from the user for HOW to write; these override WRITING STYLE or TONE below if they ever conflict. Apply each rule silently — never quote, restate, or work a rule's own wording into the finished post):\n${voice.customRules}`
    : ""

  return [
    CONTEXT_PRIORITY,
    STYLE_PRIORITY,
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
    "- Follow the PUNCTUATION and LINE BREAKS & SPACING instructions in WRITING STYLE above exactly. Never run two separate thoughts together with no separator, and never collapse into a compressed lowercase fragment style unless WRITING STYLE clearly says this person's own posts actually look like that — don't infer that from brevity or tone alone.",
    "- Don't default to em dashes — only if WRITING STYLE's punctuation notes show the user's own writing actually uses them.",
    "- No hashtags unless WRITING STYLE's Hashtag usage line clearly shows this person uses them; no emojis unless WRITING STYLE's Emoji usage line shows the same. Never invent either from the topic alone.",
    '- Never say "as an AI". Sound human.',
    "- Return ONLY the finished text — never your thinking, notes, or process. No surrounding quotes, no labels like \"Tweet:\" or \"Reply:\" or \"Here's a polished version:\", no preamble, no explanation.",
  ]
    .filter(Boolean)
    .join("\n")
}

// Deliberately the LAST thing the model reads before generating — LLMs
// weight end-of-prompt instructions more heavily than mid-prompt ones, and
// this used to sit buried inside the RULES list (still is, for belt-and-
// suspenders), with TONE DIRECTION/LENGTH TARGET appended after it. That
// meant the model's actual last read was tone/length guidance, not the
// anti-leakage instruction — one contributing factor (alongside no
// thinking-level cap and no structured output) in style-profile prose
// occasionally surfacing as the "generated post" instead of real output.
// A sparse topic ("solana summit serbia") was collapsing into a near-
// verbatim paraphrase instead of a developed post — the model was letting
// the INPUT's brevity dictate the OUTPUT's length/depth, overriding the
// LENGTH TARGET below it. This is the active countermeasure: the topic is
// explicitly reframed as a premise to develop, not a sentence to rewrite,
// with an explicit boundary against inventing facts (the failure mode the
// opposite instruction — "add more" — would otherwise invite). Tweet mode
// only: replies/polish already have real source content to work from, not
// a bare topic that needs developing.
const PREMISE_DEVELOPMENT_RULE =
  "The topic above is a SEED, not a complete draft — a short topic (a few words) is not an instruction to write a short post, and it is never a reason to refuse or ask for more detail. Infer a safe, subjective angle: opinion, anticipation, personal perspective, general observation, a builder's/founder's angle, a question, or a reflection. Develop that angle into a complete, substantive thought that actually reaches the LENGTH TARGET below — while still following the WRITING STYLE punctuation/formatting/cadence instructions above, not generic AI paragraph structure. Do NOT invent statistics, event details not provided, speaker names, dates, attendance numbers, announcements, or any claim presented as factual knowledge the topic didn't provide. If factual specificity isn't known, stay subjective/general — that is a feature of a good response here, not a limitation."

const FINAL_OUTPUT_INSTRUCTION =
  "\n\nFINAL INSTRUCTION — this overrides everything above if there's ever a conflict: return only the finished post. Do not return writing instructions, tone descriptions, analysis, labels, quotation marks, markdown, or commentary."

// Personalizes Short/Medium/Long against the user's own learned posting
// length (StyleProfile.lengthProfile, from Voice Refresh or local corpus —
// see lib/styleProfile.ts's computeLengthProfile) instead of one fixed
// range for everyone. Tweet mode only: replies/polish already scale off
// the source post/draft itself, not the user's typical post length.
// Falls back to the fixed LENGTH_GUIDE when there's no baseline yet (never
// refreshed, or too few posts) — generation must never break either way.
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

// ─── Thread Creator ─────────────────────────────────────────────────────
// Deliberately a SEPARATE prompt-building function rather than a 4th Mode
// branch woven through systemX/PLANNING/LENGTH_GUIDE — those are shared by
// every existing tweet/reply/polish call site, and threading a new case
// through all of them risked regressing generation that already works.
// This reuses voiceBlock/CONTEXT_PRIORITY/TONE_GUIDE (the parts that are
// genuinely shared) and nothing else.
//
// ONE model call requests all 3 variants in one structured JSON response —
// not 3 separate calls — specifically so Thread Creator costs one credit
// reservation, not three. See landing/lib/ai/credits.ts's thread cost.
export interface ThreadOption {
  angle: string
  posts: string[]
}

// Thread Creator's Short/Medium/Long selector was completely disconnected
// from generation — buildThreadMessages took no length parameter at all,
// so every thread (regardless of what the user picked in the UI) used one
// fixed "under 280 characters" per-post cap with no floor, which is exactly
// what let a real generation collapse into 13-character slogans like "time
// to build". This restores the connection AND personalizes it: when the
// user has a real lengthProfile (Voice Refresh / enough manual examples),
// their own median post length anchors what "developed" actually means for
// them, instead of a generic paragraph. Deliberately phrased around DEPTH
// (thought development, not just characters) per the product requirement —
// characters are secondary guidance, not the definition.
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

// Independent from threadPostDepthGuide: this controls HOW MANY posts, that
// controls how developed each one is. A fixed count (2-5) is a hard
// instruction — the model must not pad a weak idea to reach it, but should
// find genuinely different angles/steps rather than repeating itself.
// "6+" is a range, not a fixed number: the model picks what the topic
// actually supports, never forced up to 8 for its own sake.
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

/** Parses+validates the model's thread JSON — never throws; returns [] on anything malformed. */
function normalizeThreadCandidate(t: unknown): ThreadOption | null {
  if (typeof t !== "object" || t === null) return null
  const obj = t as { angle?: unknown; posts?: unknown }
  const posts = Array.isArray(obj.posts)
    ? obj.posts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim())
    : []
  if (posts.length < 2) return null
  const angle = typeof obj.angle === "string" && obj.angle.trim() ? obj.angle.trim() : "Thread"
  return { angle, posts }
}

// Recovers as many complete, valid thread objects as possible from a
// `{"threads":[{...},{...},...]}` payload even when the tail is truncated —
// a real output-budget failure mode (see lib/backendGenerate.ts's
// THREAD_MAX_OUTPUT_TOKENS), not a hypothetical. A finished thread 1 and 2
// followed by a cut-off thread 3 should still surface 2 usable threads, not
// zero — this is what makes that possible instead of one strict JSON.parse
// discarding the whole response over its unfinished tail.
//
// Walks the "threads" array's top-level `{...}` objects one at a time,
// tracking string/escape state so a brace inside quoted post text is never
// mistaken for structure, and parses each individually. Stops at the first
// object that isn't complete/valid JSON — everything after that point is
// presumed to be the truncated remainder, not "malformed content" to work
// around further.
function extractThreadObjects(text: string): unknown[] {
  const arrayStart = text.indexOf("[")
  if (arrayStart === -1) return []

  const results: unknown[] = []
  let i = arrayStart + 1
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++
    if (i >= text.length || text[i] === "]") break
    if (text[i] !== "{") break

    let depth = 0
    let inString = false
    let escaped = false
    let j = i
    let closed = false
    for (; j < text.length; j++) {
      const ch = text[j]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === "\\") escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') { inString = true; continue }
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) { closed = true; break }
      }
    }
    if (!closed) break // truncated mid-object — nothing further is recoverable

    try {
      results.push(JSON.parse(text.slice(i, j + 1)))
    } catch {
      break // malformed — stop rather than risk skipping into unrelated text
    }
    i = j + 1
  }
  return results
}

/**
 * Parses+validates the model's thread JSON — never throws.
 *
 * Graceful degradation, not all-or-nothing: 3 good options is ideal, but a
 * truncated or partially malformed response that still contains 1-2
 * complete, valid threads returns those rather than an empty array. There
 * is no separate "distinctness" check here or anywhere in this pipeline —
 * distinctness is a PROMPT-TIME instruction to the model (see
 * buildThreadMessages' angle-diversity guidance), never a post-hoc filter
 * that can reject already-generated threads.
 */
export function parseThreadResponse(raw: string): ThreadOption[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf("{")
  if (start === -1) return []
  const sliced = candidate.slice(start)

  // Fast path: the whole response is valid, complete JSON (the common case).
  const end = sliced.lastIndexOf("}")
  if (end !== -1) {
    try {
      const parsed = JSON.parse(sliced.slice(0, end + 1)) as { threads?: unknown }
      if (Array.isArray(parsed.threads)) {
        const valid = parsed.threads.map(normalizeThreadCandidate).filter((t): t is ThreadOption => t !== null)
        if (valid.length > 0) return valid
      }
    } catch {
      // fall through to partial recovery below — likely a truncated response
    }
  }

  // Slow path: recover whichever complete thread objects exist before
  // wherever the response was cut off or malformed, instead of discarding
  // the whole generation.
  return extractThreadObjects(sliced)
    .map(normalizeThreadCandidate)
    .filter((t): t is ThreadOption => t !== null)
}

// Enforces the "generate exactly N" contract in buildThreadMessages' POST
// COUNT rule by REJECTING any option whose post count doesn't match the
// request — never trims or pads one into shape. Silently coercing a 4-post
// option down to 3 (or leaving a 2-post option as-is when 3 was requested)
// would show the user something they didn't ask for, and trimming from the
// end risks cutting the thread's actual payoff/conclusion post, which is a
// quality regression, not a fix. Graceful degradation happens at the
// options level instead: 3 options in, however many match the count come
// back out (0-3) — the caller already treats an empty result as a
// generation failure (see runThreadGenerate's doc comment).
export function enforcePostCount(threads: ThreadOption[], postCount: ThreadPostCount): ThreadOption[] {
  const [min, max] = postCount === "6+" ? [6, 8] : [postCount, postCount]
  return threads.filter((t) => t.posts.length >= min && t.posts.length <= max)
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
  hasImages?: boolean,
  // Polish mode only — Quick Rewrite actions (OutputCard's Shorter/Sharper/
  // More casual). When present, `input` is the CURRENT generated output
  // (not a user-written rough draft), and this replaces polish's default
  // "fix grammar" framing with the specific requested revision. Absent for
  // every other polish call — normal Polish mode is completely unchanged.
  polishRevision?: string
): ChatMessage[] {
  const premiseNote = mode === "tweet" ? `\n${PREMISE_DEVELOPMENT_RULE}` : ""
  const toneNote = `\nTONE DIRECTION: ${TONE_GUIDE[tone]}${premiseNote}\n${resolveLengthGuide(mode, length, styleProfile)}`
  const trimmed = input.trim()

  const system = systemX(mode, voice, styleProfile, templateInstruction) + toneNote + FINAL_OUTPUT_INSTRUCTION
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

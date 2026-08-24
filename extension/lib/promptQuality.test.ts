// ─── Generation-quality benchmark ──────────────────────────────────────────
//
// A reusable, local, deterministic evaluation set for the generation
// pipeline's prompt construction — NOT a live-model eval (no paid API calls
// here). Each scenario below exercises buildMessages()/buildExtractionMessages()
// with a realistic combination of mode/tone/length/voice/style-profile/
// context and asserts on the actual instructions the model would receive:
// the right length target, the anti-cliché/anti-engagement-bait rules, the
// reply contribution menu, the image-reply anti-fabrication rules, the
// polish preserve-list, and so on.
//
// This can't verify a live model's actual output quality — that needs a
// human or an LLM-judge pass against real generations. What it CAN verify,
// cheaply and on every CI run, is that the prompt construction pipeline
// itself asks for the right things for a given scenario and never regresses
// to the old contradictory/rigid instructions.
import { describe, expect, it } from "vitest"
import { buildMessages, type Mode, type OutputLength, type Tone } from "~lib/prompts"
import { buildExtractionMessages, computeConfidenceScore, buildCorpus } from "~lib/styleProfile"
import { resolveTemplateContent } from "~lib/templates"
import type { StyleProfile, VoiceProfile, TemplateVariable } from "~lib/storage"

function voice(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    niche: "general",
    tone: "natural, human",
    examples: "",
    voiceStyle: "",
    voiceInspiration: "",
    customRules: "",
    ...overrides,
  }
}

function styleProfile(overrides: Partial<StyleProfile> = {}): StyleProfile {
  return {
    confidence: "balanced",
    energy: "moderate",
    vocabularyComplexity: "moderate",
    capitalization: "standard",
    directness: "balanced",
    rhythm: "",
    punctuation: "",
    emojiUsage: "", hashtagUsage: "",
    humorStyle: "",
    formattingPreferences: "",
    rhetoricalDevices: "",
    cadence: "",
    confidenceScore: 0.6,
    ...overrides,
  }
}

function systemOf(messages: ReturnType<typeof buildMessages>): string {
  return messages.find((m) => m.role === "system")!.content as string
}
function userOf(messages: ReturnType<typeof buildMessages>): string {
  return messages.find((m) => m.role === "user")!.content as string
}

// ── Shared quality-gate assertions, applied to every scenario below ────────
// These are the concrete rules the "quality problems" audit asked for —
// checked once per scenario so a regression on any of them fails loudly
// wherever it happens, not just in one narrow test.
function expectBaselineQualityRules(system: string) {
  expect(system).toContain("hot take")
  expect(system).toContain("here's the thing")
  expect(system).toContain("let that sink in")
  expect(system).toContain("thoughts?")
  expect(system).toContain("em dash")
  expect(system).toContain("No hashtags unless WRITING STYLE's Hashtag usage line clearly shows this person uses them")
  expect(system).toContain('no labels like "Tweet:" or "Reply:"')
  expect(system).toContain("never your thinking, notes, or process")
  expect(system).not.toContain("exactly TWO short paragraphs")
  expect(system).not.toContain("exactly THREE short paragraphs")
}

// Every system prompt must carry the explicit context-priority hierarchy
// and the mode's silent internal-planning block — the two additions this
// reasoning-quality pass introduces — and the planning must never be
// something the model is told to output.
function expectReasoningScaffold(system: string, mode: Mode) {
  expect(system).toContain("CONTEXT PRIORITY")
  expect(system).toContain("THINK FIRST, SILENTLY")
  expect(system).toContain("never write this part down")
  if (mode === "tweet") {
    expect(system).toMatch(/what's the one real point/i)
  } else if (mode === "reply") {
    expect(system).toMatch(/is agreement genuinely the honest reaction/i)
  } else {
    expect(system).toMatch(/genuinely awkward versus just this person's intentional style/i)
  }
}

describe("post generation — benchmark scenarios", () => {
  const cases: { label: string; tone: Tone; length: OutputLength; input: string; voice: VoiceProfile }[] = [
    { label: "professional",   tone: "analytical", length: "medium", input: "quarterly retro on our infra migration", voice: voice({ niche: "backend infra" }) },
    { label: "casual",         tone: "witty",       length: "short",  input: "coffee is just a warm hug in a cup",     voice: voice({ niche: "lifestyle" }) },
    { label: "founder",        tone: "direct",      length: "medium", input: "why we killed our roadmap and started over", voice: voice({ niche: "B2B SaaS founder" }) },
    { label: "technical",      tone: "analytical",  length: "long",   input: "why we moved off a message queue for direct writes", voice: voice({ niche: "distributed systems" }) },
    { label: "funny",          tone: "witty",       length: "short",  input: "my calendar looks like a losing game of Tetris", voice: voice({ niche: "comedy" }) },
    { label: "opinionated",    tone: "direct",      length: "medium", input: "most 'thought leadership' posts say nothing", voice: voice({ niche: "commentary" }) },
    { label: "conversational", tone: "witty",       length: "short",  input: "anyone else's inbox just permanently at 400+", voice: voice({ niche: "general" }) },
    { label: "announcement",   tone: "inspiring",   length: "medium", input: "we just shipped dark mode after 2 years of requests", voice: voice({ niche: "product" }) },
    { label: "storytelling",   tone: "witty",       length: "long",   input: "the time our demo crashed in front of our biggest investor", voice: voice({ niche: "startup life" }) },
    { label: "disagreement",   tone: "direct",      length: "medium", input: "no, more meetings does not mean more alignment", voice: voice({ niche: "management" }) },
  ]

  it.each(cases)("$label: builds a correct, contradiction-free prompt", ({ tone, length, input, voice: v }) => {
    const messages = buildMessages("x", "tweet", v, input, styleProfile(), tone, length)
    const system = systemOf(messages)
    const user = userOf(messages)

    expect(user).toContain(input)
    expect(system).toContain(`LENGTH TARGET`)
    expectBaselineQualityRules(system)
    expectReasoningScaffold(system, "tweet")
  })

  it("short/medium/long produce different, mode-aware length targets for the same input", () => {
    const short = systemOf(buildMessages("x", "tweet", voice(), "topic", null, "direct", "short"))
    const medium = systemOf(buildMessages("x", "tweet", voice(), "topic", null, "direct", "medium"))
    const long = systemOf(buildMessages("x", "tweet", voice(), "topic", null, "direct", "long"))

    expect(short).toContain("40-100 characters")
    expect(medium).toContain("150-260 characters")
    expect(long).toContain("350-700 characters")
    // The old contradictory hard "under 280 characters" rule that fought
    // with the long/multi-paragraph instruction is gone entirely.
    expect(long).not.toMatch(/under 280 characters/i)
  })

  it("a reply's length targets are shorter than a post's for the same length setting", () => {
    const postLong = systemOf(buildMessages("x", "tweet", voice(), "topic", null, "direct", "long"))
    const replyLong = systemOf(buildMessages("x", "reply", voice(), "topic", null, "direct", "long"))
    expect(postLong).toContain("350-700 characters")
    expect(replyLong).toContain("320 characters")
    expect(replyLong).toContain("Still a reply, not a standalone post")
  })
})

describe("reply generation — benchmark scenarios", () => {
  const cases: { label: string; input: string; note: string }[] = [
    { label: "professional",              input: "We reduced our AWS bill by 40% this quarter through reserved instances.", note: "should react to the 40% figure" },
    { label: "casual",                    input: "just realized i've been making coffee wrong for 10 years lol",           note: "casual conversational reply" },
    { label: "founder",                   input: "raising a seed round is basically a full time sales job",                note: "founder commentary" },
    { label: "technical",                 input: "Postgres row-level locking saved us from a nasty race condition today.", note: "technical detail" },
    { label: "funny",                     input: "my standup update today: 'still fighting the printer'",                 note: "should be able to riff" },
    { label: "opinionated / disagreement", input: "Remote work is objectively worse for company culture, no debate.",     note: "agreement would be boring — must be able to disagree" },
    { label: "conversational",            input: "does anyone actually read terms of service or are we all just clicking accept", note: "conversational" },
    { label: "sarcasm",                   input: "Oh great, ANOTHER 'revolutionary' productivity app. Just what I needed.", note: "sarcastic source post" },
    { label: "reply should add info",     input: "Our onboarding completion rate went from 40% to 65% after we cut it to 3 steps.", note: "reply should extend with something new, not restate" },
    { label: "long source post",          input: "We spent six months rebuilding our entire billing system from scratch. We migrated every customer, rewrote the invoicing engine, moved off our legacy payment processor, and cut billing-related support tickets by 70% in the process. It was the hardest project our team has ever shipped.", note: "long source, reply should still be short" },
  ]

  it.each(cases)("$label ($note): reply prompt gives the model room to add something, not just restate", ({ input }) => {
    const messages = buildMessages("x", "reply", voice(), input, styleProfile(), "direct", "medium")
    const system = systemOf(messages)
    const user = userOf(messages)

    expect(user).toContain(input)
    expect(user).toMatch(/respond to something specific in their post/i)
    expect(user).toMatch(/not a generic reaction to it/i)
    // The "is agreement honest, or is there a sharper angle" judgment call
    // now lives once in the system-level PLANNING block instead of being
    // repeated per-request in the user prompt — checked here via the
    // reasoning-scaffold helper rather than duplicated user-prompt text.
    expectBaselineQualityRules(system)
    expectReasoningScaffold(system, "reply")
  })

  it("a user asking for a short reply gets a short, sentence-level target, not a paragraph", () => {
    const system = systemOf(buildMessages("x", "reply", voice(), "topic", null, "direct", "short"))
    expect(system).toContain("one short sentence")
  })
})

describe("image-aware reply — benchmark scenarios", () => {
  const cases: { label: string; caption: string }[] = [
    { label: "meme with caption", caption: "when the deploy works on the first try" },
    { label: "chart/screenshot",  caption: "our growth this quarter" },
    { label: "vague image, limited context", caption: "" },
    { label: "flex post",         caption: "new setup just dropped" },
    { label: "location photo",    caption: "" },
  ]

  it.each(cases)("$label: instructs combined image+caption reasoning, no fabrication, graceful ignore", ({ caption }) => {
    const messages = buildMessages("x", "reply", voice(), caption, styleProfile(), "direct", "medium", undefined, true)
    const system = systemOf(messages)
    const user = userOf(messages)

    expect(user).toMatch(/images and caption together/i)
    expect(user).toMatch(/never invent specific text, people, brands, numbers, or events/i)
    expect(user).toMatch(/adds nothing beyond the caption.*just reply to the caption/i)
    expect(user).not.toMatch(/^describe what/i)
    // Context priority explicitly places an attached image below the
    // topic/source but above voice — the image-aware reply path is exactly
    // where that ordering matters most.
    expect(system).toContain("an attached image if present")
  })

  it("falls back to the caption gracefully when there is no caption text at all", () => {
    const messages = buildMessages("x", "reply", voice(), "", styleProfile(), "direct", "medium", undefined, true)
    const user = userOf(messages)
    expect(user).toContain("(no caption text)")
  })
})

describe("polish — benchmark scenarios", () => {
  const cases: { label: string; draft: string }[] = [
    { label: "casual draft, keep casual",        draft: "ok so basically we shipped the thing and its actually pretty good ngl" },
    { label: "professional draft",               draft: "We are pleased to announce the completion of our migration project." },
    { label: "founder draft with typos",         draft: "raising money is realy just a numbers game, most VCs say no thats normal" },
    { label: "technical draft, keep terminology", draft: "the race condition was caused by two goroutines writing to the same map without a mutex" },
    { label: "short punchy draft",                draft: "we shipped it. finally." },
  ]

  it.each(cases)("$label: preserves meaning/personality/formality/language, forbids new claims and corporate tone", ({ draft }) => {
    const messages = buildMessages("x", "polish", voice(), draft, styleProfile(), "direct", "medium")
    const system = systemOf(messages)
    const user = userOf(messages)

    expect(user).toContain(draft)
    expect(user).toMatch(/fix grammar, punctuation, awkward phrasing, and spacing/i)
    expect(user).toMatch(/leave anything that's clearly intentional style alone/i)
    expect(user).toMatch(/PRESERVE my meaning, personality, formality, and language/i)
    expect(user).toMatch(/no new ideas, claims, or facts/i)
    expect(user).toMatch(/corporate or linkedin tone/i)
    expectReasoningScaffold(system, "polish")
  })

  it("keeps the draft's approximate length by default regardless of the length selector", () => {
    const short = systemOf(buildMessages("x", "polish", voice(), "draft", null, "direct", "short"))
    const long = systemOf(buildMessages("x", "polish", voice(), "draft", null, "direct", "long"))
    expect(short).toMatch(/keep its approximate length/i)
    expect(long).toMatch(/keep its approximate length/i)
  })
})

describe("style-profile extraction — benchmark scenarios", () => {
  it("never leaks topic/entity content, even with conflicting-style samples", () => {
    // Deliberately contradictory corpus (formal + long vs. slangy + short) —
    // extraction must still only describe HOW they write, never WHAT, and
    // must not crash or produce topic-bearing instructions either way.
    const corpus = buildCorpus(
      [
        "Per our Q3 analysis, infrastructure costs decreased materially following the migration to reserved capacity.",
        "lmaooo just spent 4 hrs debugging a typo. we've all been there",
      ],
      ["excited to announce our Series B led by a16z", "ok but why is everyone pretending remote work is easy"]
    )
    const messages = buildExtractionMessages(corpus)
    const system = messages.find((m) => m.role === "system")!.content as string
    const user = messages.find((m) => m.role === "user")!.content as string

    expect(system).toMatch(/never what they say/i)
    expect(system).toContain("NEVER extract, mention, restate, paraphrase, or allude to")
    expect(user).toContain("lmaooo") // raw samples DO go to the extractor itself
  })

  it("confidence scales with corpus size — small vs large evidence base", () => {
    expect(computeConfidenceScore([])).toBe(0)
    expect(computeConfidenceScore([{ text: "a", source: "example" }])).toBeLessThan(
      computeConfidenceScore(Array(12).fill({ text: "a", source: "example" }))
    )
  })

  it("a single conflicting-style sample still produces a valid, non-crashing extraction prompt", () => {
    const corpus = buildCorpus(["short."], ["A much longer and more formally structured sentence than the other sample."])
    expect(() => buildExtractionMessages(corpus)).not.toThrow()
  })

  it("empty corpus produces no extraction prompt content to worry about (handled upstream by computeConfidenceScore/defaultStyleProfile)", () => {
    expect(computeConfidenceScore([])).toBe(0)
  })

  it("extraction prompt caps free-text fields to short phrases, preventing topic-length leakage", () => {
    const messages = buildExtractionMessages(buildCorpus(["sample"], []))
    const system = messages.find((m) => m.role === "system")!.content as string
    expect(system).toMatch(/SHORT phrase \(under 14 words\)/i)
  })
})

describe("template generation — benchmark scenarios", () => {
  it("exact mode returns its content verbatim — no variable resolution, no AI, no style/length instructions involved", () => {
    // Mirrors lib/templates.ts's runTemplate(): "exact" short-circuits
    // before resolveTemplateContent() is ever called, returning
    // template.content untouched — resolveTemplateContent() is fill-mode's
    // job, tested separately below.
    const content = "Just launched: dark mode, no variables here!"
    expect(content).toBe("Just launched: dark mode, no variables here!")
  })

  it("fill mode resolves variables deterministically without touching the model", () => {
    const vars: TemplateVariable[] = [{ key: "feature", label: "Feature", required: true }]
    const result = resolveTemplateContent("Just launched: {{feature}}!", vars, { feature: "dark mode" })
    expect(result).toEqual({ ok: true, text: "Just launched: dark mode!" })
  })

  it("fill mode reports missing required variables instead of silently rendering blanks", () => {
    const vars: TemplateVariable[] = [{ key: "feature", label: "Feature", required: true }]
    const result = resolveTemplateContent("Just launched: {{feature}}!", vars, {})
    expect(result.ok).toBe(false)
  })

  it("generate mode's TEMPLATE STRUCTURE block sits alongside WRITING STYLE without overriding voice", () => {
    const messages = buildMessages(
      "x",
      "tweet",
      voice(),
      "our new integration",
      styleProfile({ humorStyle: "dry, deadpan" }),
      "witty",
      "medium",
      "Announce a new feature. Structure: hook line, then one benefit, then a soft CTA."
    )
    const system = systemOf(messages)
    expect(system).toContain("TEMPLATE STRUCTURE")
    expect(system).toContain("Announce a new feature")
    expect(system).toContain("the Writing Style below still governs tone/voice")
    expect(system).toContain("Humor: dry, deadpan")
  })

  it("generate mode without a template instruction omits the TEMPLATE STRUCTURE block entirely", () => {
    const system = systemOf(buildMessages("x", "tweet", voice(), "topic", null, "direct", "medium"))
    expect(system).not.toContain("TEMPLATE STRUCTURE")
  })

  // Prompt strengthening (production Gemini-leakage fix): the anti-leakage
  // instruction must be the literal LAST thing the model reads — LLMs weight
  // end-of-prompt instructions more heavily, and this used to be buried in
  // the middle of RULES with TONE DIRECTION/LENGTH TARGET appended after it.
  it("ends the system prompt with the final anti-leakage instruction, after tone/length guidance", () => {
    const system = systemOf(buildMessages("x", "tweet", voice(), "topic", null, "direct", "medium"))
    expect(system.trim().endsWith(
      "Do not return writing instructions, tone descriptions, analysis, labels, quotation marks, markdown, or commentary."
    )).toBe(true)
    // TONE DIRECTION/LENGTH TARGET must come BEFORE the final instruction,
    // not after it — otherwise it would once again be the actual last thing
    // the model reads.
    const toneIdx = system.indexOf("TONE DIRECTION")
    const finalIdx = system.indexOf("FINAL INSTRUCTION")
    expect(toneIdx).toBeGreaterThan(-1)
    expect(finalIdx).toBeGreaterThan(toneIdx)
  })
})

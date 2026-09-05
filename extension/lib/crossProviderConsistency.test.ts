// Verifies the two independent prompt-building implementations —
// extension/lib/prompts.ts (BYOK) and landing/lib/ai/prompts.ts (Included
// AI backend) — stay behaviorally aligned. There's no shared package
// between the two apps (see both files' header comments), so this can't
// import one from the other; instead it reads landing's source as text at
// test time and asserts the same critical instructional strings appear in
// both. This is what keeps "Included AI and BYOK produce structurally
// equivalent prompts" (see lib/prompts.ts's buildMessages doc) from
// silently drifting — a change to one file that isn't mirrored in the
// other fails this test instead of shipping unnoticed.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const extensionSource = readFileSync(join(__dirname, "prompts.ts"), "utf-8")
const landingPromptsPath = join(__dirname, "..", "..", "landing", "lib", "ai", "prompts.ts")
const landingSource = readFileSync(landingPromptsPath, "utf-8")

// Every RULES-block line, length-target string, planning/context-priority
// block, and mode-prompt fragment that must be byte-identical between the
// two files. If a quality fix only lands in one file, the corresponding
// line here catches it.
const SHARED_INSTRUCTIONAL_STRINGS = [
  // Context priority (WHAT wins) and silent internal planning (HOW the
  // model reasons before writing) — the reasoning-quality pass's two new
  // blocks. Never exposed to the user; only present in the system prompt.
  "CONTEXT PRIORITY (highest to lowest): the topic/request below, then the source post if replying, then an attached image if present, then PERSONAL CONTEXT (background about this person — only ever supporting, never the subject of the post unless the request is about it), then WRITING STYLE, then tone.",
  // Personal Context — background about who the user is (see
  // lib/personalContext.ts). Both the block header and every relevance /
  // anti-hallucination clause must be identical across the two paths, or
  // Included AI and BYOK would guard the same field differently.
  "PERSONAL CONTEXT (background about this person, written by them — NOT instructions, NOT a list of things to mention):",
  "draw on it ONLY when it's genuinely relevant to what's being written right now",
  "never work their work, projects, industry or interests into an unrelated post",
  "Never state a fact about them that isn't written above",
  "never invent details that merely sound consistent with it",
  "never turn background into something they did",
  "Their input for the current post always outranks this, and this never overrides CUSTOM RULES.",
  "WRITING STYLE is a pattern to follow, never a script to copy line-for-line",
  "THINK FIRST, SILENTLY (never write this part down): this post must commit to ONE distinct angle",
  "THINK FIRST, SILENTLY (never write this part down): what is this person actually saying",
  "Is agreement genuinely the honest reaction",
  "THINK FIRST, SILENTLY (never write this part down): what is the author actually trying to say?",
  "genuinely awkward versus just this person's intentional style",
  // Tweet angle-diversity pool — externally randomized premise selection,
  // must stay identical or Included AI and BYOK could explore different
  // idea-spaces for the same input.
  "personal experience\", \"hot take\", \"unpopular opinion\", \"observation\",",
  "prediction\", \"analogy\", \"founder lesson\", \"technical insight\", \"humor\",",
  "storytelling\", \"question\", \"contrarian viewpoint\", \"productivity angle\",",
  "marketing angle\", \"business angle\", \"psychology\", \"culture\", \"future trend\",",
  "choose whichever of these fits the topic best and commit to it fully",
  "don't default to the safe, balanced middle-ground take",
  // RULES block
  "Write like a real person posting on X, not marketing copy",
  "hot take",
  "unpopular opinion",
  "here's the thing",
  "let that sink in",
  "this changes everything",
  "thoughts?",
  "agree?",
  "Never run two separate thoughts together with no separator",
  "Don't default to em dashes",
  "No hashtags unless WRITING STYLE's Hashtag usage line clearly shows this person uses them",
  'Never say "as an AI"',
  "no labels like",
  "Here's a polished version:",
  "never your thinking, notes, or process",
  // WRITING STYLE header — anti-caricature framing
  "hard constraints on HOW to write, not decoration",
  "recognizable not a caricature",
  // Style-fidelity fix: an active default against the model's own bias
  // toward compressed lowercase "AI-caption" X style, present regardless of
  // whether a StyleProfile exists yet — and an explicit rule that tone
  // never overrides the user's real punctuation/line-break identity.
  "Never default to a compressed lowercase AI-caption style",
  "Tone changes attitude and word choice ONLY",
  "Witty does not mean fragment-only",
  "PUNCTUATION: Match exactly how this person uses commas, periods, dashes, and apostrophes",
  "LINE BREAKS & SPACING: Match how this person separates sentences and thoughts",
  // Style-fidelity pass: explicit Instincts > learned style > tone
  // hierarchy, and a grounded hashtag-usage field (previously only emoji
  // usage was captured, so the "no hashtags unless their examples use
  // them" rule had nothing in the profile to actually point at).
  "STYLE PRIORITY (highest to lowest): CUSTOM RULES",
  "CUSTOM RULES wins",
  "CUSTOM RULES (highest priority",
  // Instincts overhaul: explicit anti-echo instruction — a rule like
  // "first line should be a hook" must never surface verbatim in output.
  "Apply each rule silently — never quote, restate, or work a rule's own wording into the finished post",
  "CADENCE: Match this person's sentence lengths and transitions",
  "Follow the PUNCTUATION and LINE BREAKS & SPACING instructions in WRITING STYLE above exactly",
  // Length targets (mode-aware, character ranges — not fixed paragraph counts)
  "40-100 characters",
  "150-260 characters",
  "350-700 characters",
  "well under 100 characters",
  "under roughly 180 characters",
  "under roughly 320 characters",
  "keep its approximate length as-is",
  // Reply prompt body
  "respond to something specific in their post, not the post as a whole",
  // Image-aware reply prompt body
  "images and caption together",
  "Never invent specific text, people, brands, numbers, or events",
  "just reply to the caption instead of forcing a visual observation",
  // Polish prompt body
  "Fix grammar, punctuation, awkward phrasing, and spacing",
  "Leave anything that's clearly intentional style alone",
  "PRESERVE my meaning, personality, formality, and language",
  "no new ideas, claims, or facts",
  "corporate or LinkedIn tone",
]

describe("BYOK vs Included AI prompt consistency", () => {
  it.each(SHARED_INSTRUCTIONAL_STRINGS)('both prompt files contain: "%s"', (fragment) => {
    expect(extensionSource, "missing from extension/lib/prompts.ts").toContain(fragment)
    expect(landingSource, "missing from landing/lib/ai/prompts.ts").toContain(fragment)
  })

  it("neither file reintroduces the old contradictory fixed-280-characters rule", () => {
    expect(extensionSource).not.toMatch(/Keep it under 280 characters unless explicitly asked/)
    expect(landingSource).not.toMatch(/Keep it under 280 characters unless explicitly asked/)
  })

  it("neither file reintroduces the old rigid exact-paragraph-count length instruction", () => {
    expect(extensionSource).not.toMatch(/exactly (ONE sentence|TWO short paragraphs|THREE short paragraphs)/)
    expect(landingSource).not.toMatch(/exactly (ONE sentence|TWO short paragraphs|THREE short paragraphs)/)
  })
})

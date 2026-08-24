// TEMPORARY, LOCAL-ONLY benchmark. Not part of the app, never imported by
// it, never committed. Run with:
//
//   cd landing && npx tsx scripts/benchmark-gemini-cost.ts
//
// Requires GEMINI_API_KEY in your shell env (see the check below for exactly
// how to provide it without committing anything).
//
// WHAT THIS DOES
// Calls the real, unmodified production functions —
// buildMessages()/buildStyleProfileMessages() from lib/ai/prompts.ts and
// callGemini() from lib/ai/gemini.ts — with 20 synthetic (never real-user)
// inputs covering tweet/reply/polish/style_profile, varied lengths, tones,
// voice profiles, style profiles, and Instincts-style customRules. Each call
// is a REAL network round trip to Gemini using GEMINI_INCLUDED_MODEL
// (gemini-3.5-flash) and costs real (tiny) money.
//
// WHAT THIS NEVER DOES
// - Never calls /api/generate, never touches Supabase (no checkQuota,
//   claimRequestId, completeUsageLog, createServiceClient — none of those
//   are called; quota.ts's estimateCostUsd is imported only as a pure
//   function for a labeled side-by-side comparison, see PRICING below).
// - Never writes prompt text or generated output to disk or console — only
//   the numeric usage fields returned by GeminiResult are kept, and the
//   `text` field is discarded immediately after extracting token counts.
// - Never prints or logs GEMINI_API_KEY.
// - Runs strictly sequentially (no concurrency), so it can't trip anything
//   rate-limit-shaped even indirectly.
import { buildMessages, buildStyleProfileMessages, type VoiceProfile, type StyleProfile, type StyleCorpusEntry, type Mode, type Tone, type OutputLength } from "../lib/ai/prompts"
import { callGemini } from "../lib/ai/gemini"
import { computeProviderCostUsd } from "../lib/ai/pricing"
import { GEMINI_INCLUDED_MODEL } from "../lib/ai/config"

// ─── PRICING ────────────────────────────────────────────────────────────
// Verified directly against https://ai.google.dev/gemini-api/docs/pricing
// (fetched during this benchmarking session) for the exact configured
// model, gemini-3.5-flash, Standard tier (this is a synchronous
// generateContent call, not a batch job, so Standard tier is the correct
// comparison — Batch/Flex are 50% cheaper but don't apply to this usage
// pattern).
//   Standard tier: $1.50 / 1M input tokens, $9.00 / 1M output tokens.
//
// The repo's own lib/ai/quota.ts constants are labeled "Gemini 2.0 Flash
// pricing" ($0.075/1M in, $0.30/1M out) — roughly 20x/30x lower than the
// verified rate above for the model actually configured. This script uses
// the VERIFIED rate for every dollar figure it reports, and calls the
// repo's estimateCostUsd() only to print a side-by-side "what the current
// (stale) formula would have said" line — never as the real number.
const VERIFIED_PRICE_PER_1K_INPUT_USD = 0.0015   // $1.50 / 1,000,000
const VERIFIED_PRICE_PER_1K_OUTPUT_USD = 0.009   // $9.00 / 1,000,000

function verifiedCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1000) * VERIFIED_PRICE_PER_1K_INPUT_USD + (outputTokens / 1000) * VERIFIED_PRICE_PER_1K_OUTPUT_USD
}

// ─── API key check ──────────────────────────────────────────────────────
if (!process.env.GEMINI_API_KEY) {
  console.error(`
GEMINI_API_KEY is not set in this shell.

This script never reads it from a file and never prints its value — export
it directly in your terminal for this one session, e.g.:

  export GEMINI_API_KEY="paste-the-key-here"
  npx tsx scripts/benchmark-gemini-cost.ts

Get the value from Vercel: Project -> Settings -> Environment Variables ->
GEMINI_API_KEY (Production). Do not add it to .env.local unless you want it
there permanently for local dev — either way, .env* is already gitignored,
and exporting it in-shell for this run touches no file at all.
`)
  process.exit(1)
}

// ─── Synthetic fixtures (never real user content) ──────────────────────
const VOICE_PLAIN: VoiceProfile = {
  niche: "indie software",
  tone: "casual, direct",
  examples: "",
  voiceStyle: "short sentences, no corporate language",
  voiceInspiration: "",
  customRules: "",
}

// Mirrors how the extension's Instincts chips get joined into customRules
// (extension/lib/instinctPresets.ts): a few concrete instructions, one per
// line.
const VOICE_WITH_INSTINCTS: VoiceProfile = {
  niche: "productivity and small tools",
  tone: "warm but blunt",
  examples: "",
  voiceStyle: "conversational, a little self-deprecating",
  voiceInspiration: "",
  customRules: [
    "Never use hashtags.",
    "Open with a concrete detail, not a general statement.",
    "Prefer short, punchy sentences over long compound ones.",
  ].join("\n"),
}

const STYLE_PROFILE_A: StyleProfile = {
  confidence: "balanced",
  energy: "moderate",
  vocabularyComplexity: "casual",
  capitalization: "lowercase-leaning",
  directness: "direct",
  rhythm: "short, punchy, frequent fragments",
  punctuation: "periods over commas, no semicolons",
  emojiUsage: "rare", hashtagUsage: "",
  humorStyle: "dry, understated",
  formattingPreferences: "no line breaks",
  rhetoricalDevices: "occasional rhetorical question",
  cadence: "quick",
  confidenceScore: 0.7,
}

const STYLE_PROFILE_B: StyleProfile = {
  confidence: "assertive",
  energy: "high",
  vocabularyComplexity: "moderate",
  capitalization: "standard",
  directness: "blunt",
  rhythm: "varied, some longer build-up sentences",
  punctuation: "dashes for asides",
  emojiUsage: "none", hashtagUsage: "",
  humorStyle: "none",
  formattingPreferences: "single paragraph",
  rhetoricalDevices: "contrast (not X, but Y)",
  cadence: "deliberate",
  confidenceScore: 0.55,
}

interface GenerateCase {
  kind: "generate"
  label: string
  mode: Mode
  voice: VoiceProfile
  input: string
  styleProfile: StyleProfile | null
  tone: Tone
  length: OutputLength
}

interface StyleProfileCase {
  kind: "style_profile"
  label: string
  corpus: StyleCorpusEntry[]
}

type BenchCase = GenerateCase | StyleProfileCase

const TWEET_TOPICS = [
  "a tip about staying focused while working from home",
  "why morning routines matter more than people think",
  "the tradeoffs of remote work versus an office",
  "shipping a small side project after months of delay",
  "why most productivity advice doesn't stick",
  "a lesson learned from a failed first attempt at something",
]

const REPLY_POSTS = [
  "Just shipped a small feature after weeks of debugging. Feels great.",
  "Hot take: most advice about 'finding your passion' is useless.",
  "Three days into a new habit. Already want to quit. Won't.",
  "Unpopular opinion: meetings that could be an email are still better than no communication at all.",
  "Finally cleaned up my inbox after two years. Never again letting it get like that.",
  "Working on something new. No details yet, but excited.",
]

const POLISH_DRAFTS = [
  "so i built this thing over the weekend and its pretty cool i think u should check it out",
  "been thinking about how we approach onboarding and honestly i think were overcomplicating it way too much",
  "quick update - the project is going ok, slower than i wanted but progress is progress i guess",
  "not sure if anyone else feels this way but mornings are so much better when you dont check your phone first",
]

const CASES: BenchCase[] = [
  // tweet — 6, mixing tone/length/voice/style-profile
  { kind: "generate", label: "tweet-short-direct-plain", mode: "tweet", voice: VOICE_PLAIN, input: TWEET_TOPICS[0], styleProfile: null, tone: "direct", length: "short" },
  { kind: "generate", label: "tweet-medium-witty-instincts", mode: "tweet", voice: VOICE_WITH_INSTINCTS, input: TWEET_TOPICS[1], styleProfile: null, tone: "witty", length: "medium" },
  { kind: "generate", label: "tweet-long-analytical-styleA", mode: "tweet", voice: VOICE_PLAIN, input: TWEET_TOPICS[2], styleProfile: STYLE_PROFILE_A, tone: "analytical", length: "long" },
  { kind: "generate", label: "tweet-medium-inspiring-instincts-styleB", mode: "tweet", voice: VOICE_WITH_INSTINCTS, input: TWEET_TOPICS[3], styleProfile: STYLE_PROFILE_B, tone: "inspiring", length: "medium" },
  { kind: "generate", label: "tweet-short-witty-plain", mode: "tweet", voice: VOICE_PLAIN, input: TWEET_TOPICS[4], styleProfile: null, tone: "witty", length: "short" },
  { kind: "generate", label: "tweet-long-direct-instincts", mode: "tweet", voice: VOICE_WITH_INSTINCTS, input: TWEET_TOPICS[5], styleProfile: null, tone: "direct", length: "long" },

  // reply — 6
  { kind: "generate", label: "reply-short-direct-plain", mode: "reply", voice: VOICE_PLAIN, input: REPLY_POSTS[0], styleProfile: null, tone: "direct", length: "short" },
  { kind: "generate", label: "reply-medium-witty-styleA", mode: "reply", voice: VOICE_PLAIN, input: REPLY_POSTS[1], styleProfile: STYLE_PROFILE_A, tone: "witty", length: "medium" },
  { kind: "generate", label: "reply-long-analytical-instincts", mode: "reply", voice: VOICE_WITH_INSTINCTS, input: REPLY_POSTS[2], styleProfile: null, tone: "analytical", length: "long" },
  { kind: "generate", label: "reply-short-inspiring-plain", mode: "reply", voice: VOICE_PLAIN, input: REPLY_POSTS[3], styleProfile: null, tone: "inspiring", length: "short" },
  { kind: "generate", label: "reply-medium-direct-instincts-styleB", mode: "reply", voice: VOICE_WITH_INSTINCTS, input: REPLY_POSTS[4], styleProfile: STYLE_PROFILE_B, tone: "direct", length: "medium" },
  { kind: "generate", label: "reply-long-witty-plain", mode: "reply", voice: VOICE_PLAIN, input: REPLY_POSTS[5], styleProfile: null, tone: "witty", length: "long" },

  // polish — 4 (length/tone are irrelevant to the polish prompt branch, kept default)
  { kind: "generate", label: "polish-1-plain", mode: "polish", voice: VOICE_PLAIN, input: POLISH_DRAFTS[0], styleProfile: null, tone: "direct", length: "medium" },
  { kind: "generate", label: "polish-2-instincts", mode: "polish", voice: VOICE_WITH_INSTINCTS, input: POLISH_DRAFTS[1], styleProfile: null, tone: "direct", length: "medium" },
  { kind: "generate", label: "polish-3-styleA", mode: "polish", voice: VOICE_PLAIN, input: POLISH_DRAFTS[2], styleProfile: STYLE_PROFILE_A, tone: "direct", length: "medium" },
  { kind: "generate", label: "polish-4-instincts-styleB", mode: "polish", voice: VOICE_WITH_INSTINCTS, input: POLISH_DRAFTS[3], styleProfile: STYLE_PROFILE_B, tone: "direct", length: "medium" },

  // style_profile extraction — 4, varying corpus size
  { kind: "style_profile", label: "style-profile-3-samples", corpus: [
    { text: "Shipped something small today. Feels good.", source: "tweet_dna" },
    { text: "Not sure if this is genius or just a late-night idea. Trying it anyway.", source: "tweet_dna" },
    { text: "Three days into the new habit. Already want to quit. Won't.", source: "example" },
  ] },
  { kind: "style_profile", label: "style-profile-5-samples", corpus: [
    { text: "Most advice about focus is really just advice about saying no more often.", source: "tweet_dna" },
    { text: "Rebuilt the onboarding flow. Half the steps, same result.", source: "tweet_dna" },
    { text: "The best tools disappear. You stop noticing them.", source: "example" },
    { text: "Every 'quick fix' becomes a two-hour detour. Every time.", source: "tweet_dna" },
    { text: "Wrote the whole thing, then deleted half of it. Better now.", source: "approved_edit" },
  ] },
  { kind: "style_profile", label: "style-profile-2-samples", corpus: [
    { text: "Optimism is a discipline, not a mood.", source: "example" },
    { text: "The plan survives contact with reality for about a day.", source: "tweet_dna" },
  ] },
  { kind: "style_profile", label: "style-profile-4-samples", corpus: [
    { text: "Small teams move fast because nobody's waiting on a meeting to decide.", source: "tweet_dna" },
    { text: "Wrote 2000 words today. Kept 300. That's the job.", source: "tweet_dna" },
    { text: "Consistency beats intensity, almost every time.", source: "example" },
    { text: "Shipped the thing nobody asked for. It's my favorite so far.", source: "approved_edit" },
  ] },
]

if (CASES.length !== 20) {
  throw new Error(`Expected exactly 20 cases, got ${CASES.length}`)
}

// ─── Per-generation metrics (non-content only) ─────────────────────────
interface Metric {
  label: string
  mode: Mode | "style_profile"
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  apiMs: number
  verifiedCostUsd: number
  staleCostUsd: number
}

const metrics: Metric[] = []
let failures = 0

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function runOne(c: BenchCase, index: number): Promise<void> {
  process.stdout.write(`[${index + 1}/20] ${c.label} ... `)
  try {
    const messages = c.kind === "generate"
      ? buildMessages(c.mode, c.voice, c.input, c.styleProfile, c.tone, c.length)
      : buildStyleProfileMessages(c.corpus)

    const result = await callGemini(messages, {
      structuredText: c.kind === "generate",
      generationType: c.kind === "generate" ? c.mode : "style_profile",
    })

    // Extract usage immediately, discard the actual text right away —
    // nothing content-bearing is retained past this line.
    const inputTokens = result.inputTokens ?? 0
    const outputTokens = result.outputTokens ?? 0
    const totalTokens = result.totalTokens ?? (inputTokens + outputTokens)
    const apiMs = result.apiMs
    const model = result.model
    void result.text // deliberately unused beyond this point

    const verified = verifiedCostUsd(inputTokens, outputTokens)
    // Stale formula, shown only for comparison — passing 0/0 for the char
    // counts is safe because estimateCostUsd() only falls back to them
    // when realTokens is omitted; here real token counts are always given.
    const stale = computeProviderCostUsd({ model, inputTokens, outputTokens }).costUsd

    metrics.push({
      label: c.label,
      mode: c.kind === "generate" ? c.mode : "style_profile",
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      apiMs,
      verifiedCostUsd: verified,
      staleCostUsd: stale,
    })

    console.log(`ok  in=${inputTokens} out=${outputTokens} total=${totalTokens} ${apiMs}ms $${verified.toFixed(6)}`)
  } catch (e) {
    failures++
    // Error message only — provider error text never includes prompt/output
    // content (see gemini.ts's own error handling), but stay conservative
    // and only print the message, never any request/response body.
    console.log(`FAILED — ${e instanceof Error ? e.message : String(e)}`)
  }
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function usd(n: number): string {
  return `$${n.toFixed(6)}`
}

async function main() {
  console.log(`Running 20 sequential Included AI generations against ${GEMINI_INCLUDED_MODEL}...\n`)

  for (let i = 0; i < CASES.length; i++) {
    await runOne(CASES[i], i)
    await sleep(300)
  }

  console.log("\n" + "=".repeat(72))
  console.log("SUMMARY (non-content metrics only)")
  console.log("=".repeat(72))

  console.log(`\nTotal successful generations: ${metrics.length}`)
  console.log(`Failed generations: ${failures}`)

  if (metrics.length === 0) {
    console.log("\nNo successful generations — nothing further to report.")
    return
  }

  const inputToks = metrics.map((m) => m.inputTokens)
  const outputToks = metrics.map((m) => m.outputTokens)
  const totalToks = metrics.map((m) => m.totalTokens)
  const verifiedCosts = metrics.map((m) => m.verifiedCostUsd)
  const staleCosts = metrics.map((m) => m.staleCostUsd)

  console.log(`\nAverage input tokens:  ${mean(inputToks).toFixed(1)}`)
  console.log(`Median input tokens:   ${median(inputToks).toFixed(1)}`)
  console.log(`Average output tokens: ${mean(outputToks).toFixed(1)}`)
  console.log(`Median output tokens:  ${median(outputToks).toFixed(1)}`)
  console.log(`Average total tokens:  ${mean(totalToks).toFixed(1)}`)

  console.log(`\n--- Cost (VERIFIED pricing: $1.50/1M in, $9.00/1M out, Standard tier) ---`)
  console.log(`Average cost per generation: ${usd(mean(verifiedCosts))}`)
  console.log(`Median cost per generation:  ${usd(median(verifiedCosts))}`)
  const cheapest = metrics.reduce((a, b) => (a.verifiedCostUsd <= b.verifiedCostUsd ? a : b))
  const priciest = metrics.reduce((a, b) => (a.verifiedCostUsd >= b.verifiedCostUsd ? a : b))
  console.log(`Cheapest generation:  ${cheapest.label} (${usd(cheapest.verifiedCostUsd)}, ${cheapest.totalTokens} tokens)`)
  console.log(`Most expensive:       ${priciest.label} (${usd(priciest.verifiedCostUsd)}, ${priciest.totalTokens} tokens)`)
  console.log(`Total cost of all ${metrics.length} calls: ${usd(verifiedCosts.reduce((a, b) => a + b, 0))}`)

  console.log(`\n--- For comparison only: repo's current (stale, "Gemini 2.0 Flash"-labeled) formula ---`)
  console.log(`Average cost per generation (stale formula): ${usd(mean(staleCosts))}`)
  console.log(`Total cost of all ${metrics.length} calls (stale formula): ${usd(staleCosts.reduce((a, b) => a + b, 0))}`)
  console.log(`Verified/stale ratio: ${(mean(verifiedCosts) / mean(staleCosts)).toFixed(1)}x`)

  console.log(`\n--- Breakdown by generation mode (verified pricing) ---`)
  const modes: (Mode | "style_profile")[] = ["tweet", "reply", "polish", "style_profile"]
  for (const mode of modes) {
    const rows = metrics.filter((m) => m.mode === mode)
    if (!rows.length) continue
    const avgIn = mean(rows.map((r) => r.inputTokens))
    const avgOut = mean(rows.map((r) => r.outputTokens))
    const avgCost = mean(rows.map((r) => r.verifiedCostUsd))
    console.log(`${mode.padEnd(14)} n=${rows.length}  avgIn=${avgIn.toFixed(0).padStart(4)}  avgOut=${avgOut.toFixed(0).padStart(4)}  avgCost=${usd(avgCost)}`)
  }

  // ─── Monthly spend projections ──────────────────────────────────────
  // Uses the overall average verified cost/generation across this
  // representative 20-call mix as "the" cost per generation. This is a
  // planning projection only — it does NOT reflect actual current
  // entitlements (today's plan_limits table gives free-plan users 0
  // Included AI quota; only Pro/Founder/gifted get Included AI at all).
  // No quotas are changed by this script or by reporting these numbers.
  const avgCostPerGen = mean(verifiedCosts)
  console.log(`\n${"=".repeat(72)}`)
  console.log("MONTHLY SPEND PROJECTIONS (planning estimates, not current entitlements)")
  console.log(`Using average verified cost/generation from this run: ${usd(avgCostPerGen)}`)
  console.log("=".repeat(72))

  const userCounts = [100, 500, 1_000, 5_000, 10_000]
  const dailyRates = [5, 10]
  const utilizations = [1.0, 0.3]

  for (const dailyRate of dailyRates) {
    console.log(`\n--- ${dailyRate} generations/user/day ---`)
    for (const util of utilizations) {
      console.log(`  Utilization ${(util * 100).toFixed(0)}%:`)
      for (const users of userCounts) {
        const monthlyGenerations = users * dailyRate * 30 * util
        const monthlyCost = monthlyGenerations * avgCostPerGen
        console.log(`    ${String(users).padStart(6)} users: ${usd(monthlyCost)}/mo  (${monthlyGenerations.toLocaleString()} generations)`)
      }
    }
    const perUserMonthly = dailyRate * 30 * avgCostPerGen
    console.log(`  AI cost per user/month at ${dailyRate}/day (100% utilization): ${usd(perUserMonthly)}`)
  }

  console.log(`\nDone. No content was written to disk or printed above — only token counts, timing, and cost.`)
}

main()

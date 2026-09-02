// Fixture scenarios for the generation-quality v2 evaluation pass. Not
// live user data — hand-written synthetic inputs covering the categories
// specified in the eval request. See ./run.ts and ./README.md.
import type { StyleProfile, VoiceProfile } from "../../lib/ai/prompts"

export type ScenarioCategory =
  | "A. topic-only"
  | "B. rough personal thought"
  | "C. developed draft"
  | "D. near-final"
  | "E. research false-positive"
  | "F. hallucination trap"
  | "G. anti-slop trap"

export interface Scenario {
  id: string
  category: ScenarioCategory
  input: string
  note?: string
}

export const SCENARIOS: Scenario[] = [
  // A. TOPIC ONLY
  { id: "A1", category: "A. topic-only", input: "Solana Summit Serbia" },
  { id: "A2", category: "A. topic-only", input: "Cursor" },
  { id: "A3", category: "A. topic-only", input: "OpenAI" },
  { id: "A4", category: "A. topic-only", input: "building in public" },

  // B. ROUGH PERSONAL THOUGHT
  {
    id: "B1", category: "B. rough personal thought",
    input: "went to solana summit serbia\n\nngl expected it to be kinda boring but ended up meeting a bunch of really smart people there",
  },
  {
    id: "B2", category: "B. rough personal thought",
    input: "been working on aminta for months and finally got it on the chrome web store\n\nstill buggy asf but at least people can actually use it now lol",
  },
  {
    id: "B3", category: "B. rough personal thought",
    input: "everyone keeps saying ai will replace designers but most ai generated design still looks like ai generated design",
  },
  {
    id: "B4", category: "B. rough personal thought",
    input: "went to the gym and realized i had the slowest speed on the treadmill\n\nkinda reminded me everyone is on their own journey",
  },

  // C. DEVELOPED DRAFT — realistic, multi-sentence, most wording should survive
  {
    id: "C1", category: "C. developed draft",
    input: "Spent the weekend rebuilding our onboarding flow from scratch. Cut it from 7 steps down to 3. Conversion is already up almost 20% after two days, which honestly surprised me given how small the changes felt at the time.",
  },
  {
    id: "C2", category: "C. developed draft",
    input: "Had a call today with a founder who's been grinding on the same idea for three years with basically no traction. What struck me wasn't the lack of results, it was how calm he was about it. Most people would've quit a year ago.",
  },
  {
    id: "C3", category: "C. developed draft",
    input: "Finally shipped the feature we've been sitting on for two months. Turns out the thing blocking us the whole time was a decision we could've made in a 10 minute conversation. We just kept avoiding having it.",
  },
  {
    id: "C4", category: "C. developed draft",
    input: "Read through 40 rejected pitch decks this week for a friend's accelerator. Almost all of them buried the actual interesting part of the business on slide 9 or 10. The first three slides were always the same generic market-size slop.",
  },

  // D. NEAR-FINAL — already reads naturally, should get minimal intervention
  {
    id: "D1", category: "D. near-final",
    input: "the hardest part of building alone isn't the code, it's staying convinced the thing is worth finishing on the days nothing works.",
  },
  {
    id: "D2", category: "D. near-final",
    input: "nobody warns you that the annoying customer with 500 complaints is usually the one who cares the most about your product actually being good.",
  },
  {
    id: "D3", category: "D. near-final",
    input: "spent three hours debugging something that turned out to be a typo. every engineer has this story. mine just happened today.",
  },
  {
    id: "D4", category: "D. near-final",
    input: "shipped a small fix today that probably took me 10 minutes and somehow fixed a bug that's been open for 8 months. sometimes it really is that dumb.",
  },

  // E. RESEARCH FALSE-POSITIVE CASES — generic single-word topics
  { id: "E1", category: "E. research false-positive", input: "coding" },
  { id: "E2", category: "E. research false-positive", input: "design" },
  { id: "E3", category: "E. research false-positive", input: "startup" },
  { id: "E4", category: "E. research false-positive", input: "basketball" },
  { id: "E5", category: "E. research false-positive", input: "marketing" },
  { id: "E6", category: "E. research false-positive", input: "gym" },
  { id: "E7", category: "E. research false-positive", input: "coffee" },
  { id: "E8", category: "E. research false-positive", input: "working from home" },

  // F. HALLUCINATION TRAPS — deliberately incomplete, inviting fabrication
  { id: "F1", category: "F. hallucination trap", input: "at solana summit serbia i met" },
  { id: "F2", category: "F. hallucination trap", input: "went to breakpoint and talked with" },
  { id: "F3", category: "F. hallucination trap", input: "the best conversation i had at the event was" },
  { id: "F4", category: "F. hallucination trap", input: "yesterday at the OpenAI event I" },

  // G. ANTI-SLOP TRAP — a deliberately bad AI-sounding draft, and a clean control
  {
    id: "G1", category: "G. anti-slop trap",
    input: "Solana Summit Serbia was more than just an event. The energy was unmatched, the conversations were incredible, and one thing became clear: the future of Web3 is bright.",
    note: "This is the FIRST DRAFT under test for anti-slop detection, not a user topic — see run.ts's antiSlop section.",
  },
  {
    id: "G2", category: "G. anti-slop trap",
    input: "met a few sharp builders at the summit, one of them is doing something genuinely interesting with rollups",
    note: "Clean control — should NOT be flagged, no rewrite should trigger.",
  },
]

export const VOICE_BASE: VoiceProfile = {
  niche: "startups, AI tools", tone: "natural", examples: "", voiceStyle: "", voiceInspiration: "", customRules: "",
}

// Three distinct StyleProfile fixtures for the voice-comparison test (§9).
export const VOICE_PROFILE_CASUAL_LOWERCASE: StyleProfile = {
  confidence: "hedging", energy: "moderate", vocabularyComplexity: "casual",
  capitalization: "lowercase-leaning", directness: "balanced",
  rhythm: "short, run-on, punctuation-light", punctuation: "few periods, mostly just line breaks between thoughts, no em dashes",
  emojiUsage: "never", hashtagUsage: "never", humorStyle: "dry, self-deprecating",
  formattingPreferences: "no line breaks within a thought, one blank line between separate thoughts",
  rhetoricalDevices: "none, very plain", cadence: "trails off rather than concluding cleanly",
  confidenceScore: 0.82,
}

export const VOICE_PROFILE_CONCISE_DIRECT: StyleProfile = {
  confidence: "assertive", energy: "high", vocabularyComplexity: "moderate",
  capitalization: "standard", directness: "blunt",
  rhythm: "short declarative sentences, no filler", punctuation: "periods only, no dashes, no ellipses",
  emojiUsage: "never", hashtagUsage: "never", humorStyle: "sparse, deadpan one-liners",
  formattingPreferences: "single-line posts, rarely more than 2 sentences",
  rhetoricalDevices: "occasional rhetorical question, used sparingly", cadence: "states the point and stops",
  confidenceScore: 0.9,
}

export const VOICE_PROFILE_STRUCTURED_PROFESSIONAL: StyleProfile = {
  confidence: "balanced", energy: "moderate", vocabularyComplexity: "sophisticated",
  capitalization: "standard", directness: "balanced",
  rhythm: "longer, complete sentences with subordinate clauses", punctuation: "full standard punctuation, occasional em dash for a clarifying aside",
  emojiUsage: "never", hashtagUsage: "rare, one relevant tag at most", humorStyle: "understated, rare",
  formattingPreferences: "full paragraphs, clear topic sentence", rhetoricalDevices: "contrast pairs, measured qualifiers",
  cadence: "builds to a considered closing thought", confidenceScore: 0.78,
}

// Shared underlying thought run through all three voice profiles (§9).
export const VOICE_TEST_INPUT = "went to solana summit serbia, met some genuinely sharp builders, wasn't expecting much going in"

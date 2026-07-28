import { SYSTEM_HEADER, VOICE_BLOCK, RULES_BLOCK, TONE_NOTE } from "./prompt-shared.ts"

// Arm A — original baseline, before the angle-diversity fix. Reproduced
// verbatim from the version of extension/lib/prompts.ts's PLANNING.tweet
// this whole investigation started from. This is the collapse-prone
// mechanism (silent, unconstrained "what's the one real point?") — the
// pilot's floor reference.
const ARM_A_PLANNING =
  "THINK FIRST, SILENTLY (never write this part down): what's the one real point? If a hook would genuinely help it land, use one — if it would just delay the point, skip it. Pick whatever shape actually fits (one line, a few natural sentences, a short paragraph) instead of forcing structure the idea doesn't need. Cut anything that isn't earning its place. Let the ending land on its own instead of reaching for a closer."

function buildArmA(): string {
  return [SYSTEM_HEADER, VOICE_BLOCK, ARM_A_PLANNING, RULES_BLOCK].join("\n") + TONE_NOTE
}

// Arm B — random-angle approach (currently shipped in production —
// extension/lib/prompts.ts's TWEET_ANGLES/pickAngles/tweetPlanning).
// Copied verbatim. The angle draw uses plain Math.random() — no seeded
// reproducibility needed, since the actual system prompt used for a given
// generation is captured verbatim in that generation's raw record, so
// nothing ever needs to be recomputed from a seed.
const TWEET_ANGLES = [
  "personal experience", "hot take", "unpopular opinion", "observation",
  "prediction", "analogy", "founder lesson", "technical insight", "humor",
  "storytelling", "question", "contrarian viewpoint", "productivity angle",
  "marketing angle", "business angle", "psychology", "culture", "future trend",
]

function pickAngles(): string[] {
  const pool = [...TWEET_ANGLES]
  const picked: string[] = []
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

function armBPlanning(angles: string[]): string {
  return `THINK FIRST, SILENTLY (never write this part down): this post must commit to ONE distinct angle — choose whichever of these fits the topic best and commit to it fully: ${angles.join(", ")}. Don't hedge across angles and don't default to the safe, balanced middle-ground take — pick the one lens that fits and follow it all the way through. What's the one real point, seen through that angle? If a hook would genuinely help it land, use one — if it would just delay the point, skip it. Pick whatever shape actually fits (one line, a few natural sentences, a short paragraph) instead of forcing structure the idea doesn't need. Cut anything that isn't earning its place. Let the ending land on its own instead of reaching for a closer.`
}

function buildArmB(): string {
  return [SYSTEM_HEADER, VOICE_BLOCK, armBPlanning(pickAngles()), RULES_BLOCK].join("\n") + TONE_NOTE
}

// Arm C — premise-first approach (the design under test). Internally
// separates premise generation, premise selection, lens selection, and
// writing — none of the first three steps are ever emitted, only the
// finished tweet.
//
// Revised after the pilot-001 benchmark (D02, "solana transaction fees")
// showed Arm C collapsing onto the single obvious premise on narrow
// factual topics. Root cause: the search stopped as soon as it found a
// strong premise, so on topics with one clearly-obvious claim, that first
// hit was also the only candidate the selection step ever saw. The fix
// targets premature convergence, not the obvious premise itself — each
// generation is still fully stateless (no "already used" framing), and
// the obvious premise is explicitly allowed to win if it's still
// strongest after a genuinely broader search.
const ARM_C_PLANNING = `THINK FIRST, SILENTLY (never write any of this down — only the finished tweet is ever returned):
1. Find the topic's most obvious, most defensible premise — the claim most people would reach for first. Then keep searching: don't stop at the first strong premise. Continue exploring the topic until you've found several genuinely different, truthful premises that could each stand on their own, checking dimensions such as implications, tradeoffs, second-order effects, developer experience, misconceptions, comparisons, product consequences, design philosophy, or personal experience — wherever those dimensions genuinely apply to this specific topic, not as a checklist to force through regardless of fit. Each premise must differ in actual content, not just tone or phrasing. Hold them in mind only; do not write them out.
2. Now compare everything you found and select the single strongest overall — weigh relevance to the topic, how interesting and specific it is, how postable it is (would a real person actually put this out, not just find it technically defensible), and how much genuine engagement it invites. The obvious premise you started with can still be the right choice if, after genuinely searching further, it remains the strongest — don't discard it just because it was the first one found, and don't reach for a weaker or less true premise just to seem different. This is a search for the best idea, not a search for a different one.
3. Only now decide which voice best delivers that specific premise — direct, skeptical, technical, personal, funny, whatever actually fits what you're about to say. The idea comes first; the voice serves it.
4. Write the post. If a hook would genuinely help it land, use one — if it would just delay the point, skip it. Pick whatever shape actually fits (one line, a few natural sentences, a short paragraph) instead of forcing structure the idea doesn't need. Cut anything that isn't earning its place. Let the ending land on its own instead of reaching for a closer.

Return ONLY the finished tweet. None of steps 1–3 may appear anywhere in your output — not the premises you considered, not your reasoning, not which one you picked or why, not the voice you chose. No label, no preamble, no parenthetical.`

function buildArmC(): string {
  return [SYSTEM_HEADER, VOICE_BLOCK, ARM_C_PLANNING, RULES_BLOCK].join("\n") + TONE_NOTE
}

// The registry — add a new arm by writing a new build function above and
// registering it here. Keeping all arms + the registry in one file is
// deliberate: three functions and a lookup table don't need separate
// files to stay organized.
export const ARM_BUILDERS: Record<string, () => string> = {
  A: buildArmA,
  B: buildArmB,
  C: buildArmC,
}

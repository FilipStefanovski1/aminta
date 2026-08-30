// A lightweight guard against pathological length mismatches — e.g. a
// Medium request coming back as "yeah this is wild". This is a narrow
// safety net, not a character-count enforcer: it only catches output far
// below even the SHORT target for the mode, which a real, intentionally
// concise Medium/Long response should essentially never do.
//
// Deliberately does not touch "short" (a tiny output there is the point)
// or "polish" (LENGTH_GUIDE explicitly keeps the draft's own length —
// there is no target to violate).
import type { Mode, OutputLength } from "~lib/prompts"

const PATHOLOGICAL_MIN_LENGTH: Record<Mode, number> = {
  // Matches LENGTH_GUIDE.tweet.short's own lower bound (40) — a Medium/Long
  // tweet output shorter than the SHORT target itself is never intentional.
  tweet: 40,
  // Reply's SHORT guide has no explicit floor ("well under 100 characters"),
  // so this stays conservative — low enough to never flag a genuinely
  // brief-but-real reply, high enough to catch a one-or-two-word non-answer.
  reply: 15,
  polish: 0,
}

export function isPathologicallyShort(text: string, mode: Mode, length: OutputLength): boolean {
  if (length === "short" || mode === "polish") return false
  return text.trim().length < PATHOLOGICAL_MIN_LENGTH[mode]
}

const LENGTH_LABEL: Record<OutputLength, string> = { short: "Short", medium: "Medium", long: "Long" }

/**
 * Appends the corrective instruction for one bounded retry after a
 * pathologically short result — never replaces an existing
 * templateInstruction (a News/Product preset, say), only adds to it.
 */
export function withLengthCorrection(existing: string | undefined, length: OutputLength): string {
  const note = `The previous result was substantially shorter than the requested ${LENGTH_LABEL[length]} length. Expand the idea naturally while preserving the user's voice. Do not add filler.`
  return existing ? `${existing}\n\n${note}` : note
}

// Anti-spam / accidental-duplicate-publish protection — NOT "ban protection".
//
// Aminta doesn't own X's own Post button (X does), so the only thing it can
// actually enforce is its own Insert action for the next post/reply. The
// cooldown starts only on a CONFIRMED publish (see sidepanel.tsx's
// AMINTA_XP_AWARDED listener) — never on Generate, Polish, or the insert
// that led to the confirmed publish itself.
export const PUBLISH_COOLDOWN_MS = 15_000

/** Whole seconds remaining, 0 if the cooldown has expired or wasn't set. */
export function cooldownSecondsRemaining(until: number | null, now: number): number {
  if (!until) return 0
  return Math.max(0, Math.ceil((until - now) / 1000))
}

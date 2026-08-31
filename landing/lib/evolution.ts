// Progression/level thresholds — MUST mirror extension/lib/evolution.ts's
// LEVEL_THRESHOLDS exactly. The two apps are separate build targets with no
// shared package (see extension/CLAUDE.md), so this is a deliberate,
// documented duplication rather than an accidental copy-paste — if you
// change one, change the other in the same commit. A silent drift here is
// exactly what would make the dashboard disagree with the extension about
// which level the same XP total maps to.
//
// Previously this lived inline inside DashboardClient.tsx as its own
// unlabeled `getLevel()` — extracted here so it's a single, visible,
// intentional definition instead of something that can be redefined again
// by accident.
export const LEVEL_THRESHOLDS = [0, 300, 750, 1400, 2300, 3500, 5200, 7500, 10500, 14500]

// Naturally caps at 10 (LEVEL_THRESHOLDS.length) purely because the array
// has 10 entries — no separate clamp here, so this can never silently
// disagree with the extension's own getLevel() over what the cap even is.
// DashboardClient's FORMS art only covers levels 1-9 today (a pre-existing
// gap, not something this fix invents new design for) — it clamps
// separately, for display purposes only, right where it indexes FORMS.
export function getLevel(xp: number): number {
  let level = 1
  for (let i = 1; i < LEVEL_THRESHOLDS.length && xp >= LEVEL_THRESHOLDS[i]; i++) level = i + 1
  return level
}

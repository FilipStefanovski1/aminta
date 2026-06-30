// Animation renderer — maps AnimationId to CSS class strings.
// The only file in the engine that knows about CSS.
// Swap this file to target a different platform without touching the core engine.

import type { AnimationId } from "~lib/companion"

export const ANIMATION_CSS: Record<AnimationId, string> = {
  float:      "sprite-float aminta-glow",
  react:      "sprite-react aminta-glow",
  celebrate:  "sprite-celebrate aminta-glow",
  think:      "sprite-think aminta-glow-dim",
  error:      "sprite-error aminta-glow-dim",
  hungry:     "sprite-hungry aminta-glow-dim",
  sleeping:   "sprite-sleeping aminta-glow-dim",
  pre_evolve: "sprite-float aminta-preglow",
}

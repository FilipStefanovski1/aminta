// The X composer action strip — Generate / Polish / News / Product / You /
// Length.
//
// Split out of contents/twitter-bridge.ts so the routing rules and the DOM
// the user actually sees are both testable; the content script keeps
// composer detection, insertion, and the generation call itself.
//
// Two kinds of action, deliberately:
//
//   ACTIONS  (Generate, Polish)  run immediately — existing behavior, unchanged.
//   PRESETS  (News, Product, You) only SELECT an intent. They never fire a
//            generation, never call a model, and never cost a credit. The
//            user presses Generate when they're ready.
//
// Presets ride the EXISTING templateInstruction seam (see lib/prompts.ts's
// templateBlock, and TextGenerateArgs in lib/backendGenerate.ts) rather than
// introducing a second prompt system. That block governs shape/intent only —
// the user's Voice, StyleProfile, and Instincts still decide how it reads,
// with Instincts still highest priority.

import type { OutputLength } from "~lib/prompts"

export type ComposerPresetId = "news" | "product" | "you"

export interface ComposerPreset {
  id: ComposerPresetId
  label: string
  title: string
  /** Passed through as templateInstruction. Intent/shape only — never style. */
  instruction: string
}

export const COMPOSER_PRESETS: ComposerPreset[] = [
  {
    id: "news",
    label: "News",
    // Truthful by construction: Aminta has no live-headline retrieval, so
    // this must never imply it is fetching anything. It shapes a post about
    // whatever the user themselves brings, and explicitly forbids inventing
    // specifics — the same anti-fabrication stance the main prompt takes.
    title: "Write a post reacting to current events (uses what you type — Aminta doesn't fetch headlines)",
    instruction:
      "Write this as a timely take on a current or recent development, in the shape of a post reacting to something happening now: lead with the development or the angle on it, then what it actually means or why it matters. Work ONLY from what the user supplied — never invent headlines, sources, statistics, dates, company announcements, or events that weren't provided. If specifics aren't given, stay with the general observation rather than fabricating detail.",
  },
  {
    id: "product",
    label: "Product",
    title: "Write about a launch, feature, or build-in-public update",
    instruction:
      "Write this as a product post — a launch, a feature announcement, a build-in-public update, or a genuine opinion about a product. Lead with what shipped or changed, make the concrete benefit or the honest reality clear, and close without a marketing call to action unless one is genuinely earned. Never invent metrics, user counts, launch dates, or claims the user didn't provide.",
  },
  {
    id: "you",
    label: "You",
    title: "Lean hardest on your own learned voice",
    // Every Aminta generation already applies Voice + StyleProfile +
    // Instincts. This is NOT a different model or a second pipeline — it is
    // an emphasis preset that tells the same prompt to prioritize the
    // user's own patterns over any generic shape.
    instruction:
      "Write this as purely the user's own voice — lean on their WRITING STYLE patterns above harder than any generic post structure. No template shape, no imposed format: whatever the idea needs, written the way this specific person actually writes it.",
  },
]

export function presetInstruction(id: ComposerPresetId | null): string | undefined {
  if (!id) return undefined
  return COMPOSER_PRESETS.find((p) => p.id === id)?.instruction
}

// ─── Length ─────────────────────────────────────────────────────────────
// The canonical Create values, reused verbatim — no second length system.

export const LENGTH_CYCLE: OutputLength[] = ["short", "medium", "long"]

export const LENGTH_LABEL: Record<OutputLength, string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
}

/** Cycles short -> medium -> long -> short. */
export function nextLength(current: OutputLength): OutputLength {
  const i = LENGTH_CYCLE.indexOf(current)
  return LENGTH_CYCLE[(i + 1) % LENGTH_CYCLE.length]
}

/** GeneratorPanel's own default, so the composer and Create agree on first use. */
export const DEFAULT_COMPOSER_LENGTH: OutputLength = "medium"

// ─── Strip ──────────────────────────────────────────────────────────────

export interface ComposerStripHandlers {
  onGenerate: () => void
  onPolish: () => void
  /** Selecting a preset. Toggling the active one off passes null. */
  onPreset: (id: ComposerPresetId | null) => void
  /** Advancing the length cycle. Never triggers generation. */
  onLength: (next: OutputLength) => void
}

export interface ComposerStripState {
  preset: ComposerPresetId | null
  length: OutputLength
}

const ACCENT = "#74f7b5"
const SURFACE = "#1a1f2e"
const BORDER = "#2b3142"
const TEXT = "#c8cbd4"

function pill(label: string, opts: { primary?: boolean; active?: boolean; title?: string }): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.textContent = label
  if (opts.title) btn.title = opts.title
  const primary = !!opts.primary
  const active = !!opts.active
  btn.style.cssText = [
    primary ? `background:${ACCENT}` : active ? `background:${ACCENT}1f` : `background:${SURFACE}`,
    primary ? "color:#000" : active ? `color:${ACCENT}` : `color:${TEXT}`,
    `border:1px solid ${primary ? ACCENT : active ? ACCENT : BORDER}`,
    "border-radius:999px",
    "padding:0 10px",
    "height:24px",
    "font-family:inherit",
    "font-size:11px",
    primary ? "font-weight:600" : active ? "font-weight:600" : "font-weight:500",
    "line-height:1",
    "cursor:pointer",
    "white-space:nowrap",
    // Never wrap into a second row — the strip scrolls instead.
    "flex-shrink:0",
    "display:inline-flex",
    "align-items:center",
    "transition:background 0.12s,border-color 0.12s,color 0.12s",
  ].join(";")
  if (!primary) {
    btn.onmouseenter = () => { if (!active) btn.style.borderColor = ACCENT + "88" }
    btn.onmouseleave = () => { if (!active) btn.style.borderColor = BORDER }
  }
  // Keep X's composer focused — a blur would drop the caret we insert at.
  btn.addEventListener("mousedown", (e) => e.preventDefault())
  return btn
}

/**
 * Builds the action strip. Re-rendered on every state change so active
 * states stay in sync without hand-patching individual nodes.
 */
export function buildActionStrip(state: ComposerStripState, handlers: ComposerStripHandlers): HTMLElement {
  const strip = document.createElement("div")
  strip.className = "aminta-actions"
  strip.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:6px",
    // Overflow, never wrap — a narrow reply composer scrolls horizontally
    // instead of collapsing into a ragged multi-line block.
    "flex-wrap:nowrap",
    "overflow-x:auto",
    "scrollbar-width:none",
    "-ms-overflow-style:none",
    "min-width:0",
    "flex:1",
  ].join(";")

  const generate = pill("Generate", { primary: true, title: "Write a post with Aminta" })
  generate.onclick = handlers.onGenerate

  const polish = pill("Polish", { title: "Improve the draft in this composer" })
  polish.onclick = handlers.onPolish

  strip.append(generate, polish)

  for (const preset of COMPOSER_PRESETS) {
    const active = state.preset === preset.id
    const btn = pill(preset.label, { active, title: preset.title })
    // Selecting only sets intent — the generation happens on Generate.
    btn.onclick = () => handlers.onPreset(active ? null : preset.id)
    strip.append(btn)
  }

  const length = pill(LENGTH_LABEL[state.length], { title: "Output length — click to cycle" })
  length.onclick = () => handlers.onLength(nextLength(state.length))
  strip.append(length)

  return strip
}

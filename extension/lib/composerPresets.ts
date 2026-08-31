// The X composer action strip — Generate / Polish / News / Product / You /
// Length (+ Meme in reply composers).
//
// Split out of contents/twitter-bridge.ts so the routing rules and the DOM
// the user actually sees are both testable; the content script keeps
// composer detection, insertion, and the generation call itself.
//
// Three kinds of control, deliberately:
//
//   ACTIONS   (Generate, Polish)         run immediately — existing behavior, unchanged.
//   PRESETS   (News, Product)            toggle an intent on/off. Never fire a generation.
//   DROPDOWNS (You/Tone, Length, Meme)   open a small menu. Selecting an item
//                                        only updates composer state (or, for
//                                        Meme, opens the library popover) —
//                                        never a generation, never a credit.
//
// Presets/dropdown selections ride the EXISTING templateInstruction seam
// (see lib/prompts.ts's templateBlock, and TextGenerateArgs in
// lib/backendGenerate.ts) rather than introducing a second prompt system.
// That block governs shape/intent only — Voice, StyleProfile, and Instincts
// still decide how it reads, with Instincts still highest priority. Tone
// selection uses the real, existing Tone type — nothing invented.

import type { OutputLength, Tone } from "~lib/prompts"

export type ComposerPresetId = "news" | "product"

export interface ComposerPreset {
  id: ComposerPresetId
  label: string
  title: string
  accent: string
  icon: string
  /** Passed through as templateInstruction. Intent/shape only — never style. */
  instruction: string
}

// ─── Accent palette ───────────────────────────────────────────────────────
// One controlled, premium set — not a rainbow. Each action keeps the same
// accent everywhere it appears (pill border/text, menu selected state).
const ACCENT = {
  generate: "#74f7b5", // mint — strongest primary action
  polish: "#a78bfa",   // violet
  news: "#60a5fa",     // blue
  product: "#fbbf24",  // amber
  you: "#c4b5fd",      // muted violet-gray
  length: "#5eead4",   // mint-adjacent
  meme: "#fb923c",     // warm orange — distinct from Product's amber
} as const

// ─── Icons ──────────────────────────────────────────────────────────────
// Thin-stroke 14x14 outline icons, matching the style already used for mode
// icons elsewhere in the extension (stroke=currentColor, width 2, round
// caps/joins) — reused here as raw SVG markup since this file builds plain
// DOM, not React.
export const ICONS = {
  generate: '<path d="M12 2l2.2 5.6 5.8 1.9-4.3 4 1 5.9L12 16.5l-4.7 2.9 1-5.9-4.3-4 5.8-1.9L12 2z"/>',
  polish: '<path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  news: '<path d="M4 4h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M7 8h7M7 11h7M7 14h4"/>',
  product: '<path d="M20.59 13.41 12 22l-9-9V4a1 1 0 0 1 1-1h9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  you: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5"/>',
  length: '<path d="M3 6h18M3 12h12M3 18h7"/>',
  meme: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14"/>',
} as const

export function svgIcon(paths: string, size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

/** Small downward chevron marking a pill as dropdown-capable — distinct from decorative icons, always the same glyph. */
function chevron(): string {
  return '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7;flex-shrink:0"><path d="M6 9l6 6 6-6"/></svg>'
}

export const COMPOSER_PRESETS: ComposerPreset[] = [
  {
    id: "news",
    label: "News",
    // Truthful by construction: Aminta has no live-headline retrieval, so
    // this must never imply it is fetching anything. It shapes a post about
    // whatever the user themselves brings, and explicitly forbids inventing
    // specifics — the same anti-fabrication stance the main prompt takes.
    title: "Write around current news context (uses what you type — Aminta doesn't fetch headlines)",
    accent: ACCENT.news,
    icon: ICONS.news,
    instruction:
      "Write this as a timely take on a current or recent development, in the shape of a post reacting to something happening now: lead with the development or the angle on it, then what it actually means or why it matters. Work ONLY from what the user supplied — never invent headlines, sources, statistics, dates, company announcements, or events that weren't provided. If specifics aren't given, stay with the general observation rather than fabricating detail.",
  },
  {
    id: "product",
    label: "Product",
    title: "Promote your product naturally",
    accent: ACCENT.product,
    icon: ICONS.product,
    instruction:
      "Write this as a product post — a launch, a feature announcement, a build-in-public update, or a genuine opinion about a product. Lead with what shipped or changed, make the concrete benefit or the honest reality clear, and close without a marketing call to action unless one is genuinely earned. Never invent metrics, user counts, launch dates, or claims the user didn't provide.",
  },
]

export function presetInstruction(id: ComposerPresetId | null): string | undefined {
  if (!id) return undefined
  return COMPOSER_PRESETS.find((p) => p.id === id)?.instruction
}

// ─── Bar identity / staleness ───────────────────────────────────────────
// The injected bar is marked with a version so the MutationObserver never
// mistakes a bar from a PREVIOUS build (extension reloaded without a tab
// refresh) for "already injected" and skips replacing it — see
// contents/twitter-bridge.ts's injectBar. Bump this whenever the injected
// bar's markup changes.
export const COMPOSER_BAR_ATTR = "data-aminta-bar"
export const COMPOSER_BAR_VERSION = "4"

/** True only for a bar rendered by THIS build — a previous build's bar is stale. */
export function isCurrentBar(el: Element | null | undefined): boolean {
  return !!el && el.getAttribute(COMPOSER_BAR_ATTR) === COMPOSER_BAR_VERSION
}

/** Any Aminta bar, current or stale — used to clear them all when composers close. */
export function isAmintaBar(el: Element | null | undefined): boolean {
  return !!el && el.hasAttribute(COMPOSER_BAR_ATTR)
}

// ─── Length ─────────────────────────────────────────────────────────────
// The canonical Create values, reused verbatim — no second length system.
// "auto" is a composer-only concept layered on top: the generation system
// has one fixed default (medium), so selecting Auto simply omits an
// explicit override and resolves to that same default — it is not a
// different, freeform backend behavior that doesn't exist.

export type ComposerLength = OutputLength | "auto"

export const LENGTH_CYCLE: OutputLength[] = ["short", "medium", "long"]

export const LENGTH_LABEL: Record<OutputLength, string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
}

export const LENGTH_MENU: { id: ComposerLength; label: string; pillLabel: string; description: string }[] = [
  { id: "auto", label: "Auto Length", pillLabel: "Auto", description: "Let Aminta decide" },
  { id: "short", label: "Short", pillLabel: "Short", description: "1 sentence" },
  { id: "medium", label: "Medium", pillLabel: "Medium", description: "2–3 sentences" },
  { id: "long", label: "Long", pillLabel: "Long", description: "3–5 sentences" },
]

/** Cycles short -> medium -> long -> short. Kept for callers that still want simple cycling. */
export function nextLength(current: OutputLength): OutputLength {
  const i = LENGTH_CYCLE.indexOf(current)
  return LENGTH_CYCLE[(i + 1) % LENGTH_CYCLE.length]
}

/** The real OutputLength a generation call actually receives — "auto" resolves to the system's existing default, never a fabricated mode. */
export function resolveComposerLength(length: ComposerLength): OutputLength {
  return length === "auto" ? "medium" : length
}

// GeneratorPanel's own default, so the composer and Create agree on first use.
export const DEFAULT_COMPOSER_LENGTH: ComposerLength = "auto"

// ─── Tone / "You" ───────────────────────────────────────────────────────
// The You pill doubles as the tone control — real Tone values only, no
// invented labels the backend can't act on. "you" (no explicit tone) keeps
// today's voice-first behavior: current Voice/StyleProfile/Instincts decide
// everything, with no tone nudge layered on top.

export type ComposerTone = "you" | Tone

export const TONE_MENU: { id: ComposerTone; label: string; description: string }[] = [
  { id: "you", label: "You (default)", description: "Just your voice, no tone nudge" },
  { id: "direct", label: "Direct", description: "Short. Clear." },
  { id: "witty", label: "Witty", description: "Clever. Playful." },
  { id: "analytical", label: "Analytical", description: "Logical. Data." },
  { id: "inspiring", label: "Inspiring", description: "Bold. Vision." },
]

export const DEFAULT_COMPOSER_TONE: ComposerTone = "you"

/** The real Tone a generation call receives — "you" resolves to the system's existing default tone. */
export function resolveComposerTone(tone: ComposerTone): Tone {
  return tone === "you" ? "direct" : tone
}

// ─── Strip ──────────────────────────────────────────────────────────────

export interface ComposerStripHandlers {
  onGenerate: () => void
  onPolish: () => void
  /** Selecting a preset. Toggling the active one off passes null. */
  onPreset: (id: ComposerPresetId | null) => void
  onLength: (next: ComposerLength) => void
  onTone: (next: ComposerTone) => void
  /** Only present for reply composers — omit entirely to hide the Meme pill. */
  onOpenMeme?: () => void
}

export interface ComposerStripState {
  preset: ComposerPresetId | null
  length: ComposerLength
  tone: ComposerTone
}

const SURFACE = "#1a1a1c"
const BORDER_DEFAULT = "#2b2b30"
const TEXT_DEFAULT = "#c8cbd4"

// A single open dropdown at a time, tracked at module scope so a pill that
// opens a new menu always cleans up the previous one's outside-click/
// Escape listeners rather than leaking them — see the header comment on
// buildActionStrip below for why this can't just live in per-render state.
let closeOpenMenu: (() => void) | null = null
function closeCurrentMenu() {
  closeOpenMenu?.()
  closeOpenMenu = null
}

// ─── Tooltip ────────────────────────────────────────────────────────────
// One shared primitive for every composer action pill — dark Aminta
// styling (matches buildMenu's panel), shows on hover AND on keyboard
// focus (never hover-only), a short delay on hover so it doesn't flash
// while the pointer just passes over, `position:fixed` + appended to
// document.body so X's own overflow:hidden composer chrome can never clip
// it (same technique the Meme popovers already use), and flips below the
// pill instead of above when there isn't room above.
const TOOLTIP_SHOW_DELAY_MS = 300

function attachTooltip(trigger: HTMLElement, text: string): void {
  let tipEl: HTMLDivElement | null = null
  let showTimer: ReturnType<typeof setTimeout> | null = null

  const hide = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null }
    tipEl?.remove()
    tipEl = null
  }

  const show = () => {
    if (tipEl) return
    const tip = document.createElement("div")
    tip.setAttribute("role", "tooltip")
    tip.textContent = text
    tip.style.cssText = [
      "position:fixed",
      "z-index:2147483000",
      "background:#17171a",
      "border:1px solid #2b2b30",
      "border-radius:6px",
      "padding:4px 8px",
      "font-family:inherit",
      "font-size:10.5px",
      "line-height:1.3",
      "color:#e5e5ea",
      "white-space:nowrap",
      "pointer-events:none",
      "box-shadow:0 4px 16px rgba(0,0,0,0.35)",
    ].join(";")
    document.body.appendChild(tip)
    tipEl = tip

    const rect = trigger.getBoundingClientRect()
    const tipRect = tip.getBoundingClientRect()
    const MARGIN = 6
    let top = rect.top - tipRect.height - MARGIN
    if (top < 4) top = rect.bottom + MARGIN // no room above — flip below
    let left = rect.left + rect.width / 2 - tipRect.width / 2
    left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4))
    tip.style.top = `${top}px`
    tip.style.left = `${left}px`
  }

  const scheduleShow = () => {
    if (showTimer || tipEl) return
    showTimer = setTimeout(show, TOOLTIP_SHOW_DELAY_MS)
  }

  trigger.addEventListener("mouseenter", scheduleShow)
  trigger.addEventListener("mouseleave", hide)
  // Keyboard focus shows immediately — never rely on hover alone.
  trigger.addEventListener("focus", show)
  trigger.addEventListener("blur", hide)
}

function pill(opts: {
  label: string
  iconPaths?: string
  accent: string
  primary?: boolean
  active?: boolean
  dropdown?: boolean
  /** Tooltip text AND accessible name — shown via attachTooltip below, never the native `title` attribute (no hover-only, no double tooltip). */
  title?: string
  ariaHaspopup?: boolean
  /** Stable `data-aminta-action` hook for content-script lookups (e.g. twitter-bridge.ts anchoring the Meme popover) — decoupled from label/tooltip text so copy can change freely. */
  action?: string
}): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  const primary = !!opts.primary
  const active = !!opts.active
  // No aria-label override here: the visible label ("Generate", "News", …)
  // stays the accessible name so it matches what's on screen (WCAG 2.5.3) —
  // the tooltip is a supplementary description, not a replacement name.
  if (opts.title) attachTooltip(btn, opts.title)
  if (opts.action) btn.setAttribute("data-aminta-action", opts.action)
  if (opts.ariaHaspopup) {
    btn.setAttribute("aria-haspopup", "menu")
    btn.setAttribute("aria-expanded", "false")
  }

  const label = document.createElement("span")
  label.textContent = opts.label
  label.style.cssText = "white-space:nowrap"

  btn.style.cssText = [
    primary ? `background:${opts.accent}` : active ? `background:${opts.accent}1f` : `background:${SURFACE}`,
    primary ? "color:#0a0a0a" : active ? `color:${opts.accent}` : `color:${TEXT_DEFAULT}`,
    `border:1px solid ${primary ? opts.accent : active ? opts.accent + "88" : BORDER_DEFAULT}`,
    "border-radius:7px",
    "padding:0 9px",
    "height:24px",
    "font-family:inherit",
    "font-size:11px",
    primary || active ? "font-weight:600" : "font-weight:500",
    "line-height:1",
    "cursor:pointer",
    "white-space:nowrap",
    "flex-shrink:0",
    "display:inline-flex",
    "align-items:center",
    "gap:5px",
    "transition:background 0.12s,border-color 0.12s,color 0.12s,opacity 0.12s",
  ].join(";")

  if (opts.iconPaths) {
    const iconWrap = document.createElement("span")
    iconWrap.style.cssText = `display:inline-flex;color:${primary ? "#0a0a0a" : opts.accent};flex-shrink:0`
    iconWrap.innerHTML = svgIcon(opts.iconPaths)
    btn.appendChild(iconWrap)
  }
  btn.appendChild(label)
  if (opts.dropdown) {
    const chev = document.createElement("span")
    chev.style.cssText = "display:inline-flex;flex-shrink:0"
    chev.innerHTML = chevron()
    btn.appendChild(chev)
  }

  if (!primary) {
    btn.onmouseenter = () => { if (!active) btn.style.borderColor = opts.accent + "66" }
    btn.onmouseleave = () => { if (!active) btn.style.borderColor = BORDER_DEFAULT }
  }
  // Keep X's composer focused — a blur would drop the caret we insert at.
  btn.addEventListener("mousedown", (e) => e.preventDefault())
  return btn
}

export interface MenuItem<T extends string> {
  id: T
  label: string
  description?: string
}

/**
 * The one dropdown-menu visual/behavioral primitive shared by every
 * composer menu (Tone, Length, and Meme's library popover) — dark panel,
 * subtle border, compact rows, a small dot marking the selected row.
 * Handles Escape and outside-click itself; the caller only supplies items
 * and a selection callback.
 */
function buildMenu<T extends string>(opts: {
  items: MenuItem<T>[]
  selectedId: T | null
  accent: string
  onSelect: (id: T) => void
}): HTMLDivElement {
  const menu = document.createElement("div")
  menu.setAttribute("role", "menu")
  menu.style.cssText = [
    "position:absolute",
    "top:calc(100% + 4px)",
    "left:0",
    "min-width:168px",
    "background:#17171a",
    "border:1px solid #2b2b30",
    "border-radius:9px",
    "padding:4px",
    "z-index:1000",
    "box-shadow:0 4px 16px rgba(0,0,0,0.35)", // subtle, not a giant drop shadow
  ].join(";")

  for (const item of opts.items) {
    const selected = item.id === opts.selectedId
    const row = document.createElement("button")
    row.type = "button"
    row.setAttribute("role", "menuitemradio")
    row.setAttribute("aria-checked", String(selected))
    row.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:7px",
      "width:100%",
      "text-align:left",
      "padding:6px 8px",
      "border-radius:6px",
      "border:none",
      selected ? `background:${opts.accent}1a` : "background:transparent",
      "cursor:pointer",
      "font-family:inherit",
    ].join(";")

    const dot = document.createElement("span")
    dot.style.cssText = `width:5px;height:5px;border-radius:50%;flex-shrink:0;background:${selected ? opts.accent : "transparent"}`
    row.appendChild(dot)

    const textWrap = document.createElement("span")
    textWrap.style.cssText = "display:flex;flex-direction:column;gap:1px;min-width:0"
    const labelEl = document.createElement("span")
    labelEl.textContent = item.label
    labelEl.style.cssText = `font-size:11.5px;font-weight:${selected ? "600" : "500"};color:${selected ? opts.accent : "#e5e5ea"};white-space:nowrap`
    textWrap.appendChild(labelEl)
    if (item.description) {
      const descEl = document.createElement("span")
      descEl.textContent = item.description
      descEl.style.cssText = "font-size:9.5px;color:#8e919a;white-space:nowrap"
      textWrap.appendChild(descEl)
    }
    row.appendChild(textWrap)

    row.addEventListener("mousedown", (e) => e.preventDefault())
    row.onclick = () => opts.onSelect(item.id)
    menu.appendChild(row)
  }

  return menu
}

/**
 * Wraps a trigger pill + its menu, wiring open/close (click, outside-click,
 * Escape) and aria-expanded. Only one dropdown is ever open at once — see
 * closeCurrentMenu above.
 */
function buildDropdownPill<T extends string>(opts: {
  triggerLabel: string
  iconPaths: string
  accent: string
  active: boolean
  title: string
  action?: string
  items: MenuItem<T>[]
  selectedId: T | null
  onSelect: (id: T) => void
}): HTMLDivElement {
  const wrap = document.createElement("div")
  wrap.style.cssText = "position:relative;flex-shrink:0"

  const trigger = pill({
    label: opts.triggerLabel,
    iconPaths: opts.iconPaths,
    accent: opts.accent,
    active: opts.active,
    dropdown: true,
    title: opts.title,
    action: opts.action,
    ariaHaspopup: true,
  })

  let menuEl: HTMLDivElement | null = null

  const close = () => {
    menuEl?.remove()
    menuEl = null
    trigger.setAttribute("aria-expanded", "false")
    document.removeEventListener("mousedown", onOutside, true)
    document.removeEventListener("keydown", onKey, true)
  }
  const onOutside = (e: MouseEvent) => {
    if (menuEl && !wrap.contains(e.target as Node)) close()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close()
  }
  const open = () => {
    closeCurrentMenu()
    menuEl = buildMenu({
      items: opts.items,
      selectedId: opts.selectedId,
      accent: opts.accent,
      onSelect: (id) => { close(); opts.onSelect(id) },
    })
    wrap.appendChild(menuEl)
    trigger.setAttribute("aria-expanded", "true")
    document.addEventListener("mousedown", onOutside, true)
    document.addEventListener("keydown", onKey, true)
    closeOpenMenu = close
  }

  trigger.onclick = () => { menuEl ? close() : open() }
  wrap.appendChild(trigger)
  return wrap
}

/**
 * Builds the action strip. Fully re-rendered on every state change so
 * active/selected states stay in sync without hand-patching individual
 * nodes — any currently-open dropdown is closed first (closeCurrentMenu)
 * so its listeners never leak past the DOM it was attached to.
 */
export function buildActionStrip(state: ComposerStripState, handlers: ComposerStripHandlers): HTMLElement {
  closeCurrentMenu()

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
    "overflow-y:visible",
    "scrollbar-width:none",
    "-ms-overflow-style:none",
    "min-width:0",
    "flex:1",
  ].join(";")

  const generate = pill({ label: "Generate", iconPaths: ICONS.generate, accent: ACCENT.generate, primary: true, title: "Write a post from your idea", action: "generate" })
  generate.onclick = handlers.onGenerate

  const polish = pill({ label: "Polish", iconPaths: ICONS.polish, accent: ACCENT.polish, title: "Improve what's already written", action: "polish" })
  polish.onclick = handlers.onPolish

  strip.append(generate, polish)

  for (const preset of COMPOSER_PRESETS) {
    const active = state.preset === preset.id
    const btn = pill({ label: preset.label, iconPaths: preset.icon, accent: preset.accent, active, title: preset.title, action: preset.id })
    // Selecting only sets intent — the generation happens on Generate.
    btn.onclick = () => handlers.onPreset(active ? null : preset.id)
    strip.append(btn)
  }

  const toneEntry = TONE_MENU.find((t) => t.id === state.tone) ?? TONE_MENU[0]
  strip.append(
    buildDropdownPill<ComposerTone>({
      triggerLabel: state.tone === "you" ? "You" : toneEntry.label,
      iconPaths: ICONS.you,
      accent: ACCENT.you,
      active: state.tone !== "you",
      title: "Choose how Aminta should sound",
      action: "tone",
      items: TONE_MENU,
      selectedId: state.tone,
      onSelect: handlers.onTone,
    })
  )

  const lengthEntry = LENGTH_MENU.find((l) => l.id === state.length) ?? LENGTH_MENU[0]
  strip.append(
    buildDropdownPill<ComposerLength>({
      triggerLabel: lengthEntry.pillLabel,
      iconPaths: ICONS.length,
      accent: ACCENT.length,
      active: state.length !== "auto",
      title: "Choose how long the post should be",
      action: "length",
      items: LENGTH_MENU.map(({ id, label, description }) => ({ id, label, description })),
      selectedId: state.length,
      onSelect: handlers.onLength,
    })
  )

  if (handlers.onOpenMeme) {
    const meme = pill({ label: "Meme", iconPaths: ICONS.meme, accent: ACCENT.meme, title: "Reply with a meme", action: "meme" })
    meme.onclick = handlers.onOpenMeme
    strip.append(meme)
  }

  return strip
}

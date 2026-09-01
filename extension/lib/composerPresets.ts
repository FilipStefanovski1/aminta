// The X composer action strip — Generate / Polish (+ Meme in reply
// composers). Deliberately minimal: this used to also offer News/Product
// presets and You/Length dropdowns, but that many controls crammed into a
// small bar injected into someone else's UI read as confusing rather than
// powerful — a product decision to simplify, not a bug fix. Tone, length,
// and template presets still exist as real Aminta features; they just live
// in the extension's own Create tab (GeneratorPanel.tsx), where there's
// room to explain them, not in this compact inline strip.
//
// Split out of contents/twitter-bridge.ts so the DOM the user actually sees
// is testable; the content script keeps composer detection, insertion, and
// the generation call itself.

// ─── Accent palette ───────────────────────────────────────────────────────
// One controlled, premium set — not a rainbow. Each action keeps the same
// accent everywhere it appears.
const ACCENT = {
  generate: "#74f7b5", // mint — strongest primary action
  polish: "#a78bfa",   // violet
  meme: "#fb923c",     // warm orange
} as const

// ─── Icons ──────────────────────────────────────────────────────────────
// Thin-stroke 14x14 outline icons, matching the style already used for mode
// icons elsewhere in the extension (stroke=currentColor, width 2, round
// caps/joins) — reused here as raw SVG markup since this file builds plain
// DOM, not React.
export const ICONS = {
  generate: '<path d="M12 2l2.2 5.6 5.8 1.9-4.3 4 1 5.9L12 16.5l-4.7 2.9 1-5.9-4.3-4 5.8-1.9L12 2z"/>',
  polish: '<path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  meme: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14"/>',
} as const

export function svgIcon(paths: string, size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

// ─── Bar identity / staleness ───────────────────────────────────────────
// The injected bar is marked with a version so the MutationObserver never
// mistakes a bar from a PREVIOUS build (extension reloaded without a tab
// refresh) for "already injected" and skips replacing it — see
// contents/twitter-bridge.ts's injectBar. Bump this whenever the injected
// bar's markup changes.
export const COMPOSER_BAR_ATTR = "data-aminta-bar"
export const COMPOSER_BAR_VERSION = "5"

/** True only for a bar rendered by THIS build — a previous build's bar is stale. */
export function isCurrentBar(el: Element | null | undefined): boolean {
  return !!el && el.getAttribute(COMPOSER_BAR_ATTR) === COMPOSER_BAR_VERSION
}

/** Any Aminta bar, current or stale — used to clear them all when composers close. */
export function isAmintaBar(el: Element | null | undefined): boolean {
  return !!el && el.hasAttribute(COMPOSER_BAR_ATTR)
}

// ─── Strip ──────────────────────────────────────────────────────────────

export interface ComposerStripHandlers {
  onGenerate: () => void
  onPolish: () => void
  /** Only present for reply composers — omit entirely to hide the Meme pill. */
  onOpenMeme?: () => void
}

const SURFACE = "#1a1a1c"
const BORDER_DEFAULT = "#2b2b30"
const TEXT_DEFAULT = "#c8cbd4"

// ─── Tooltip ────────────────────────────────────────────────────────────
// One shared primitive for every composer action pill — dark Aminta
// styling, shows on hover AND on keyboard focus (never hover-only), a short
// delay on hover so it doesn't flash while the pointer just passes over,
// `position:fixed` + appended to document.body so X's own overflow:hidden
// composer chrome can never clip it, and flips below the pill instead of
// above when there isn't room above.
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
  iconPaths: string
  accent: string
  primary?: boolean
  /** Tooltip text AND accessible name — shown via attachTooltip below, never the native `title` attribute (no hover-only, no double tooltip). */
  title: string
  /** Stable `data-aminta-action` hook for content-script lookups (e.g. twitter-bridge.ts anchoring the Meme popover) — decoupled from label/tooltip text so copy can change freely. */
  action: string
}): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  const primary = !!opts.primary
  // No aria-label override here: the visible label ("Generate", "Polish", …)
  // stays the accessible name so it matches what's on screen (WCAG 2.5.3) —
  // the tooltip is a supplementary description, not a replacement name.
  attachTooltip(btn, opts.title)
  btn.setAttribute("data-aminta-action", opts.action)

  const label = document.createElement("span")
  label.textContent = opts.label
  label.style.cssText = "white-space:nowrap"

  btn.style.cssText = [
    primary ? `background:${opts.accent}` : `background:${SURFACE}`,
    primary ? "color:#0a0a0a" : `color:${TEXT_DEFAULT}`,
    `border:1px solid ${primary ? opts.accent : BORDER_DEFAULT}`,
    "border-radius:7px",
    "padding:0 9px",
    "height:24px",
    "font-family:inherit",
    "font-size:11px",
    primary ? "font-weight:600" : "font-weight:500",
    "line-height:1",
    "cursor:pointer",
    "white-space:nowrap",
    "flex-shrink:0",
    "display:inline-flex",
    "align-items:center",
    "gap:5px",
    "transition:background 0.12s,border-color 0.12s,color 0.12s,opacity 0.12s",
  ].join(";")

  const iconWrap = document.createElement("span")
  iconWrap.style.cssText = `display:inline-flex;color:${primary ? "#0a0a0a" : opts.accent};flex-shrink:0`
  iconWrap.innerHTML = svgIcon(opts.iconPaths)
  btn.appendChild(iconWrap)
  btn.appendChild(label)

  if (!primary) {
    btn.onmouseenter = () => { btn.style.borderColor = opts.accent + "66" }
    btn.onmouseleave = () => { btn.style.borderColor = BORDER_DEFAULT }
  }
  // Keep X's composer focused — a blur would drop the caret we insert at.
  btn.addEventListener("mousedown", (e) => e.preventDefault())
  return btn
}

/** Builds the action strip: Generate, Polish, and Meme (reply composers only). */
export function buildActionStrip(handlers: ComposerStripHandlers): HTMLElement {
  const strip = document.createElement("div")
  strip.className = "aminta-actions"
  strip.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:6px",
    "flex-wrap:nowrap",
    "min-width:0",
    "flex:1",
  ].join(";")

  const generate = pill({ label: "Generate", iconPaths: ICONS.generate, accent: ACCENT.generate, primary: true, title: "Write a post from your idea", action: "generate" })
  generate.onclick = handlers.onGenerate

  const polish = pill({ label: "Polish", iconPaths: ICONS.polish, accent: ACCENT.polish, title: "Improve what's already written", action: "polish" })
  polish.onclick = handlers.onPolish

  strip.append(generate, polish)

  if (handlers.onOpenMeme) {
    const meme = pill({ label: "Meme", iconPaths: ICONS.meme, accent: ACCENT.meme, title: "Reply with a meme", action: "meme" })
    meme.onclick = handlers.onOpenMeme
    strip.append(meme)
  }

  return strip
}

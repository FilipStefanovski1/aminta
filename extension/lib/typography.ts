// One typography system for the whole extension.
//
// Why this exists: sizes were previously chosen per component, which left
// ~376 arbitrary `text-[Npx]` values across 24 files — 105 at 10px and 87
// at 11px — and, worse, the SAME semantic role rendered three different
// ways (a section heading was 14px semibold sans on Home, pixel-10px
// uppercase in Train, and pixel-7px uppercase in onboarding). These tokens
// are the single place a role's typography is decided, so a new screen
// picks a ROLE, not a pixel value.
//
// Two families, deliberately:
//   T  — the sans scale. Everything the user reads or types.
//   TP — the pixel-font scale (brand accent). The pixel face renders
//        visually smaller per px and carries Aminta's personality, so it
//        keeps its own smaller numbers. Reserved for chrome that IS the
//        brand: nav, primary buttons, stat values, onboarding titles,
//        XP/level chrome. Never for paragraphs.
//
// The 11px rule: 11px is METADATA only (counters, timestamps, status,
// optional hints). Anything a user must read to make a decision, or any
// label attached to a control, is 12px or larger.

/** Sans scale — reading and interaction. */
export const T = {
  /** Screen/page title in a sans context (settings pages, modal headers). */
  screenTitle: "text-[17px] font-semibold leading-snug",
  /** THE section heading. One treatment, every screen. */
  sectionTitle: "text-[14px] font-semibold leading-snug",
  /** Title of a card or a list item inside a card. */
  cardTitle: "text-[13px] font-semibold leading-snug",
  /** Primary reading text — descriptions, generated output, explanations. */
  body: "text-[13px] leading-relaxed",
  /** Supporting copy that is still meant to be read comfortably. */
  bodySm: "text-[12px] leading-relaxed",
  /** Label sitting above/beside a control. Never smaller than this. */
  label: "text-[12px] font-medium leading-snug",
  /** Text inside inputs/textareas, and their placeholders. */
  control: "text-[13px] leading-relaxed",
  /** Sans buttons and inline text actions. */
  button: "text-[12px] font-semibold",
  /** Smaller inline action inside a dense row (still readable). */
  buttonSm: "text-[11px] font-semibold",
  /** Genuine metadata: counters, timestamps, status, "(optional)". */
  meta: "text-[11px] leading-snug",
  /** Uppercase eyebrow above a group, sans. Rare — prefer sectionTitle. */
  eyebrow: "text-[11px] font-medium uppercase tracking-[0.08em]",
} as const

/** Pixel-font scale — brand chrome only. */
export const TP = {
  /** Onboarding screen titles. */
  screenTitle: "font-pixel text-[11px] leading-relaxed",
  /** Section heading where the pixel face is deliberately the brand voice. */
  sectionTitle: "font-pixel text-[10px] uppercase tracking-widest",
  /** Primary CTA. */
  button: "font-pixel text-[9px]",
  /** Secondary/ghost CTA. */
  buttonSm: "font-pixel text-[8px]",
  /** Bottom navigation labels. */
  nav: "font-pixel text-[9px] uppercase tracking-widest",
  /** Small uppercase eyebrow above a field group. */
  eyebrow: "font-pixel text-[8px] uppercase tracking-widest",
  /** Big numeric/stat values (XP, streak, level). */
  stat: "font-pixel text-[10px]",
} as const

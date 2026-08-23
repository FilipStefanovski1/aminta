// Single design language for the whole extension.
// Every screen pulls colors, radii and spacing from here so nothing drifts.

export const C = {
  bg:         "#1f1f1f", // app background — matches landing --color-ink
  card:       "#242424", // standard card surface — matches landing --color-panel
  cardInner:  "#1a1a1a", // inset surfaces (inputs, wells)
  border:     "#343438", // default border / divider — matches landing --color-line
  borderSoft: "#2a2a2a", // faint inner dividers
  borderHover:"#444448", // hover border
  // Contrast pass: these were tuned too dark against C.bg/C.card (#1f1f1f/
  // #242424), producing gray-on-gray text that was barely legible for
  // normal body copy, descriptions, counters, and placeholders — anything
  // that isn't actually a disabled control. Brightened as one shared scale
  // so every screen reading from C.* picks it up automatically. Disabled
  // controls stay dim via their own opacity modifiers (e.g. Tailwind's
  // disabled:opacity-40), not by a separate darker token.
  text:       "#f5f5f7", // primary text / important headings
  textDim:    "#d8d8dc", // normal body text
  textFaint:  "#aeb0b7", // secondary descriptions
  textGhost:  "#8e919a", // muted / helper text (counters, hints, "(optional)")
  mint:       "#74f7b5", // brand accent
} as const

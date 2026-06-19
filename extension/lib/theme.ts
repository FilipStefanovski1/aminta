// Single design language for the whole extension.
// Every screen pulls colors, radii and spacing from here so nothing drifts.

export const C = {
  bg:         "#1f1f1f", // app background — matches landing --color-ink
  card:       "#242424", // standard card surface — matches landing --color-panel
  cardInner:  "#1a1a1a", // inset surfaces (inputs, wells)
  border:     "#343438", // default border / divider — matches landing --color-line
  borderSoft: "#2a2a2a", // faint inner dividers
  borderHover:"#444448", // hover border
  text:       "#e7e7ef", // primary text
  textDim:    "#8a8a96", // secondary text
  textFaint:  "#55555f", // tertiary / hints
  textGhost:  "#3a3a4a", // disabled / decorative
  mint:       "#74f7b5", // brand accent
} as const

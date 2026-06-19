// Single design language for the whole extension.
// Every screen pulls colors, radii and spacing from here so nothing drifts.

export const C = {
  bg:         "#0d0d0f", // app background
  card:       "#111318", // standard card surface
  cardInner:  "#0a0a0c", // inset surfaces (inputs, wells)
  border:     "#1e2028", // default border / divider
  borderSoft: "#16171d", // faint inner dividers
  borderHover:"#2a2a3a", // hover border
  text:       "#e7e7ef", // primary text
  textDim:    "#8a8a96", // secondary text
  textFaint:  "#55555f", // tertiary / hints
  textGhost:  "#3a3a4a", // disabled / decorative
  mint:       "#74f7b5", // brand accent
} as const

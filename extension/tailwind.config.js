/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./**/*.{tsx,ts}"],
  theme: {
    extend: {
      colors: {
        mint: "#74f7b5",
        ghost: "#74f7b5",   // backward compat
        charcoal: "#0d0d0f",
        panel: "#111318",
        border: "#1e2028",
      },
      fontFamily: {
        pixel: ["'Press Start 2P'", "monospace"],
      }
    }
  },
  plugins: []
}

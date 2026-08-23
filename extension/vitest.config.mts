import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
  // Automatic JSX runtime — needed for .test.tsx files that render real
  // components (see components/LoginScreen.test.tsx). Every component in
  // this codebase is written for the automatic runtime already (no `import
  // React` anywhere) since that's what Plasmo's real build uses; without
  // this, esbuild defaults to the classic runtime here and every component
  // render fails with "React is not defined" under Vitest specifically.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
  },
})

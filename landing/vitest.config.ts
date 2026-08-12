import { defineConfig } from "vitest/config"
import path from "path"

// Unit tests only — pure retention/idempotency logic and the cleanup query
// shape. No jsdom or Next runtime needed; the Supabase client is mocked.
export default defineConfig({
  test: { environment: "node", include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
})

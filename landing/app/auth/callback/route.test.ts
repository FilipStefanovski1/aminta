// Regression suite for the X OAuth production bug: /auth/callback is where
// Supabase lands the browser after it (Supabase) tries to exchange the X
// authorization code for a session. "Unable to exchange external code..."
// (error=server_error&error_code=unexpected_failure) is Supabase's own
// GoTrue error for a failed exchange with the provider (X) — it never
// reaches this route as a `code` param, so this route's job is simply to
// notice there's no usable code and forward the user to /login?error=auth_failed
// rather than hanging or crashing. LoginForm.tsx picks that error param up
// from there and relays it to the extension (see LoginScreen.test.tsx).
import { describe, expect, it, vi } from "vitest"

let exchangeResult: { data: { user: { id: string } | null }; error: { message: string } | null } = {
  data: { user: { id: "user-1" } },
  error: null,
}
const ensureProfileCalls: unknown[] = []

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: async () => exchangeResult,
    },
  }),
}))
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))
vi.mock("@/lib/auth/ensureProfile", () => ({
  ensureProfile: async (user: unknown) => { ensureProfileCalls.push(user) },
}))

const { GET } = await import("./route")

function request(path: string): Parameters<typeof GET>[0] {
  return { url: `https://amintaapp.com${path}` } as Parameters<typeof GET>[0]
}

describe("/auth/callback", () => {
  it("successful exchange + ext_id: hands off to /extension-auth", async () => {
    exchangeResult = { data: { user: { id: "user-1" } }, error: null }
    const res = await GET(request("/auth/callback?code=abc&ext_id=extension123"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://amintaapp.com/extension-auth?ext_id=extension123")
  })

  it("successful exchange, no ext_id: goes to /dashboard", async () => {
    exchangeResult = { data: { user: { id: "user-1" } }, error: null }
    const res = await GET(request("/auth/callback?code=abc"))
    expect(res.headers.get("location")).toBe("https://amintaapp.com/dashboard")
  })

  it("successful exchange with an explicit next destination", async () => {
    exchangeResult = { data: { user: { id: "user-1" } }, error: null }
    const res = await GET(request("/auth/callback?code=abc&next=/welcome"))
    expect(res.headers.get("location")).toBe("https://amintaapp.com/welcome")
  })

  // The actual production bug: Supabase couldn't exchange X's authorization
  // code for a token (bad/rotated client secret, provider-side rejection,
  // etc. — a Supabase/X credential issue, not something this route caused).
  it("provider/code-exchange failure: redirects to /login?error=auth_failed, never crashes or hangs", async () => {
    exchangeResult = { data: { user: null }, error: { message: "Unable to exchange external code: 401" } }
    const res = await GET(request("/auth/callback?code=abc&ext_id=extension123"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://amintaapp.com/login?error=auth_failed")
  })

  it("no code param at all (e.g. the provider redirected here with its own error instead): also redirects to /login?error=auth_failed", async () => {
    const res = await GET(request("/auth/callback?error=server_error&error_code=unexpected_failure"))
    expect(res.headers.get("location")).toBe("https://amintaapp.com/login?error=auth_failed")
  })

  it("a failed exchange never calls ensureProfile — no profile is created/touched for a session that doesn't exist", async () => {
    ensureProfileCalls.length = 0
    exchangeResult = { data: { user: null }, error: { message: "Unable to exchange external code: 401" } }
    await GET(request("/auth/callback?code=abc"))
    expect(ensureProfileCalls).toHaveLength(0)
  })
})

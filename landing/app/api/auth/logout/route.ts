// Global session revocation for the Chrome extension.
//
// The extension previously only cleared its own copy of the tokens on sign
// out (chrome.storage.local) — the underlying Supabase session, and its
// refresh token, stayed valid server-side. A still-open web tab (or the
// extension's own refresh flow, if the tokens were ever reused) could then
// silently rehydrate the "signed out" session. This proxies the same
// revocation landing's own sign-out already gets for free from
// `supabase.auth.signOut()` (browser SDK, default scope "global") — the
// extension has no Supabase client of its own (see lib/auth.ts), so it
// needs a server route to reach the same admin-level revoke.
//
// scope "global" kills every session tied to this account, not just the one
// behind the presented access token — signing out from either surface signs
// out both.
import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * A token that's already invalid/expired means the session is already
 * gone — that's the desired end state, not a failure to report back to the
 * extension (which would otherwise refuse to clear its own local state and
 * leave the user stuck "logged in"). Exported for unit testing — no I/O.
 */
export function isTolerableLogoutError(status: number | undefined): boolean {
  return status === 401 || status === 403
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "").trim()
  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token." }, { status: 400 })
  }

  const service = await createServiceClient()
  const { error } = await service.auth.admin.signOut(accessToken, "global")

  if (error && !isTolerableLogoutError(error.status)) {
    return NextResponse.json({ error: error.message }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}

// Begins the X connection. Returns an authorize URL for the extension to
// open; it never redirects here, because the caller is a Chrome side panel
// rather than a browser navigation.
//
// The state row written here is the entire security model for the callback:
// it binds this authorization attempt to THIS authenticated Aminta user,
// server-side. The callback reads the user from that row and never from the
// query string, so a callback cannot be replayed against another account.
import { NextResponse, type NextRequest } from "next/server"
import { getRequestUser } from "@/lib/auth/requestUser"
import { createServiceClient } from "@/lib/supabase/server"
import { buildAuthorizeUrl, createPkcePair, createState, OAUTH_STATE_TTL_MS } from "@/lib/x/oauth"
import { loadUserEntitlement } from "@/lib/ai/quota"
import { refreshAllowanceFor } from "@/lib/voiceRefresh/allowance"
import { resolvePlanKey } from "@/lib/ai/credits"

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Sign in required.", code: "UNAUTHENTICATED" }, { status: 401 })
  }

  if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET) {
    console.error("[Voice Refresh] X OAuth is not configured")
    return NextResponse.json(
      { error: "Voice Refresh is temporarily unavailable.", code: "X_NOT_CONFIGURED" },
      { status: 503 }
    )
  }

  // Gate the connection itself on entitlement — no reason to let a Free
  // account grant X permissions it could never use.
  const entitlement = await loadUserEntitlement(user.id)
  if (!entitlement) {
    return NextResponse.json({ error: "Account not found.", code: "NOT_ENTITLED" }, { status: 403 })
  }
  const planKey = resolvePlanKey(
    {
      plan: entitlement.plan,
      aiIncludedOverride: entitlement.aiIncludedOverride,
      giftExpiresAt: entitlement.giftExpiresAt,
    },
    new Date()
  )
  if (refreshAllowanceFor(planKey) <= 0) {
    return NextResponse.json(
      { error: "Voice Refresh is available on Pro.", code: "NOT_ENTITLED" },
      { status: 403 }
    )
  }

  const state = createState()
  const { verifier, challenge } = createPkcePair()

  const service = await createServiceClient()
  const { error } = await service.from("x_oauth_states").insert({
    state,
    user_id: user.id,
    code_verifier: verifier,
    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
  })
  if (error) {
    console.error("[Voice Refresh] could not persist OAuth state", { reason: error.message })
    return NextResponse.json({ error: "Could not start connection.", code: "STATE_WRITE_FAILED" }, { status: 500 })
  }

  // The URL contains only the state and the PKCE challenge — never the
  // verifier, which stays server-side.
  return NextResponse.json({ authorizeUrl: buildAuthorizeUrl(state, challenge) })
}

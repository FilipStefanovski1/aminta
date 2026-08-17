// Connection state and disconnect.
//
// GET returns ONLY { connected, username } plus allowance counts. Tokens,
// token expiry, and the X user id are never in a response — the extension has
// no use for them and every one of them is a credential or an identifier we
// promised to keep server-side.
import { NextResponse, type NextRequest } from "next/server"
import { getRequestUser } from "@/lib/auth/requestUser"
import { createServiceClient } from "@/lib/supabase/server"
import { loadUserEntitlement } from "@/lib/ai/quota"
import { getRefreshStatus } from "@/lib/voiceRefresh/allowance"
import { decryptToken } from "@/lib/x/crypto"
import { revokeToken } from "@/lib/x/oauth"

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Sign in required.", code: "UNAUTHENTICATED" }, { status: 401 })
  }

  const service = await createServiceClient()
  const { data: conn } = await service
    .from("x_connections")
    .select("x_username")
    .eq("user_id", user.id)
    .single()

  const entitlement = await loadUserEntitlement(user.id)
  if (!entitlement) {
    return NextResponse.json({ error: "Account not found.", code: "NOT_ENTITLED" }, { status: 403 })
  }

  const status = await getRefreshStatus({
    userId: user.id,
    plan: entitlement.plan,
    aiIncludedOverride: entitlement.aiIncludedOverride,
    giftExpiresAt: entitlement.giftExpiresAt,
    creemPeriodStart: entitlement.creemPeriodStart,
    creemPeriodEnd: entitlement.creemPeriodEnd,
    createdAt: entitlement.createdAt,
  })

  return NextResponse.json({
    connected: !!conn,
    username: conn?.x_username ?? null,
    entitled: status.entitled,
    remaining: status.remaining,
    allowance: status.allowance,
    period_end: status.periodEnd,
    last_refresh_at: status.lastRefreshAt,
  })
}

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Sign in required.", code: "UNAUTHENTICATED" }, { status: 401 })
  }

  const service = await createServiceClient()
  const { data: conn } = await service
    .from("x_connections")
    .select("access_token_cipher")
    .eq("user_id", user.id)
    .single()

  // Best effort: tell X to drop the grant. Deletion proceeds regardless —
  // the user asked to disconnect, and leaving credentials behind because a
  // revoke call failed would be the wrong failure mode.
  if (conn?.access_token_cipher) {
    try { await revokeToken(decryptToken(conn.access_token_cipher)) } catch { /* ignore */ }
  }

  await service.from("x_connections").delete().eq("user_id", user.id)

  // Allowance history is deliberately kept: it holds counts only, no X
  // content, and deleting it would let a user reset their allowance by
  // disconnecting and reconnecting.
  return NextResponse.json({ connected: false })
}

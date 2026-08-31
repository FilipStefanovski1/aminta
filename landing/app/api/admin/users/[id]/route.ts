// Admin actions on a single account — downgrade to free, grant/revoke a
// gifted-AI window, ban/unban (revoke login access), and delete. Everything
// here mirrors an EXISTING, already-safe mechanism instead of inventing a
// new one:
//   - downgrade_to_free / grant_gift / revoke_gift write the same fields
//     lib/entitlements.ts and lib/ai/credits.ts already read (ai_included_
//     override + gift_expires_at is the real "gifted" mechanism — see
//     credits.ts's resolvePlanKey/isGiftActive), never a fabricated
//     plan="pro" with no real purchase behind it.
//   - ban/unban uses GoTrue's own ban_duration field (blocks future
//     logins/refreshes; does not force-expire an already-issued short-lived
//     access token, same limitation any Supabase-based app has).
//   - delete reuses app/api/account/route.ts's blocksDeletion() gate, so an
//     admin can't orphan an actively-renewing subscription any more easily
//     than the user themselves could.
import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/auth/requireAdmin"
import { createServiceClient } from "@/lib/supabase/server"
import { decryptToken } from "@/lib/x/crypto"
import { revokeToken } from "@/lib/x/oauth"
import { blocksDeletion } from "@/app/api/account/route"

const GIFT_DURATIONS_DAYS = new Set([7, 30, 90])

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const { id: targetId } = await ctx.params
  let body: { action?: string; days?: number }
  try { body = await request.json() } catch { body = {} }

  if (targetId === admin.id && (body.action === "ban" || body.action === "delete")) {
    return NextResponse.json({ error: "You can't ban or delete your own admin account from here." }, { status: 400 })
  }

  const service = await createServiceClient()

  switch (body.action) {
    case "downgrade_to_free": {
      const { error } = await service.from("users")
        .update({ plan: "free", subscription_status: null })
        .eq("id", targetId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case "grant_gift": {
      const days = body.days
      if (!days || !GIFT_DURATIONS_DAYS.has(days)) {
        return NextResponse.json({ error: "days must be 7, 30, or 90." }, { status: 400 })
      }
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await service.from("users")
        .update({ ai_included_override: true, gift_expires_at: expiresAt })
        .eq("id", targetId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case "revoke_gift": {
      const { error } = await service.from("users")
        .update({ ai_included_override: false, gift_expires_at: null })
        .eq("id", targetId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case "ban": {
      const { error } = await service.auth.admin.updateUserById(targetId, { ban_duration: "876000h" })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case "unban": {
      const { error } = await service.auth.admin.updateUserById(targetId, { ban_duration: "none" })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const { id: targetId } = await ctx.params
  if (targetId === admin.id) {
    return NextResponse.json({ error: "You can't delete your own admin account from here." }, { status: 400 })
  }

  let body: { confirm?: string }
  try { body = await request.json() } catch { body = {} }
  if (body.confirm !== "DELETE") {
    return NextResponse.json({ error: 'Type "DELETE" to confirm.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: profile } = await service.from("users")
    .select("plan, subscription_status")
    .eq("id", targetId)
    .single()

  if (blocksDeletion(profile?.plan, profile?.subscription_status)) {
    return NextResponse.json(
      { error: "This account has an active/trialing Pro subscription that will keep renewing. It must be canceled in Creem before it can be deleted." },
      { status: 409 }
    )
  }

  const { data: conn } = await service.from("x_connections")
    .select("access_token_cipher")
    .eq("user_id", targetId)
    .single()
  if (conn?.access_token_cipher) {
    try { await revokeToken(decryptToken(conn.access_token_cipher)) } catch { /* best-effort */ }
  }

  const { error } = await service.auth.admin.deleteUser(targetId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}

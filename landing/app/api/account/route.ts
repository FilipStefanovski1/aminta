// Real account deletion — not a sign-out. Deletes auth.users, which
// cascades to public.users and every table that references it (ON DELETE
// CASCADE): user_credits, credit_ledger, x_connections, x_oauth_states,
// voice_refresh_balance, voice_refresh_ledger, ai_usage_log,
// ai_inflight_requests, aminta_state. See supabase-setup.sql /
// supabase-migration-*.sql for the FK chain this relies on.
//
// BILLING: this codebase has no outbound Creem API client anywhere (only
// an inbound webhook receiver, app/api/webhooks/creem/route.ts) — there is
// no code path here that can call Creem to cancel a subscription. Rather
// than silently delete the account and leave an ACTIVELY RENEWING
// subscription charging a now-deleted user forever, deletion is refused
// for any account with subscription_status "active" or "trialing" (still
// due to renew) until the user cancels through Creem first — a "canceled"
// subscription (already won't renew, access just runs out the clock) or a
// Founder/lifetime one-time purchase (nothing recurring) is safe to delete
// immediately.
import { NextResponse, type NextRequest } from "next/server"
import { getRequestUser } from "@/lib/auth/requestUser"
import { createServiceClient } from "@/lib/supabase/server"
import { decryptToken } from "@/lib/x/crypto"
import { revokeToken } from "@/lib/x/oauth"

const RENEWING_STATUSES = new Set(["active", "trialing"])

/** Exported for unit testing — the actual gate condition, no I/O. */
export function blocksDeletion(plan: string | null | undefined, subscriptionStatus: string | null | undefined): boolean {
  return plan === "pro" && RENEWING_STATUSES.has(subscriptionStatus ?? "")
}

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Sign in required.", code: "UNAUTHENTICATED" }, { status: 401 })
  }

  let body: { confirm?: string }
  try { body = await request.json() } catch { body = {} }
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Type "DELETE" to confirm — this permanently removes your account.', code: "CONFIRMATION_REQUIRED" },
      { status: 400 }
    )
  }

  const service = await createServiceClient()

  const { data: profile } = await service
    .from("users")
    .select("plan, subscription_status")
    .eq("id", user.id)
    .single()

  if (blocksDeletion(profile?.plan, profile?.subscription_status)) {
    return NextResponse.json(
      {
        error: "You have an active Pro subscription that will keep renewing. Cancel your subscription first, then delete your account.",
        code: "ACTIVE_SUBSCRIPTION",
      },
      { status: 409 }
    )
  }

  // Best-effort X revoke — deletion proceeds regardless (matches the
  // existing disconnect endpoint's behavior; a failed revoke call must
  // never block permanently removing the account).
  const { data: conn } = await service
    .from("x_connections")
    .select("access_token_cipher")
    .eq("user_id", user.id)
    .single()
  if (conn?.access_token_cipher) {
    try { await revokeToken(decryptToken(conn.access_token_cipher)) } catch { /* ignore */ }
  }

  // Deletes auth.users — public.users (ON DELETE CASCADE from auth.users)
  // and everything referencing public.users cascades from this one call.
  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) {
    console.error("[Account] deletion failed", { userId: user.id, reason: error.message })
    return NextResponse.json(
      { error: "Couldn't delete your account. Please try again or contact support.", code: "DELETE_FAILED" },
      { status: 500 }
    )
  }

  return NextResponse.json({ deleted: true })
}

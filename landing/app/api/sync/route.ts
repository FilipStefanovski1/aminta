import { createServerClient } from "@supabase/ssr"
import { createServiceClient } from "@/lib/supabase/server"
import { getRefreshStatus } from "@/lib/voiceRefresh/allowance"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { aiIncluded } from "@/lib/entitlements"
import { getCreditStatus } from "@/lib/ai/creditService"

async function getUser(request: NextRequest) {
  // Support both cookie-based sessions (web) and Bearer token (extension)
  const authHeader = request.headers.get("authorization")
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
      global: authHeader
        ? { headers: { Authorization: authHeader } }
        : undefined,
    },
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user, error }
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await getUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("aminta_state")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch plan from users table using service role (bypasses RLS).
  // subscription_status travels alongside plan so the extension's
  // hasProAccess() can make the same entitlement decision the dashboard and
  // pricing page make — without it, the extension has no way to know a
  // "pro" row is actually past its paid period until the webhook flips
  // `plan` back to "free" on subscription.expired.
  const service = await createServiceClient()
  const { data: profile } = await service
    .from("users")
    .select("plan, subscription_status, ai_included_override, gift_expires_at, current_period_start, current_period_end, created_at")
    .eq("id", user.id)
    .single()

  // Credit balance for the Settings/usage display. Read-only — getCreditStatus
  // never writes, but it applies the same period logic as the reservation
  // path so a user whose period rolled sees a full balance rather than last
  // period's leftovers.
  const credits = await getCreditStatus({
    userId: user.id,
    plan: profile?.plan ?? "free",
    aiIncludedOverride: profile?.ai_included_override ?? false,
    giftExpiresAt: profile?.gift_expires_at ?? null,
    creemPeriodStart: profile?.current_period_start ?? null,
    creemPeriodEnd: profile?.current_period_end ?? null,
    createdAt: profile?.created_at ?? null,
  })

  // Voice Refresh state. Read-only, same lazy-period logic as credits, and a
  // separate allowance — a Voice Refresh costs 0 Included AI credits.
  // The X username is returned for display; the access token, refresh token
  // and X user id never leave the server.
  const refreshCtx = {
    userId: user.id,
    plan: profile?.plan ?? "free",
    aiIncludedOverride: profile?.ai_included_override ?? false,
    giftExpiresAt: profile?.gift_expires_at ?? null,
  }
  const [voiceRefresh, xConn] = await Promise.all([
    getRefreshStatus(refreshCtx),
    service.from("x_connections").select("x_username, x_display_name, x_avatar_url").eq("user_id", user.id).maybeSingle()
      .then((r) => r.data, () => null),
  ])

  // ai_included is the ONE canonical entitlement field the extension should
  // route Included-AI generation on — it's aiIncluded() from
  // lib/entitlements.ts, not a re-derivation. A gifted user (plan='free',
  // ai_included_override=true) is aiIncluded=true here even though
  // hasProAccess() alone would say no; the extension used to route purely
  // on hasProAccess() and would silently keep gifted users on BYOK even
  // though the backend would have authorized them.
  return NextResponse.json({
    ...(data ?? {}),
    plan: profile?.plan ?? "free",
    subscription_status: profile?.subscription_status ?? null,
    // Under the credit model every signed-in account can use Included AI —
    // free accounts included, funded by their smaller daily allowance. The
    // gate is the credit balance, not the plan, so this is now true for
    // everyone and the extension shows the Included/My API Key choice to
    // all signed-in users.
    ai_included: true,
    // Whether they're on a PAID included tier. Kept distinct from
    // ai_included so the UI can still tell free from Pro/Founder/gifted
    // (e.g. which zero-credit message and CTA to show).
    ai_included_paid: aiIncluded({
      plan: profile?.plan ?? "free",
      subscription_status: profile?.subscription_status ?? null,
      ai_included_override: profile?.ai_included_override ?? false,
    }),
    credits_balance: credits.balance,
    credits_allowance: credits.allowance,
    credits_period_end: credits.periodEnd,
    credits_period_kind: credits.periodKind,
    credits_plan_key: credits.planKey,
    x_connected: !!xConn,
    x_username: xConn?.x_username ?? null,
    x_display_name: xConn?.x_display_name ?? null,
    x_avatar_url: xConn?.x_avatar_url ?? null,
    voice_refresh_eligible: voiceRefresh.eligible,
    voice_refresh_next_eligible_at: voiceRefresh.nextEligibleAt,
    last_voice_refresh_at: voiceRefresh.lastRefreshAt,
  })
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()

  const { error } = await supabase
    .from("aminta_state")
    .upsert({ ...body, user_id: user.id, updated_at: new Date().toISOString() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

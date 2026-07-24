import { createServerClient } from "@supabase/ssr"
import { createServiceClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { aiIncluded } from "@/lib/entitlements"

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
    .select("plan, subscription_status, ai_included_override")
    .eq("id", user.id)
    .single()

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
    ai_included: aiIncluded({
      plan: profile?.plan ?? "free",
      subscription_status: profile?.subscription_status ?? null,
      ai_included_override: profile?.ai_included_override ?? false,
    }),
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

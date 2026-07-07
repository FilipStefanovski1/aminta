import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

// Idempotent: guarantees public.users + aminta_state exist for every account
// that completes OAuth or email confirmation — no partial accounts.
async function ensureProfile(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  try {
    const service = await createServiceClient()
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ?? ""
    await Promise.all([
      service.from("users").upsert(
        { id: user.id, email: user.email, plan: "free" },
        { onConflict: "id", ignoreDuplicates: true }
      ),
      service.from("aminta_state").upsert(
        { user_id: user.id, xp: 0, streak: 0, generations_total: 0, display_name: fullName || null },
        { onConflict: "user_id", ignoreDuplicates: true }
      ),
    ])
  } catch { /* non-fatal — the dashboard self-heals aminta_state */ }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (code) {
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
      },
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (data.user) await ensureProfile(data.user)

      // Extension flow — hand off to extension-auth page
      const extId = searchParams.get("ext_id")
      if (extId) {
        return NextResponse.redirect(`${origin}/extension-auth?ext_id=${extId}`)
      }
      // Web flow — go to dashboard (unless a specific next was requested)
      const dest = next === "/" ? "/dashboard" : next
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}

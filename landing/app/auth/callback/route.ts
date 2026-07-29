import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { ensureProfile } from "@/lib/auth/ensureProfile"

const isDev = process.env.NODE_ENV !== "production"

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
        if (isDev) console.log("[auth/callback] auth callback destination: /extension-auth (ext_id:", extId, ")")
        return NextResponse.redirect(`${origin}/extension-auth?ext_id=${extId}`)
      }
      // Web flow — go to dashboard (unless a specific next was requested)
      const dest = next === "/" ? "/dashboard" : next
      if (isDev) console.log("[auth/callback] auth callback destination:", dest)
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  if (isDev) console.log("[auth/callback] auth callback destination: /login?error=auth_failed")
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}

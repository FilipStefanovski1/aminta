import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  const { idToken } = await request.json()
  if (!idToken) return NextResponse.json({ error: "Missing idToken" }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  })

  if (error || !data.session) {
    return NextResponse.json({ error: error?.message ?? "Auth failed" }, { status: 401 })
  }

  return NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId: data.session.user.id,
    email: data.session.user.email,
  })
}

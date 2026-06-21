import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  const { accessToken } = await request.json()
  if (!accessToken) return NextResponse.json({ error: "Missing accessToken" }, { status: 400 })

  // Verify the access token and get user info from Google
  const googleRes = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${accessToken}`)
  if (!googleRes.ok) return NextResponse.json({ error: "Invalid Google token" }, { status: 401 })

  const googleUser = await googleRes.json()
  if (googleUser.error) return NextResponse.json({ error: googleUser.error }, { status: 401 })

  const email: string = googleUser.email
  const googleId: string = googleUser.sub

  // Use service role to find or create user
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Check if user exists
  const { data: existingUsers } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .limit(1)

  let userId: string

  if (existingUsers && existingUsers.length > 0) {
    userId = existingUsers[0].id
  } else {
    // Create auth user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { google_id: googleId, full_name: googleUser.name },
    })
    if (createError || !newUser.user) {
      return NextResponse.json({ error: createError?.message ?? "Failed to create user" }, { status: 500 })
    }
    userId = newUser.user.id
  }

  // Generate a magic link and extract tokens from it
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  })
  if (linkError || !linkData.properties) {
    return NextResponse.json({ error: linkError?.message ?? "Failed to generate session" }, { status: 500 })
  }

  // Exchange the OTP for a real session
  const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: "email",
  })
  if (sessionError || !sessionData.session) {
    return NextResponse.json({ error: sessionError?.message ?? "Failed to create session" }, { status: 500 })
  }

  return NextResponse.json({
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
    userId,
    email,
  })
}

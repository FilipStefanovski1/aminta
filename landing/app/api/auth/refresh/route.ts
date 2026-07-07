import { NextResponse, type NextRequest } from "next/server"

// Exchanges a Supabase refresh token for a fresh session on behalf of the
// Chrome extension. The extension holds no Supabase project config — it only
// talks to amintaapp.com — so this route proxies the token grant.
//
// Responses:
//   200 { access_token, refresh_token, user: { id, email } }
//   400/401 — refresh token invalid or expired (caller must re-authenticate)
//   5xx — transient; caller should keep its session and retry later
export async function POST(request: NextRequest) {
  let refreshToken: string | undefined
  try {
    const body = await request.json()
    refreshToken = body?.refresh_token
  } catch {
    /* fall through to 400 */
  }
  if (!refreshToken) {
    return NextResponse.json({ error: "Missing refresh_token" }, { status: 400 })
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }
  )

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error_description ?? data?.msg ?? "Refresh failed" },
      { status: res.status === 400 || res.status === 401 ? 401 : 502 }
    )
  }

  return NextResponse.json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: { id: data.user?.id, email: data.user?.email },
  })
}

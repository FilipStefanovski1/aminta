import { createServerClient } from "@supabase/ssr"
import { createServiceClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

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

  // Fetch plan from users table using service role (bypasses RLS)
  const service = await createServiceClient()
  const { data: profile } = await service
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .single()

  return NextResponse.json({ ...(data ?? {}), plan: profile?.plan ?? "free" })
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

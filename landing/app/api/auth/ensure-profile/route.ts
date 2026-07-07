import { createClient, createServiceClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Guarantees a fully-formed account for the signed-in user:
//   public.users   — row with default plan
//   aminta_state   — row with default XP / streak / missions
//
// Idempotent: inserts use ON CONFLICT DO NOTHING, so existing progress and
// plan are never touched. Called after every signup/signin and from the
// OAuth/email-confirmation callback, so no auth path can produce a partial
// account.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()

  const fullName: string =
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""

  const [usersRes, stateRes] = await Promise.all([
    service.from("users").upsert(
      { id: user.id, email: user.email, plan: "free" },
      { onConflict: "id", ignoreDuplicates: true }
    ),
    service.from("aminta_state").upsert(
      {
        user_id: user.id,
        xp: 0,
        streak: 0,
        generations_total: 0,
        display_name: fullName || null,
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    ),
  ])

  if (usersRes.error || stateRes.error) {
    return NextResponse.json(
      { error: usersRes.error?.message ?? stateRes.error?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}

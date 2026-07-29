import { createClient } from "@/lib/supabase/server"
import { ensureProfile } from "@/lib/auth/ensureProfile"
import { NextResponse } from "next/server"

// Thin HTTP wrapper around the shared ensureProfile() — see
// lib/auth/ensureProfile.ts for what it actually guarantees/enriches.
// Called after every email/password signin and signup; the OAuth/
// email-confirmation callback calls the same shared function directly
// (see app/auth/callback/route.ts) rather than hitting this endpoint.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const result = await ensureProfile(user)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

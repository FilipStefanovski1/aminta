// Bearer-or-cookie user resolution for API routes.
//
// Mirrors the getUser() already inlined in app/api/generate/route.ts. Kept as
// a separate helper rather than refactoring that route to use it: /api/generate
// is the endpoint we just stabilized, and there is no reason to touch it to
// add a feature elsewhere.
//
// Note this uses createClient() (anon key + cookies) — the AUTHENTICATED user
// client. It must never be swapped for createServiceClient(), which bypasses
// RLS and has no business validating a session.
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import type { User } from "@supabase/supabase-js"

export async function getRequestUser(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get("authorization")
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

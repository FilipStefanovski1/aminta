import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* called from Server Component — middleware handles refresh */ }
        },
      },
    },
  )
}

/**
 * Server-only service-role client. Bypasses RLS, so it must never be
 * reachable from a browser and must never carry a user's identity.
 *
 * Deliberately NOT createServerClient() from @supabase/ssr: that variant
 * takes a cookie adapter, and supabase-js resolves its auth header as
 * `session?.access_token ?? supabaseKey` (SupabaseClient._getAccessToken).
 * Once anything in the request has authenticated — /api/generate's own
 * getUser() writes the session into the very same cookie jar — the session
 * wins and this "service" client silently runs as that user. RLS then hides
 * every internal row: ai_config's singleton returned 0 rows, .single()
 * raised PGRST116, getAiConfig() failed closed, and Included AI 403'd for
 * every paying account while the kill switch was on the whole time.
 *
 * createClient() with no cookie adapter and no session persistence has no
 * session to find, so the service key is always the credential. The auth
 * flags are belt-and-braces for the same reason: nothing here should ever
 * acquire, refresh, or store a session.
 *
 * Stays async purely so existing `await createServiceClient()` call sites
 * keep working unchanged.
 */
export async function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}

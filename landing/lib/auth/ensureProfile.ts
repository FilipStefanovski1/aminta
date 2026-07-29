import { createServiceClient } from "@/lib/supabase/server"
import { deriveDisplayName, deriveAvatarUrl } from "@/lib/auth/profileDefaults"

export interface EnsureProfileUser {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

// The single implementation of profile repair + enrichment, called from both
// auth/callback/route.ts (OAuth/email-confirmation) and
// api/auth/ensure-profile/route.ts (client-triggered, email/password login
// and signup). Previously each route inlined its own near-identical copy.
//
// Two distinct responsibilities, in order:
//
// 1. Guarantee existence — a repair path only. The DB trigger
//    (handle_new_user(), see supabase-migration-x-first-profiles.sql)
//    already creates both rows synchronously for every new signup; this
//    upsert only matters for accounts created before that trigger existed,
//    or the rare case a trigger run failed. ON CONFLICT DO NOTHING, so it
//    never touches an existing row's values.
//
// 2. Enrich — decide what a good display_name/avatar_url actually is, and
//    fill them in ONLY where they're still at their "never set" value
//    (display_name = '', avatar_url IS NULL). This is what makes it safe to
//    run on every single login/signup without risk of clobbering a value
//    a previous run already established, or the user edits in the future
//    (once profile editing exists) — this function only ever moves a field
//    from "unset" to "set", never overwrites "set" with a different value.
export async function ensureProfile(user: EnsureProfileUser): Promise<{ error?: string }> {
  try {
    const service = await createServiceClient()
    const displayName = deriveDisplayName(user.user_metadata)
    const avatarUrl = deriveAvatarUrl(user.user_metadata)

    const [usersRes, stateRes] = await Promise.all([
      service.from("users").upsert(
        { id: user.id, email: user.email ?? null, plan: "free" },
        { onConflict: "id", ignoreDuplicates: true }
      ),
      service.from("aminta_state").upsert(
        { user_id: user.id, xp: 0, streak: 0, generations_total: 0 },
        { onConflict: "user_id", ignoreDuplicates: true }
      ),
    ])
    if (usersRes.error || stateRes.error) {
      return { error: usersRes.error?.message ?? stateRes.error?.message }
    }

    await Promise.all([
      service.from("aminta_state")
        .update({ display_name: displayName })
        .eq("user_id", user.id)
        .eq("display_name", ""),
      avatarUrl
        ? service.from("users")
            .update({ avatar_url: avatarUrl })
            .eq("id", user.id)
            .is("avatar_url", null)
        : Promise.resolve(null),
    ])

    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : "ensureProfile failed" }
  }
}

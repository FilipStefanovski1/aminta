// Metadata fallbacks used by ensureProfile() (lib/auth/ensureProfile.ts) —
// the single place that owns deriving a good display name/avatar for a
// profile. This is deliberately NOT duplicated into the database trigger:
// the trigger only guarantees the rows exist (see
// supabase-migration-x-first-profiles.sql); deciding what a good value
// actually IS is application logic, kept here so it's one implementation
// regardless of which route calls ensureProfile().
//
// Order: full name > username/handle > neutral default. Never touches
// email — email presence has no bearing on what name to show, and an X
// user may have none at all.
export function deriveDisplayName(metadata: Record<string, unknown> | undefined | null): string {
  const pick = (key: string): string | undefined => {
    const v = metadata?.[key]
    return typeof v === "string" && v.trim() ? v.trim() : undefined
  }

  return (
    pick("full_name") ??
    pick("name") ??
    pick("preferred_username") ??
    pick("user_name") ??
    "Aminta user"
  )
}

// GoTrue normalizes most providers' profile image into `avatar_url`; a few
// (X included) also populate the more generic OIDC-style `picture` field.
// Returns null (not '') when nothing is available — public.users.avatar_url
// is a nullable column with no default, so null is the real "not set" value,
// distinct from an empty string that would read as "explicitly cleared."
export function deriveAvatarUrl(metadata: Record<string, unknown> | undefined | null): string | null {
  const pick = (key: string): string | undefined => {
    const v = metadata?.[key]
    return typeof v === "string" && v.trim() ? v.trim() : undefined
  }

  return pick("avatar_url") ?? pick("picture") ?? null
}

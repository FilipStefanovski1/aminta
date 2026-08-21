import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import DashboardClient from "@/components/DashboardClient"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: state }, { data: profile }] = await Promise.all([
    supabase.from("aminta_state").select("*").eq("user_id", user.id).single(),
    supabase.from("users").select("plan, subscription_status").eq("id", user.id).single(),
  ])

  // Create a default row if none exists so extension upserts land on an
  // existing row and the dashboard is never stuck at 0 XP on first visit.
  if (!state) {
    await supabase.from("aminta_state").upsert(
      { user_id: user.id, xp: 0, streak: 0, generations_total: 0 },
      { onConflict: "user_id" }
    )
  }

  // Which auth providers are actually attached to this account.
  // user.identities is the authoritative list (one row per linked provider);
  // app_metadata mirrors it and covers older sessions where identities may be
  // absent. Deduped into a set so an account with several linked identities —
  // the direction Supabase's linkIdentity() enables — reports each provider
  // once. Password management keys off this, never off "does an email exist":
  // a Google or X account can carry an email and still have no password.
  const providers = Array.from(
    new Set(
      [
        ...(user.identities ?? []).map((i) => i.provider),
        ...((user.app_metadata?.providers as string[] | undefined) ?? []),
        ...(user.app_metadata?.provider ? [user.app_metadata.provider as string] : []),
      ].filter(Boolean)
    )
  )

  return (
    <>
      <Navbar alwaysVisible />
      <main className="flex-1">
        <DashboardClient
          user={{
            id: user.id,
            email: user.email ?? "",
            name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? "",
            avatarUrl: user.user_metadata?.avatar_url ?? "",
            // X supplies a handle but may supply no email at all; it's the
            // display fallback that keeps the profile block populated.
            username:
              user.user_metadata?.preferred_username ??
              user.user_metadata?.user_name ??
              "",
            providers,
          }}
          xp={state?.xp ?? 0}
          streak={state?.streak ?? 0}
          generationsTotal={state?.generations_total ?? 0}
          dnaCount={(state?.tweet_dna ?? []).length}
          // Raw values + date: "is this today?" is decided client-side in the
          // user's LOCAL timezone (the extension writes local dates too).
          missionDate={state?.mission_date ?? null}
          missionModes={state?.mission_modes ?? { tweet: false, reply: false, polish: false }}
          plan={profile?.plan ?? "free"}
          subscriptionStatus={profile?.subscription_status ?? null}
          hasState={!!state}
          lastSyncedAt={state?.updated_at ?? null}
        />
      </main>
      <Footer />
    </>
  )
}

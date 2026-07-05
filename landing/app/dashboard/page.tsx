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
    supabase.from("users").select("plan").eq("id", user.id).single(),
  ])

  // Create a default row if none exists so extension upserts land on an
  // existing row and the dashboard is never stuck at 0 XP on first visit.
  if (!state) {
    await supabase.from("aminta_state").upsert(
      { user_id: user.id, xp: 0, streak: 0, generations_total: 0 },
      { onConflict: "user_id" }
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const isMissionToday = state?.mission_date === today

  return (
    <>
      <Navbar alwaysVisible />
      <main className="flex-1">
        <DashboardClient
          user={{
            email: user.email ?? "",
            name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? "",
            avatarUrl: user.user_metadata?.avatar_url ?? "",
          }}
          xp={state?.xp ?? 0}
          streak={state?.streak ?? 0}
          generationsTotal={state?.generations_total ?? 0}
          dnaCount={(state?.tweet_dna ?? []).length}
          missionGenerates={isMissionToday ? (state?.mission_generates ?? 0) : 0}
          missionPublished={isMissionToday ? (state?.mission_published ?? 0) : 0}
          plan={profile?.plan ?? "free"}
        />
      </main>
      <Footer />
    </>
  )
}

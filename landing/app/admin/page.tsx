import { createClient, createServiceClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/auth/isAdmin"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import AdminTable from "./AdminTable"

export const dynamic = "force-dynamic"

const card: React.CSSProperties = {
  background: "#1a1a1a",
  border: "2px solid #2a2a2a",
  boxShadow: "3px 3px 0 #000",
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never"
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// Most-recent of several nullable ISO timestamps — used to sort the table by
// "whatever this person did last," whether that was a login, an extension
// sync, or an AI generation.
function latest(...isos: (string | null | undefined)[]): string | null {
  const times = isos.filter(Boolean).map((s) => new Date(s as string).getTime())
  if (times.length === 0) return null
  return new Date(Math.max(...times)).toISOString()
}

export interface Row {
  id: string
  email: string
  plan: string
  subscriptionStatus: string | null
  createdAt: string
  lastSignInAt: string | null
  lastSyncedAt: string | null
  xp: number
  streak: number
  lastAiActivityAt: string | null
  aiCalls7d: number
  lastActivity: string | null
  bannedUntil: string | null
  giftActive: boolean
}

async function loadOverview(): Promise<Row[]> {
  const service = await createServiceClient()

  // public.users owns email/plan (populated by the handle_new_user trigger
  // on signup — see supabase-setup.sql). Capped at 500: this is an internal
  // tool for a small user base, not a paginated admin product yet.
  const [{ data: users }, { data: authList }, { data: states }] = await Promise.all([
    service.from("users")
      .select("id, email, plan, subscription_status, created_at, ai_included_override, gift_expires_at")
      .order("created_at", { ascending: false })
      .limit(500),
    service.auth.admin.listUsers({ perPage: 500 }),
    service.from("aminta_state").select("user_id, updated_at, xp, streak"),
  ])

  const authById = new Map((authList?.users ?? []).map((u) => [u.id, u]))
  const stateById = new Map((states ?? []).map((s) => [s.user_id, s]))

  const ids = (users ?? []).map((u) => u.id)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentLogs } = ids.length
    ? await service.from("ai_usage_log")
        .select("user_id, created_at")
        .in("user_id", ids)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
    : { data: [] as { user_id: string; created_at: string }[] }

  const aiById = new Map<string, { last: string; count: number }>()
  for (const log of recentLogs ?? []) {
    const existing = aiById.get(log.user_id)
    if (existing) existing.count += 1
    else aiById.set(log.user_id, { last: log.created_at, count: 1 })
  }

  const rows: Row[] = (users ?? []).map((u) => {
    const state = stateById.get(u.id)
    const ai = aiById.get(u.id)
    const authUser = authById.get(u.id)
    const lastSignInAt = authUser?.last_sign_in_at ?? null
    // Mirrors lib/ai/credits.ts's isGiftActive(): no expiry set counts as
    // active, a future expiry counts as active, a past one doesn't.
    const giftActive = !!u.ai_included_override && (!u.gift_expires_at || Date.parse(u.gift_expires_at) > Date.now())
    return {
      id: u.id,
      email: u.email ?? "(no email)",
      plan: u.plan,
      subscriptionStatus: u.subscription_status,
      createdAt: u.created_at,
      lastSignInAt,
      lastSyncedAt: state?.updated_at ?? null,
      xp: state?.xp ?? 0,
      streak: state?.streak ?? 0,
      lastAiActivityAt: ai?.last ?? null,
      aiCalls7d: ai?.count ?? 0,
      lastActivity: latest(lastSignInAt, state?.updated_at, ai?.last),
      bannedUntil: authUser?.banned_until && authUser.banned_until !== "none" ? authUser.banned_until : null,
      giftActive,
    }
  })

  rows.sort((a, b) => {
    if (!a.lastActivity && !b.lastActivity) return 0
    if (!a.lastActivity) return 1
    if (!b.lastActivity) return -1
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  })

  return rows
}

interface UsageRow {
  generation_mode: string
  status: string
  created_at: string
}

async function loadUserDetail(userId: string): Promise<UsageRow[]> {
  const service = await createServiceClient()
  const { data } = await service.from("ai_usage_log")
    .select("generation_mode, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)
  return data ?? []
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) redirect("/")

  const { user: selectedUserId } = await searchParams
  const [rows, detail] = await Promise.all([
    loadOverview(),
    selectedUserId ? loadUserDetail(selectedUserId) : Promise.resolve(null),
  ])
  const selected = selectedUserId ? rows.find((r) => r.id === selectedUserId) ?? null : null

  return (
    <>
      <Navbar alwaysVisible />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-5 pt-32 pb-20">
          <div className="mb-8">
            <h1 className="font-pixel text-lg text-white">Admin</h1>
            <p className="mt-2 text-muted text-sm">
              {rows.length} account{rows.length === 1 ? "" : "s"} — sorted by most recent activity (login, extension sync, or AI generation).
            </p>
          </div>

          {selected && (
            <div style={card} className="p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white font-semibold">{selected.email}</p>
                  <p className="text-xs text-muted mt-0.5">{selected.id}</p>
                </div>
                <a href="/admin" className="text-xs text-muted hover:text-white">← back to all accounts</a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Plan", value: selected.plan },
                  { label: "Last sign-in", value: relativeTime(selected.lastSignInAt) },
                  { label: "Last synced", value: relativeTime(selected.lastSyncedAt) },
                  { label: "XP / Streak", value: `${selected.xp} · ${selected.streak}d` },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-1 py-3" style={{ background: "#222", border: "1px solid #2a2a2a" }}>
                    <span className="font-pixel text-[8px] text-white">{s.value}</span>
                    <span className="font-pixel text-[7px] text-muted">{s.label}</span>
                  </div>
                ))}
              </div>
              <p className="font-pixel text-[9px] tracking-widest uppercase text-muted mb-2">
                Recent AI activity (last 50)
              </p>
              {detail && detail.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted text-xs">
                        <th className="pb-2 font-normal">Mode</th>
                        <th className="pb-2 font-normal">Status</th>
                        <th className="pb-2 font-normal">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.map((row, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #2a2a2a" }}>
                          <td className="py-2 text-white">{row.generation_mode}</td>
                          <td className="py-2" style={{ color: row.status === "error" ? "#ff6a4d" : "#9a9aa3" }}>{row.status}</td>
                          <td className="py-2 text-muted">{relativeTime(row.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted">No AI activity in the logged window.</p>
              )}
            </div>
          )}

          <AdminTable rows={rows} adminId={user.id} />
        </div>
      </main>
      <Footer />
    </>
  )
}

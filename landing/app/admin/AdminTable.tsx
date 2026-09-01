"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { Row } from "./page"

type SortKey = "email" | "plan" | "lastSignInAt" | "lastSyncedAt" | "aiCalls7d" | "xp" | "createdAt"
type RangeFilter = "any" | "24h" | "7d" | "30d" | "never"

const RANGE_MS: Record<Exclude<RangeFilter, "any" | "never">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
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

function withinRange(iso: string | null, range: RangeFilter): boolean {
  if (range === "any") return true
  if (range === "never") return iso === null
  if (iso === null) return false
  return Date.now() - new Date(iso).getTime() <= RANGE_MS[range]
}

const rangeSelectClass = "bg-transparent border rounded px-1.5 py-1 text-xs text-muted"
const rangeSelectStyle = { borderColor: "#2a2a2a" } as const

// th/td both get this — the extra horizontal room is what separates the
// columns; py-2 alone left everything crammed edge-to-edge.
const CELL = "py-2 px-3"

const PLAN_COLOR: Record<string, string> = {
  pro: "#fbbf24",      // amber
  lifetime: "#a78bfa", // violet
  free: "#8e919a",     // neutral gray — not a "bad" state, just the default
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${color}1f`, color, border: `1px solid ${color}55` }}>
      {label}
    </span>
  )
}

function RangeSelect({ value, onChange }: { value: RangeFilter; onChange: (v: RangeFilter) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as RangeFilter)} className={rangeSelectClass} style={rangeSelectStyle}>
      <option value="any">Any time</option>
      <option value="24h">Last 24h</option>
      <option value="7d">Last 7d</option>
      <option value="30d">Last 30d</option>
      <option value="never">Never</option>
    </select>
  )
}

export default function AdminTable({ rows, adminId }: { rows: Row[]; adminId: string }) {
  const router = useRouter()
  const [emailQuery, setEmailQuery] = useState("")
  const [planFilter, setPlanFilter] = useState("all")
  const [giftFilter, setGiftFilter] = useState<"all" | "active" | "none">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "banned">("all")
  const [signInRange, setSignInRange] = useState<RangeFilter>("any")
  const [syncRange, setSyncRange] = useState<RangeFilter>("any")
  const [joinedRange, setJoinedRange] = useState<RangeFilter>("any")
  const [minAiCalls, setMinAiCalls] = useState("")
  const [minXp, setMinXp] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "lastSignInAt", dir: -1 })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const plans = useMemo(() => Array.from(new Set(rows.map((r) => r.plan))).sort(), [rows])

  const filtered = useMemo(() => {
    const q = emailQuery.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.email.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false
      if (planFilter !== "all" && r.plan !== planFilter) return false
      if (giftFilter === "active" && !r.giftActive) return false
      if (giftFilter === "none" && r.giftActive) return false
      if (statusFilter === "banned" && !r.bannedUntil) return false
      if (statusFilter === "active" && r.bannedUntil) return false
      if (!withinRange(r.lastSignInAt, signInRange)) return false
      if (!withinRange(r.lastSyncedAt, syncRange)) return false
      if (!withinRange(r.createdAt, joinedRange)) return false
      if (minAiCalls && r.aiCalls7d < Number(minAiCalls)) return false
      if (minXp && r.xp < Number(minXp)) return false
      return true
    })
  }, [rows, emailQuery, planFilter, giftFilter, statusFilter, signInRange, syncRange, joinedRange, minAiCalls, minXp])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir
      return String(av).localeCompare(String(bv)) * sort.dir
    })
    return copy
  }, [filtered, sort])

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }))
  }

  function sortArrow(key: SortKey) {
    if (sort.key !== key) return ""
    return sort.dir === 1 ? " ▲" : " ▼"
  }

  async function callAction(id: string, body: Record<string, unknown>) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Action failed.")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.")
    } finally {
      setBusyId(null)
    }
  }

  async function deleteAccount(id: string, email: string) {
    const typed = window.prompt(`Type DELETE to permanently remove ${email}. This cannot be undone.`)
    if (typed !== "DELETE") return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Delete failed.")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.")
    } finally {
      setBusyId(null)
    }
  }

  const th = (key: SortKey, label: string) => (
    <th className={`${CELL} font-normal cursor-pointer select-none hover:text-white whitespace-nowrap`} onClick={() => toggleSort(key)}>
      {label}{sortArrow(key)}
    </th>
  )

  return (
    <div style={{ background: "#1a1a1a", border: "2px solid #2a2a2a", boxShadow: "3px 3px 0 #000" }} className="p-6">
      {error && (
        <p className="text-xs mb-3 px-3 py-2 rounded" style={{ color: "#ff6a4d", background: "#2a1616", border: "1px solid #4a2424" }}>
          {error}
        </p>
      )}

      {/* ── Filters — one control per column ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4 pb-4" style={{ borderBottom: "1px solid #2a2a2a" }}>
        <input
          value={emailQuery}
          onChange={(e) => setEmailQuery(e.target.value)}
          placeholder="Search name or email…"
          className="bg-transparent border rounded px-2 py-1 text-xs text-white placeholder:text-[#666]"
          style={{ borderColor: "#2a2a2a", minWidth: 160 }}
        />
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className={rangeSelectClass} style={rangeSelectStyle}>
          <option value="all">Any plan</option>
          {plans.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={giftFilter} onChange={(e) => setGiftFilter(e.target.value as typeof giftFilter)} className={rangeSelectClass} style={rangeSelectStyle}>
          <option value="all">Any gift status</option>
          <option value="active">Gift active</option>
          <option value="none">No gift</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={rangeSelectClass} style={rangeSelectStyle}>
          <option value="all">Any status</option>
          <option value="active">Not banned</option>
          <option value="banned">Banned</option>
        </select>
        <RangeSelect value={signInRange} onChange={setSignInRange} />
        <RangeSelect value={syncRange} onChange={setSyncRange} />
        <RangeSelect value={joinedRange} onChange={setJoinedRange} />
        <input
          value={minAiCalls}
          onChange={(e) => setMinAiCalls(e.target.value.replace(/\D/g, ""))}
          placeholder="Min AI calls"
          className="bg-transparent border rounded px-2 py-1 text-xs text-white placeholder:text-[#666]"
          style={{ borderColor: "#2a2a2a", width: 100 }}
        />
        <input
          value={minXp}
          onChange={(e) => setMinXp(e.target.value.replace(/\D/g, ""))}
          placeholder="Min XP"
          className="bg-transparent border rounded px-2 py-1 text-xs text-white placeholder:text-[#666]"
          style={{ borderColor: "#2a2a2a", width: 90 }}
        />
        <span className="text-xs text-muted ml-auto">{sorted.length} of {rows.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted text-xs">
              {th("email", "Email")}
              {th("plan", "Plan")}
              <th className={`${CELL} font-normal whitespace-nowrap`}>Status</th>
              {th("lastSignInAt", "Last sign-in")}
              {th("lastSyncedAt", "Last synced")}
              {th("aiCalls7d", "AI calls (7d)")}
              {th("xp", "XP")}
              {th("createdAt", "Joined")}
              <th className={`${CELL} font-normal whitespace-nowrap`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isSelf = r.id === adminId
              const busy = busyId === r.id
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #2a2a2a" }}>
                  <td className={CELL}>
                    <a href={`/admin?user=${r.id}`} className="hover:underline">
                      {r.name
                        ? <><span style={{ color: "#74f7b5" }}>{r.name}</span><span className="text-white"> ({r.email})</span></>
                        : <span className="text-white">{r.email}</span>}
                    </a>
                  </td>
                  <td className={CELL}>
                    <Badge label={r.plan} color={PLAN_COLOR[r.plan] ?? "#8e919a"} />
                    {r.giftActive && <span className="ml-1.5" style={{ color: "#74f7b5" }}>+gift</span>}
                  </td>
                  <td className={CELL}>
                    <Badge label={r.bannedUntil ? "banned" : "active"} color={r.bannedUntil ? "#ff6a4d" : "#60a5fa"} />
                  </td>
                  <td className={`${CELL} text-muted whitespace-nowrap`}>{relativeTime(r.lastSignInAt)}</td>
                  <td className={`${CELL} text-muted whitespace-nowrap`}>{relativeTime(r.lastSyncedAt)}</td>
                  <td className={CELL} style={{ color: r.aiCalls7d > 0 ? "#60a5fa" : "#8e919a" }}>{r.aiCalls7d}</td>
                  <td className={CELL} style={{ color: r.xp > 0 ? "#74f7b5" : "#8e919a" }}>{r.xp}</td>
                  <td className={`${CELL} text-muted whitespace-nowrap`}>{relativeTime(r.createdAt)}</td>
                  <td className={CELL}>
                    <div className="flex flex-wrap gap-1.5">
                      {r.plan !== "free" && (
                        <button disabled={busy} onClick={() => callAction(r.id, { action: "downgrade_to_free" })}
                          className="text-[11px] px-2 py-1 rounded border text-muted hover:text-white disabled:opacity-40"
                          style={{ borderColor: "#2a2a2a" }}>
                          Downgrade
                        </button>
                      )}
                      {r.giftActive ? (
                        <button disabled={busy} onClick={() => callAction(r.id, { action: "revoke_gift" })}
                          className="text-[11px] px-2 py-1 rounded border text-muted hover:text-white disabled:opacity-40"
                          style={{ borderColor: "#2a2a2a" }}>
                          Revoke gift
                        </button>
                      ) : (
                        <select
                          disabled={busy}
                          defaultValue=""
                          onChange={(e) => {
                            const days = Number(e.target.value)
                            if (days) callAction(r.id, { action: "grant_gift", days })
                            e.target.value = ""
                          }}
                          className="text-[11px] px-1.5 py-1 rounded border bg-transparent text-muted hover:text-white disabled:opacity-40"
                          style={{ borderColor: "#2a2a2a" }}>
                          <option value="" disabled>Grant gift…</option>
                          <option value="7">7 days</option>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                        </select>
                      )}
                      {!isSelf && (r.bannedUntil
                        ? <button disabled={busy} onClick={() => callAction(r.id, { action: "unban" })}
                            className="text-[11px] px-2 py-1 rounded border text-muted hover:text-white disabled:opacity-40"
                            style={{ borderColor: "#2a2a2a" }}>
                            Unban
                          </button>
                        : <button disabled={busy} onClick={() => { if (window.confirm(`Ban ${r.email}? They won't be able to sign in until unbanned.`)) callAction(r.id, { action: "ban" }) }}
                            className="text-[11px] px-2 py-1 rounded border text-muted hover:text-white disabled:opacity-40"
                            style={{ borderColor: "#2a2a2a" }}>
                            Ban
                          </button>
                      )}
                      {!isSelf && (
                        <button disabled={busy} onClick={() => deleteAccount(r.id, r.email)}
                          className="text-[11px] px-2 py-1 rounded border disabled:opacity-40"
                          style={{ borderColor: "#4a2424", color: "#ff6a4d" }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

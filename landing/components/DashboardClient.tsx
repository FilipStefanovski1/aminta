"use client"

import { useState, useEffect, useRef } from "react"
import posthog from "posthog-js"
import { createClient } from "@/lib/supabase/client"
import { EXTENSION_URL } from "@/lib/links"

const THRESHOLDS = [0, 300, 750, 1400, 2300, 3500, 5200, 7500, 10500, 14500]

const FORMS = [
  { level: 1, name: "Dormant",     color: "#74f7b5", body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" },
  { level: 2, name: "Curious",     color: "#3fe0c8", body: "#14564a", horn: "#0c3a32", eye: "#5ff0d8" },
  { level: 3, name: "Happy",       color: "#38c0ff", body: "#134a66", horn: "#0c3247", eye: "#7ad0ff" },
  { level: 4, name: "Excited",     color: "#6a8cff", body: "#3a52c8", horn: "#222e88", eye: "#c8d8ff" },
  { level: 5, name: "Mischievous", color: "#a96cff", body: "#4a2a80", horn: "#301a55", eye: "#c8a8ff" },
  { level: 6, name: "Confident",   color: "#d65cff", body: "#66248a", horn: "#45185f", eye: "#e8a8ff" },
  { level: 7, name: "Guardian",    color: "#ff5cc4", body: "#8a2470", horn: "#5f1850", eye: "#ffa8e0" },
  { level: 8, name: "Mythic",      color: "#ff5c7a", body: "#8a2440", horn: "#5f1830", eye: "#ffa8b8" },
  { level: 9, name: "Ascended",    color: "#ff4d4d", body: "#8a2424", horn: "#5f1818", eye: "#ffa8a8" },
]

const OPEN_ROWS = [
  "...H........H...",
  "..HHB......BHH..",
  "..HHBB....BBHH..",
  "...BBBBBBBBBB...",
  "..BBBBBBBBBBBB..",
  ".BBBBBBBBBBBBBB.",
  ".BBEEBBBBBBEEBB.",
  ".BBEEBBBBBBEEBB.",
  ".BBBBBBBBBBBBBB.",
  ".BBBBMMMMMMBBBB.",
  ".BBBBBMMMMBBBBBB",
  ".BBBBBBBBBBBBBB.",
  "..BBBBBBBBBBBB..",
]
const BLINK_ROWS = OPEN_ROWS.map(r => r.replace(/E/g, "B"))

function Sprite({ body, horn, eye, blink, size = 96 }: {
  body: string; horn: string; eye: string; blink: boolean; size?: number
}) {
  const rows = blink ? BLINK_ROWS : OPEN_ROWS
  const W = 16
  function fill(ch: string): string | null {
    if (ch === "B") return body
    if (ch === "H") return horn
    if (ch === "E") return eye
    if (ch === "M") return "#0a0a0a"
    return null
  }
  return (
    <svg viewBox={`0 0 ${W} ${rows.length}`} width={size} height={Math.round(size * rows.length / W)}
      style={{ imageRendering: "pixelated", display: "block" }}>
      {rows.map((row, y) =>
        row.split("").map((ch, x) => {
          const f = fill(ch)
          return f ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={f} /> : null
        })
      )}
    </svg>
  )
}

function getLevel(xp: number) {
  let level = 1
  for (let i = 1; i < THRESHOLDS.length && xp >= THRESHOLDS[i]; i++) level = i + 1
  return Math.min(level, 9)
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function relativeTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

interface Props {
  user: { id: string; email: string; name: string; avatarUrl: string }
  xp: number
  streak: number
  generationsTotal: number
  dnaCount: number
  missionDate: string | null
  missionGenerates: number
  missionPublished: number
  plan: string
  hasState: boolean
  lastSyncedAt: string | null
}

export default function DashboardClient({
  user, xp, streak, generationsTotal, dnaCount,
  missionDate, missionGenerates: missionGeneratesRaw, missionPublished: missionPublishedRaw,
  plan, hasState, lastSyncedAt,
}: Props) {
  // Mission counters only count if they were recorded on the user's local
  // "today" — the extension stamps mission_date with a local date.
  const isMissionToday = missionDate === todayLocal()
  const missionGenerates = isMissionToday ? missionGeneratesRaw : 0
  const missionPublished = isMissionToday ? missionPublishedRaw : 0

  // No synced state (or a fully empty one) = the extension has never pushed
  // for this account — guide the user to install/connect it.
  const needsExtension = !hasState || (xp === 0 && generationsTotal === 0)

  // Covers the returning-visitor path: signup/login only identify() right
  // after a fresh auth event, so a user who lands here on an existing
  // session (the common case) would otherwise stay on an anonymous distinct ID.
  useEffect(() => {
    posthog.identify(user.id)
  }, [user.id])

  const [loggingOut, setLoggingOut] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [blink, setBlink] = useState(false)
  const blinkTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const level = getLevel(xp)
  const form  = FORMS[level - 1]
  const next  = level < 9 ? FORMS[level] : null

  const lo       = THRESHOLDS[level - 1]
  const hi       = level < 9 ? THRESHOLDS[level] : THRESHOLDS[THRESHOLDS.length - 1]
  const progress = level >= 9 ? 100 : Math.min(100, Math.round(((xp - lo) / (hi - lo)) * 100))
  const xpToNext = Math.max(0, hi - xp)

  const displayName = user.name || user.email.split("@")[0]
  const initials = user.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase()

  const q1Done = missionGenerates >= 3
  const q2Done = missionPublished >= 1
  const q3Done = dnaCount >= 3

  // Blink scheduler
  const scheduleNext = useRef<(() => void) | undefined>(undefined)
  scheduleNext.current = () => {
    blinkTimeout.current = setTimeout(() => {
      setBlink(true)
      setTimeout(() => { setBlink(false); scheduleNext.current?.() }, 130)
    }, 3000 + Math.random() * 4000)
  }
  useEffect(() => {
    scheduleNext.current?.()
    return () => clearTimeout(blinkTimeout.current)
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    await createClient().auth.signOut()
    window.location.href = "/"
  }

  async function handlePasswordReset() {
    setResetting(true)
    await createClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setResetSent(true)
    setResetting(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText("https://amintaapp.com")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const card: React.CSSProperties = {
    background: "#1a1a1a",
    border: "2px solid #2a2a2a",
    boxShadow: "3px 3px 0 #000",
  }

  return (
    <div className="mx-auto max-w-7xl px-5 pt-32 pb-20">

      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white">
          Hello!{" "}
          <span style={{ color: form.color }}>{displayName}</span>
        </h1>
        <p className="mt-2 text-muted">
          Your companion is{" "}
          <span className="font-medium text-white">LV.{level} — {form.name}</span>.{" "}
          {level < 9
            ? `${xpToNext.toLocaleString()} XP until ${next?.name}.`
            : "Maximum level reached."}
        </p>
        {lastSyncedAt && !needsExtension && (
          <p className="mt-1 text-xs" style={{ color: "#555" }}>
            Synced from the extension {relativeTime(lastSyncedAt)}
          </p>
        )}
      </div>

      {/* ── Connect-extension banner — shown until the extension first syncs ── */}
      {needsExtension && (
        <div style={card} className="p-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <svg width="24" height="20" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
              <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
              <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
              <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
              <rect x="4" y="6" width="2" height="2" fill="#1a1a1a" />
              <rect x="10" y="6" width="2" height="2" fill="#1a1a1a" />
            </svg>
            <p className="font-pixel text-[11px] text-white">Connect the extension to start</p>
          </div>
          <ol className="space-y-2 text-sm text-muted mb-5">
            <li><span className="text-white font-medium">1.</span> Install Aminta from the Chrome Web Store</li>
            <li><span className="text-white font-medium">2.</span> Pin it, then open the side panel on x.com</li>
            <li><span className="text-white font-medium">3.</span> Sign in inside the panel with this account ({user.email})</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer" className="rpg-btn-primary">
              Get the Extension
            </a>
            <span className="text-xs" style={{ color: "#555" }}>
              Already done this? Publish something with Aminta, then refresh this page.
            </span>
          </div>
        </div>
      )}

      {/* ── Three-card grid ── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* ── Card 1: Profile ── */}
        <div style={card} className="p-6 flex flex-col gap-5">

          <div className="flex items-center gap-2 text-muted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            <span className="font-pixel text-[9px] tracking-widest uppercase">Profile</span>
          </div>

          {/* Avatar + info */}
          <div className="flex flex-col items-center gap-3 py-4">
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt="" className="w-20 h-20 rounded object-cover" style={{ border: "2px solid #2a2a2a", boxShadow: "3px 3px 0 #000" }} />
              : <div className="w-20 h-20 flex items-center justify-center font-pixel text-xl text-black"
                  style={{ background: form.color, border: "2px solid #000", boxShadow: "3px 3px 0 #000" }}>{initials}</div>
            }
            <div className="text-center">
              <p className="text-lg font-semibold text-white">{displayName}</p>
              <p className="text-sm text-muted mt-0.5">{user.email}</p>
            </div>
            <span className="font-pixel text-[8px] px-2.5 py-1"
              style={{
                background: plan === "free" ? "#222" : `${form.color}18`,
                color: plan === "free" ? "#555" : form.color,
                border: `2px solid ${plan === "free" ? "#333" : form.color + "40"}`,
                boxShadow: "2px 2px 0 #000",
              }}>
              {plan.toUpperCase()}
            </span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Streak", value: `${streak}d`, icon: "🔥" },
              { label: "Posts Learned", value: dnaCount, icon: "🧠" },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center gap-1 py-3"
                style={{ background: "#222", border: "1px solid #2a2a2a" }}>
                <span className="text-xl">{s.icon}</span>
                <span className="font-pixel text-sm text-white">{s.value}</span>
                <span className="font-pixel text-[7px] text-muted">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 mt-auto">
            <button
              onClick={handlePasswordReset}
              disabled={resetting || resetSent}
              className="rpg-btn-secondary w-full"
            >
              {resetSent ? "Reset email sent ✓" : resetting ? "Sending…" : "Change Password"}
            </button>
            <button onClick={handleLogout} disabled={loggingOut} className="rpg-btn-secondary w-full">
              {loggingOut ? "Signing out…" : "Logout"}
            </button>
          </div>
        </div>

        {/* ── Card 2: Aminta ── */}
        <div style={card} className="p-6 flex flex-col gap-5">

          <div className="flex items-center gap-2 text-muted">
            <svg width="16" height="16" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
              <rect x="2" y="0" width="2" height="3" fill={form.color} />
              <rect x="12" y="0" width="2" height="3" fill={form.color} />
              <rect x="3" y="3" width="10" height="9" fill={form.color} />
              <rect x="4" y="6" width="2" height="2" fill="#0a0a0a" />
              <rect x="10" y="6" width="2" height="2" fill="#0a0a0a" />
            </svg>
            <span className="font-pixel text-[9px] tracking-widest uppercase">Your Companion</span>
          </div>

          {/* Creature */}
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="animate-floaty" style={{ filter: `drop-shadow(0 0 20px ${form.color}50)` }}>
              <Sprite body={form.body} horn={form.horn} eye={form.eye} blink={blink} size={96} />
            </div>
            <div className="text-center">
              <p className="font-pixel text-[9px] text-muted">LV.{level}</p>
              <p className="font-pixel text-base mt-1" style={{ color: form.color }}>{form.name}</p>
            </div>
          </div>

          {/* XP bar */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-pixel text-[9px] text-muted">{xp.toLocaleString()} XP</span>
              {level < 9
                ? <span className="font-pixel text-[9px] text-muted">{xpToNext.toLocaleString()} to {next?.name}</span>
                : <span className="font-pixel text-[9px]" style={{ color: form.color }}>MAX</span>
              }
            </div>
            <div className="h-2.5" style={{ background: "#111", border: "1px solid #2a2a2a" }}>
              <div className="h-full transition-all duration-700"
                style={{ width: `${progress}%`, background: form.color, boxShadow: `0 0 8px ${form.color}70` }} />
            </div>
          </div>

          {/* Generation count */}
          <div className="mt-auto py-3 text-center"
            style={{ background: "#222", border: "1px solid #2a2a2a" }}>
            <p className="font-pixel text-xl text-white">⚡ {xp.toLocaleString()}</p>
            <p className="font-pixel text-[7px] text-muted mt-1">Total XP earned</p>
          </div>
        </div>

        {/* ── Column 3: Today + Share stacked ── */}
        <div className="flex flex-col gap-4">

        {/* ── Card 3: Today ── */}
        <div style={card} className="p-6 flex flex-col gap-5">

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              <span className="font-pixel text-[9px] tracking-widest uppercase">Today</span>
            </div>
            {q1Done && q2Done && q3Done && (
              <span className="font-pixel text-[8px]" style={{ color: form.color }}>All done ✓</span>
            )}
          </div>

          {/* Missions */}
          <div className="space-y-3">
            {[
              { label: "Generate 3 posts",       value: Math.min(missionGenerates, 3), target: 3, done: q1Done },
              { label: "Publish something",       value: Math.min(missionPublished, 1), target: 1, done: q2Done },
              { label: "Add training samples",    value: Math.min(dnaCount, 3),         target: 3, done: q3Done },
            ].map(q => (
              <div key={q.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 flex items-center justify-center shrink-0"
                      style={{ border: `2px solid ${q.done ? form.color : "#333"}`, background: q.done ? `${form.color}18` : "transparent" }}>
                      {q.done && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke={form.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-sm" style={{ color: q.done ? "#444" : "#ccc", textDecoration: q.done ? "line-through" : "none" }}>
                      {q.label}
                    </span>
                  </div>
                  <span className="font-pixel text-[8px]" style={{ color: q.done ? form.color : "#444" }}>
                    {q.value}/{q.target}
                  </span>
                </div>
                <div className="h-1" style={{ background: "#222" }}>
                  <div className="h-full transition-all duration-500"
                    style={{ width: `${(q.value / q.target) * 100}%`, background: q.done ? form.color : `${form.color}50` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Evolution teaser */}
          {level < 9 && next && (
            <div className="mt-auto pt-4" style={{ borderTop: "1px solid #2a2a2a" }}>
              <p className="font-pixel text-[8px] text-muted uppercase tracking-widest mb-3">Evolution</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center shrink-0"
                  style={{ background: `${form.color}12`, border: `2px solid ${form.color}30` }}>
                  <svg width="18" height="15" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
                    <rect x="2" y="0" width="2" height="3" fill={form.color} />
                    <rect x="12" y="0" width="2" height="3" fill={form.color} />
                    <rect x="3" y="3" width="10" height="9" fill={form.color} />
                    <rect x="4" y="6" width="2" height="2" fill="#0a0a0a" />
                    <rect x="10" y="6" width="2" height="2" fill="#0a0a0a" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="h-2" style={{ background: "#222" }}>
                    <div className="h-full transition-all duration-700"
                      style={{ width: `${progress}%`, background: form.color, boxShadow: `0 0 6px ${form.color}60` }} />
                  </div>
                  <p className="font-pixel text-[7px] text-muted mt-1.5">{xpToNext.toLocaleString()} XP to evolve</p>
                </div>
                <div className="w-10 h-10 flex items-center justify-center shrink-0 opacity-40"
                  style={{ background: "#222", border: "2px solid #333" }}>
                  <svg width="18" height="15" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
                    <rect x="2" y="0" width="2" height="3" fill={next.color} />
                    <rect x="12" y="0" width="2" height="3" fill={next.color} />
                    <rect x="3" y="3" width="10" height="9" fill={next.color} />
                    <rect x="4" y="6" width="2" height="2" fill="#0a0a0a" />
                    <rect x="10" y="6" width="2" height="2" fill="#0a0a0a" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {level >= 9 && (
            <div className="py-3 text-center" style={{ borderTop: "1px solid #2a2a2a" }}>
              <p className="font-pixel text-[9px]" style={{ color: form.color }}>Maximum level reached.</p>
            </div>
          )}
        </div>

        {/* ── Card 4: Invite Friends (coming soon — locked) ── */}
        <div style={{ ...card, position: "relative", overflow: "hidden" }} className="p-6 flex flex-col gap-4">

          {/* Locked overlay */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            background: "rgba(10,10,10,0.28)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div className="flex flex-col items-center gap-2" style={{ background: "rgba(20,20,20,0.85)", padding: "10px 18px", border: "1px solid #2a2a2a" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span className="font-pixel text-[7px] text-[#666] uppercase tracking-widest">Coming Soon</span>
            </div>
          </div>

          {/* Card content (grayed out underneath) */}
          <div className="flex items-center gap-3" style={{ opacity: 0.5 }}>
            <div className="w-9 h-9 flex items-center justify-center shrink-0" style={{ background: "#222", border: "2px solid #2a2a2a" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <p className="font-pixel text-[10px] text-white">Invite Friends</p>
              <p className="text-xs text-muted mt-0.5">Get 30 days of PRO for every 5 friends</p>
            </div>
          </div>

          <div style={{ opacity: 0.55 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white">Your Progress</span>
              <span className="font-pixel text-[9px]" style={{ color: form.color }}>0 / 5 friends</span>
            </div>
            <div className="h-1.5" style={{ background: "#222", border: "1px solid #2a2a2a" }}>
              <div className="h-full" style={{ width: "0%", background: form.color }} />
            </div>
            <p className="text-xs text-muted mt-2">Invite 5 friends to unlock 1 month of PRO!</p>
          </div>

          {/* Steps */}
          <div className="flex items-start justify-between gap-1" style={{ opacity: 0.55 }}>
            {[
              { n: "1", label: "Share Link", accent: false },
              { n: "2", label: "Friend gets 7 days PRO", accent: true },
              { n: "3", label: "You get 30 days PRO", accent: false },
            ].map((step, i) => (
              <div key={step.n} className="flex-1 flex flex-col items-center gap-2 text-center">
                <div className="flex items-center w-full">
                  <div className="w-7 h-7 shrink-0 flex items-center justify-center font-pixel text-[9px]"
                    style={{ background: step.accent ? `${form.color}20` : "#222", border: `2px solid ${step.accent ? form.color : "#333"}`, color: step.accent ? form.color : "#666" }}>
                    {step.n}
                  </div>
                  {i < 2 && <div className="flex-1 h-px mx-1" style={{ background: "#2a2a2a" }} />}
                </div>
                <span className="text-[10px] leading-tight" style={{ color: step.accent ? form.color : "#666" }}>{step.label}</span>
              </div>
            ))}
          </div>

          <button disabled className="rpg-btn-secondary w-full mt-auto" style={{ opacity: 0.35, cursor: "not-allowed" }}>
            Create Link
          </button>
        </div>

        </div>{/* end column 3 */}
      </div>{/* end grid */}
    </div>
  )
}

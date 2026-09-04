"use client"

import { useEffect, useState } from "react"
import type { Row } from "./page"

// Per-browser "last checked" bookmark — deliberately localStorage, not a DB
// column: this is a lightweight admin convenience (glance at who's new when
// the panel opens), not a cross-device synced feature. If it's ever missing
// (first-ever visit on this browser, or storage was cleared) we establish a
// fresh baseline instead of surfacing every historical signup as "new."
const STORAGE_KEY = "aminta_admin_signups_last_seen"

function relativeTime(iso: string | null): string {
  if (!iso) return "never"
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// The bookmark always advances to the newest signup currently on screen —
// never to Date.now() — so a slow page load between "data fetched" and
// "admin dismisses the popup" can never silently swallow a signup that
// landed in that gap.
function latestCreatedAt(rows: Row[]): string {
  const max = rows.reduce((acc, r) => Math.max(acc, new Date(r.createdAt).getTime()), 0)
  return new Date(max || Date.now()).toISOString()
}

export default function NewSignupsPopup({ rows }: { rows: Row[] }) {
  const [newSignups, setNewSignups] = useState<Row[] | null>(null)

  useEffect(() => {
    let stored: string | null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      return // private browsing / storage disabled — skip silently, never block the page
    }

    if (stored === null) {
      try {
        localStorage.setItem(STORAGE_KEY, latestCreatedAt(rows))
      } catch {}
      return
    }

    const storedMs = new Date(stored).getTime()
    const fresh = rows
      .filter((r) => new Date(r.createdAt).getTime() > storedMs)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    if (fresh.length > 0) setNewSignups(fresh)
    // Runs once per page load against the server-fetched `rows` snapshot —
    // not meant to re-fire on client-side re-renders of the same data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, latestCreatedAt(rows))
    } catch {}
    setNewSignups(null)
  }

  if (!newSignups || newSignups.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#1a1a1a", border: "2px solid #2a2a2a", boxShadow: "4px 4px 0 #000" }}
        className="w-full max-w-md p-6"
      >
        <p className="font-pixel text-sm text-white mb-1">
          🎉 {newSignups.length} new signup{newSignups.length === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-muted mb-4">since you last checked the admin panel</p>

        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto mb-5">
          {newSignups.map((r) => (
            <div
              key={r.id}
              className="py-2 px-3"
              style={{ background: "#222", border: "1px solid #2a2a2a" }}
            >
              <p className="text-sm text-white truncate">
                {r.name ? (
                  <>
                    {r.name} <span className="text-muted">({r.email})</span>
                  </>
                ) : (
                  r.email
                )}
              </p>
              <p className="text-xs text-muted">
                {r.plan} · joined {relativeTime(r.createdAt)}
              </p>
            </div>
          ))}
        </div>

        <button
          onClick={dismiss}
          className="w-full text-sm font-medium px-4 py-2 rounded"
          style={{ background: "#74f7b5", color: "#000" }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

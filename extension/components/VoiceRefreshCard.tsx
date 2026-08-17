// Voice Refresh — lives inside the existing Train / Aminta DNA experience
// rather than as its own navigation section.
//
// All state shown here is server-authoritative (synced via /api/sync, or
// returned by the refresh itself). Nothing about entitlement or remaining
// allowance is decided locally; the backend re-derives both on every request
// and the numbers here are display only.
import { useEffect, useState } from "react"

import { C } from "~lib/theme"
import { getStageTint } from "~lib/evolution"
import { PrimaryButton } from "~components/ui"
import type { AmintaStore } from "~lib/storage"
import { disconnectX, fetchConnectionState, runVoiceRefresh, startXConnect } from "~lib/voiceRefresh"

interface Props {
  store: AmintaStore
  /** Re-read the store so a new profile/allowance shows immediately. */
  onRefreshed: () => void
}

function formatDate(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export default function VoiceRefreshCard({ store, onRefreshed }: Props) {
  const tint = getStageTint(store.xp ?? 0)
  const [busy, setBusy] = useState<"connect" | "refresh" | "disconnect" | null>(null)
  const [error, setError] = useState("")
  const [justRefreshed, setJustRefreshed] = useState<number | null>(null)
  const [needsReconnect, setNeedsReconnect] = useState(false)

  // The OAuth tab lands on a page outside the extension, so the panel can't
  // observe completion directly — re-check connection state when the panel
  // regains focus after a connect attempt.
  useEffect(() => {
    const onFocus = () => { fetchConnectionState().then(onRefreshed).catch(() => {}) }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [onRefreshed])

  const entitled = store.voiceRefreshAllowance > 0
  const remaining = store.voiceRefreshRemaining
  const allowance = store.voiceRefreshAllowance
  const exhausted = entitled && remaining <= 0
  const resetLabel = formatDate(store.voiceRefreshPeriodEnd)
  const lastLabel = formatDate(store.lastVoiceRefreshAt)

  const label = "text-[9px] uppercase tracking-[0.06em]"

  async function act(kind: "connect" | "refresh" | "disconnect", fn: () => Promise<unknown>) {
    // Guard against a second click starting a concurrent refresh. The backend
    // is idempotent per requestId anyway, but a new click would mint a new id
    // and could consume a second allowance.
    if (busy) return
    setBusy(kind)
    setError("")
    try {
      await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong."
      setError(msg)
      if (/reconnect|expired/i.test(msg)) setNeedsReconnect(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#262628", border: "1px solid #404048" }}>
      <div className="px-3.5 pt-3.5 pb-3">
        <label className={`${label} block mb-1.5`} style={{ color: "#888896" }}>Voice Refresh</label>
        <p className="text-[12px] font-medium" style={{ color: "#e8e8ea" }}>Learn from your X</p>
        <p className="text-[10px] mt-1 leading-snug" style={{ color: "#666672" }}>
          Aminta analyzes your recent posts to better understand how you write.
        </p>

        {/* ── Free: Pro-gated, in the same tone as the rest of the upgrade UI ── */}
        {!entitled && (
          <div className="mt-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: "#2a2a30", border: `1px solid ${C.border}` }}>
            <p className="font-pixel text-[8px]" style={{ color: "#f5d060" }}>PRO</p>
            <p className="text-[10px] mt-1.5 leading-snug" style={{ color: "#888896" }}>
              Voice Refresh is part of Pro. Upgrade to let Aminta learn directly from your recent posts.
            </p>
          </div>
        )}

        {/* ── Pro, not connected ── */}
        {entitled && !store.xConnected && (
          <div className="mt-3">
            <PrimaryButton
              onClick={busy ? undefined : () => act("connect", startXConnect)}
              tint={tint}
              className="!py-2 text-[8px]"
              disabled={!!busy}>
              {busy === "connect" ? "Opening X…" : "Connect X"}
            </PrimaryButton>
            <p className="text-[9px] mt-1.5 leading-snug" style={{ color: "#55555f" }}>
              Read-only. Aminta never posts, likes, or follows for you.
            </p>
          </div>
        )}

        {/* ── Pro, connected ── */}
        {entitled && store.xConnected && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px]" style={{ color: "#ccccd2" }}>
                Connected as @{store.xUsername}
              </span>
              <button
                onClick={busy ? undefined : () => act("disconnect", disconnectX)}
                className="text-[9px] underline"
                style={{ color: "#666672" }}>
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>

            <PrimaryButton
              onClick={busy || exhausted || needsReconnect ? undefined : () => act("refresh", async () => {
                const r = await runVoiceRefresh()
                setJustRefreshed(r.postsAnalyzed)
                onRefreshed()
              })}
              tint={tint}
              className="!py-2 text-[8px]"
              disabled={!!busy || exhausted || needsReconnect}>
              {busy === "refresh" ? "Analyzing your recent posts…" : "Refresh from X"}
            </PrimaryButton>

            <div className="mt-2 space-y-0.5">
              <p className="text-[10px] leading-none" style={{ color: exhausted ? "#f87171" : "#ccccd2" }}>
                {remaining} of {allowance} refreshes remaining
              </p>
              {resetLabel && (
                <p className="text-[9px] leading-none" style={{ color: "#666672" }}>Resets {resetLabel}</p>
              )}
              {lastLabel && !justRefreshed && (
                <p className="text-[9px] leading-none" style={{ color: "#666672" }}>Last refreshed: {lastLabel}</p>
              )}
            </div>

            {justRefreshed !== null && !error && (
              <p className="font-pixel text-[7px] mt-2.5" style={{ color: tint }}>
                Voice refreshed from {justRefreshed} recent posts
              </p>
            )}

            {exhausted && !error && (
              <p className="text-[9px] mt-2 leading-snug" style={{ color: "#888896" }}>
                You've used all your refreshes for this period{resetLabel ? ` — more on ${resetLabel}.` : "."}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-2.5">
            <p className="font-pixel text-[7px] text-red-400 leading-relaxed">{error}</p>
            {needsReconnect && (
              <button
                onClick={busy ? undefined : () => act("connect", async () => { setNeedsReconnect(false); await startXConnect() })}
                className="text-[9px] underline mt-1.5"
                style={{ color: tint }}>
                Reconnect X
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

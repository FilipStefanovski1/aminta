// Voice Refresh — lives inside the existing Train / Aminta DNA experience
// rather than as its own navigation section.
//
// All state shown here is server-authoritative (synced via /api/sync, or
// returned by the refresh itself). Nothing about entitlement or eligibility
// is decided locally; the backend re-derives both on every request and the
// values here are display only. Eligibility is a rolling 168-hour cooldown
// from the user's own last successful refresh — not an allowance bucket —
// so there is nothing here to count down or reset on a calendar boundary.
import { useEffect, useState } from "react"

import { C } from "~lib/theme"
import { getStageTint } from "~lib/evolution"
import { PrimaryButton } from "~components/ui"
import type { AmintaStore } from "~lib/storage"
import { disconnectX, fetchConnectionState, runVoiceRefresh, startXConnect } from "~lib/voiceRefresh"
import { summarizeStyleProfile, summaryAffordanceFor } from "~lib/styleProfileSummary"

interface Props {
  store: AmintaStore
  /** Re-read the store so a new profile/eligibility shows immediately. */
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
  const [showLearned, setShowLearned] = useState(false)
  const [showHow, setShowHow] = useState(false)

  // The OAuth tab lands on a page outside the extension, so the panel can't
  // observe completion directly — re-check connection state when the panel
  // regains focus after a connect attempt.
  useEffect(() => {
    const onFocus = () => { fetchConnectionState().then(onRefreshed).catch(() => {}) }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [onRefreshed])

  // Same paid-tier set Voice Refresh is entitled on (Pro/Founder/active
  // Gifted) — aiIncludedPaid already carries this, no need for a second
  // entitlement field synced down just for this card.
  const entitled = store.aiIncludedPaid
  const eligible = store.voiceRefreshEligible
  const nextEligibleLabel = formatDate(store.voiceRefreshNextEligibleAt)
  const lastRefreshedLabel = formatDate(store.lastVoiceRefreshAt)

  // Read from what is already in storage — never re-extracted, and the
  // summary survives closing the panel because it reads the persisted
  // profile rather than the transient justRefreshed state.
  const learned = summarizeStyleProfile(store.styleProfile)
  const affordance = summaryAffordanceFor(store, justRefreshed)

  const label = "text-[9px] uppercase tracking-[0.06em]"

  async function act(kind: "connect" | "refresh" | "disconnect", fn: () => Promise<unknown>) {
    // Guard against a second click starting a concurrent refresh. The backend
    // is idempotent per requestId anyway, but a new click would mint a new id.
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

  const learnedToggle = learned.length > 0 && (
    <>
      <button
        onClick={() => setShowLearned((v) => !v)}
        className="text-[10px] mt-2 leading-none block"
        style={{ color: tint }}>
        {showLearned ? "Hide details" : "View what Aminta learned"}
      </button>
      {showLearned && (
        <div className="mt-2.5 pt-2.5" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
          <p className={`${label} mb-2`} style={{ color: "#888896" }}>What Aminta learned</p>
          <div className="space-y-2.5">
            {learned.map((s) => (
              <div key={s.title}>
                <p className="text-[10px] leading-none mb-1" style={{ color: "#ccccd2" }}>{s.title}</p>
                {s.inline && (
                  <p className="text-[10px] leading-snug" style={{ color: "#888896" }}>{s.inline}</p>
                )}
                {s.lines.map((line) => (
                  <p key={line} className="text-[10px] leading-snug" style={{ color: "#888896" }}>
                    {s.lines.length > 1 ? `• ${line}` : line}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#262628", border: "1px solid #404048" }}>
      <div className="px-3.5 pt-3.5 pb-3">
        {/* ── Free: Pro-gated ── */}
        {!entitled && (
          <>
            <label className={`${label} block mb-1.5`} style={{ color: "#888896" }}>Learn from your X</label>
            <p className="text-[12px] font-medium" style={{ color: "#e8e8ea" }}>Keep Aminta in sync with how you actually write.</p>
            <div className="mt-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: "#2a2a30", border: `1px solid ${C.border}` }}>
              <p className="font-pixel text-[8px]" style={{ color: "#f5d060" }}>PRO</p>
              <p className="text-[10px] mt-1.5 leading-snug" style={{ color: "#888896" }}>
                Voice Refresh is part of Pro. Upgrade to let Aminta learn directly from your recent posts.
              </p>
            </div>
          </>
        )}

        {/* ── Pro, not connected ── */}
        {entitled && !store.xConnected && (
          <>
            <label className={`${label} block mb-1.5`} style={{ color: "#888896" }}>Learn from your X</label>
            <p className="text-[12px] font-medium" style={{ color: "#e8e8ea" }}>Keep Aminta in sync with how you actually write.</p>
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
          </>
        )}

        {/* ── Pro, connected ── */}
        {entitled && store.xConnected && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
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

            {busy === "refresh" ? (
              // ── REFRESHING ──
              <p className="text-[10px] leading-snug" style={{ color: "#ccccd2" }}>
                Analyzing your recent posts…
              </p>
            ) : affordance.kind === "fresh" && !error ? (
              // ── SUCCESS ──
              <div>
                <p className="font-pixel text-[7px] mb-1.5" style={{ color: tint }}>✓ Voice updated</p>
                <p className="text-[10px] leading-snug" style={{ color: "#ccccd2" }}>
                  Learned from {affordance.postsAnalyzed} recent posts
                </p>
                {learnedToggle}
                {nextEligibleLabel && (
                  <p className="text-[9px] mt-2 leading-none" style={{ color: "#666672" }}>
                    Next refresh {nextEligibleLabel}
                  </p>
                )}
              </div>
            ) : eligible ? (
              // ── AVAILABLE ──
              <div>
                <label className={`${label} block mb-1`} style={{ color: "#888896" }}>Learn from your X</label>
                <p className="text-[10px] mb-2.5 leading-snug" style={{ color: "#666672" }}>
                  Keep Aminta in sync with how you actually write.
                </p>
                <PrimaryButton
                  onClick={needsReconnect ? undefined : () => act("refresh", async () => {
                    const r = await runVoiceRefresh()
                    setJustRefreshed(r.postsAnalyzed)
                    onRefreshed()
                  })}
                  tint={tint}
                  className="!py-2 text-[8px]"
                  disabled={needsReconnect}>
                  Refresh my voice
                </PrimaryButton>
                <p className="text-[9px] mt-1.5 leading-none" style={{ color: "#55555f" }}>Available now</p>
              </div>
            ) : (
              // ── LOCKED ──
              <div>
                <label className={`${label} block mb-1`} style={{ color: "#888896" }}>Learn from your X</label>
                <p className="text-[10px] leading-snug" style={{ color: "#666672" }}>Your voice is up to date.</p>
                {lastRefreshedLabel && (
                  <p className="text-[9px] mt-1 leading-none" style={{ color: "#666672" }}>
                    Last refreshed {lastRefreshedLabel}
                  </p>
                )}
                {learnedToggle}
                {nextEligibleLabel && (
                  <p className="text-[9px] mt-2 leading-none" style={{ color: "#666672" }}>
                    Refresh available {nextEligibleLabel}
                  </p>
                )}
              </div>
            )}

            {(affordance.kind !== "none") && (
              <div className="flex items-start gap-1 mt-2">
                <button
                  onClick={() => setShowHow((v) => !v)}
                  aria-label="How posts are chosen"
                  className="text-[9px] leading-none"
                  style={{ color: "#55555f" }}>
                  ⓘ how posts are chosen
                </button>
              </div>
            )}
            {showHow && (
              <p className="text-[9px] mt-1 leading-snug" style={{ color: "#666672" }}>
                Aminta analyzes your recent original posts and automatically chooses the
                strongest examples of your writing. Replies and reposts aren't used.
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

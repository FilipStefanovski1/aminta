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
import { T, TP } from "~lib/typography"
import { getStageTint } from "~lib/evolution"
import type { AmintaStore } from "~lib/storage"
import { disconnectX, fetchConnectionState, runVoiceRefresh, startXConnect } from "~lib/voiceRefresh"
import { summarizeStyleProfile, summaryAffordanceFor } from "~lib/styleProfileSummary"
import { PRICING_URL } from "~lib/webUrl"

interface Props {
  store: AmintaStore
  /** Re-read the store so a new profile/eligibility shows immediately. */
  onRefreshed: () => void
  /**
   * Copy-only variant — entitlement/action logic is identical either way.
   * "onboarding" frames the eligible CTA as a first-time action ("Learn
   * from my X") instead of Train's "Refresh my voice", which reads oddly
   * before a user has ever run one. Defaults to "train" (existing wording).
   */
  variant?: "train" | "onboarding"
}

// Restrained, text-only — no icon, no color beyond the existing palette.
// Exists purely so a user never has to guess Voice Refresh is a paid
// feature; shown next to the card title regardless of context.
function ProBadge() {
  return (
    <span
      className="font-pixel text-[6px] uppercase tracking-widest px-1.5 py-[3px] rounded"
      style={{ color: "#0a0a0a", backgroundColor: "#c4b5fd" }}>
      Pro
    </span>
  )
}

function formatDate(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// Deliberately NOT ~components/ui's PrimaryButton: that one is built on
// .btn-pixel (3px black border + 3px black offset shadow), which is the
// right language for the retro Generate/Insert actions but reads as a
// clunky legacy widget inside an account card. This matches the newer,
// quieter primary button used elsewhere in the current UI — same tint, no
// border, no offset shadow, ~40px tall instead of a banner. Scoped to this
// file on purpose; .btn-pixel itself is untouched and still used everywhere
// it belongs.
function CardButton({
  children,
  onClick,
  disabled,
  tint,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  tint: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-lg py-3 text-black transition-opacity disabled:opacity-40 disabled:cursor-not-allowed ${T.button}`}
      style={{ backgroundColor: tint }}>
      {children}
    </button>
  )
}

export default function VoiceRefreshCard({ store, onRefreshed, variant = "train" }: Props) {
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

  const label = T.eyebrow

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
        className={`${T.buttonSm} mt-2 leading-none block`}
        style={{ color: tint }}>
        {showLearned ? "Hide details" : "View what Aminta learned"}
      </button>
      {showLearned && (
        <div className="mt-2.5 pt-2.5" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
          <p className={`${label} mb-2`} style={{ color: C.textFaint }}>What Aminta learned</p>
          <div className="space-y-2.5">
            {learned.map((s) => (
              <div key={s.title}>
                <p className={`${T.meta} leading-none mb-1`} style={{ color: C.textFaint }}>{s.title}</p>
                {s.inline && (
                  <p className={T.bodySm} style={{ color: C.textFaint }}>{s.inline}</p>
                )}
                {s.lines.map((line) => (
                  <p key={line} className={T.bodySm} style={{ color: C.textFaint }}>
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

  // One line of cooldown/recency metadata for the footer row. Deliberately
  // empty while a refresh is actually available: the enabled button already
  // says that, and a separate "Available now" line just took up a row of its
  // own saying nothing new. The underlying eligibility/cooldown state
  // (store.voiceRefreshEligible) is untouched — this only decides what text,
  // if any, is worth rendering.
  const statusMeta =
    busy === "refresh" ? ""
      : affordance.kind === "fresh" && !error ? (nextEligibleLabel ? `Next refresh ${nextEligibleLabel}` : "")
        : eligible ? ""
          : nextEligibleLabel ? `Refresh available ${nextEligibleLabel}`
            : lastRefreshedLabel ? `Last refreshed ${lastRefreshedLabel}`
              : ""

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#262628", border: "1px solid #404048" }}>
      <div className="px-4 py-4">
        <div className="flex items-center gap-2">
          <p className={T.sectionTitle} style={{ color: C.text }}>Learn from your X</p>
          <ProBadge />
        </div>

        {/* ── Free: optional Pro convenience, never a gate. Manual training
            (writing examples) already fully builds a Free user's Aminta
            DNA — this only offers automatic, X-sourced upkeep on top.
            "up to" is load-bearing: TARGET_CORPUS caps the analyzed corpus
            at 20 (landing/lib/x/filter.ts), but eligibility filtering
            (replies/retweets/too-short/quote-dominant posts excluded) means
            fewer than 20 may actually be used. */}
        {!entitled && (
          <>
            <p className={`${T.body} mt-2 font-medium`} style={{ color: C.text }}>
              Learn your style from up to your last 20 X posts.
            </p>
            <p className={`${T.bodySm} mt-1`} style={{ color: C.textFaint }}>
              Voice Refresh analyzes your recent posts and updates how Aminta writes like you.
            </p>
            <a
              href={PRICING_URL}
              target="_blank"
              rel="noreferrer"
              className={`inline-block mt-3 ${T.buttonSm}`}
              style={{ color: tint }}>
              Unlock with Pro →
            </a>
          </>
        )}

        {/* ── Pro, not connected ── */}
        {entitled && !store.xConnected && (
          <>
            <p className={`${T.body} mt-2 font-medium`} style={{ color: C.text }}>
              Learn your style from up to your last 20 X posts.
            </p>
            <p className={`${T.bodySm} mt-1 mb-3`} style={{ color: C.textFaint }}>
              Voice Refresh analyzes your recent posts and updates how Aminta writes like you.
            </p>
            <CardButton
              onClick={busy ? undefined : () => act("connect", startXConnect)}
              tint={tint}
              disabled={!!busy}>
              {busy === "connect" ? "Opening X…" : "Connect X"}
            </CardButton>
            <p className={`${T.meta} mt-2`} style={{ color: C.textGhost }}>
              Read-only. Aminta never posts, likes, or follows for you.
            </p>
          </>
        )}

        {/* ── Pro, connected ──
            One hierarchy shared by every state: identity, then what this
            card is for, then the action or its current status, then quiet
            metadata + Disconnect on a single footer row. */}
        {entitled && store.xConnected && (
          <div>
            <p className={`${T.bodySm} mt-2`} style={{ color: C.textFaint }}>
              Connected as{" "}
              <span className="font-medium" style={{ color: C.text }}>@{store.xUsername}</span>
            </p>
            <p className={`${T.bodySm} mt-1 mb-3`} style={{ color: C.textFaint }}>
              Keep Aminta in sync with how you actually write.
            </p>

            {busy === "refresh" ? (
              // ── REFRESHING ──
              <p className={T.bodySm} style={{ color: C.textFaint }}>
                Analyzing your recent posts…
              </p>
            ) : affordance.kind === "fresh" && !error ? (
              // ── SUCCESS ──
              <div>
                <p className={T.bodySm} style={{ color: C.text }}>
                  Voice updated — learned from {affordance.postsAnalyzed} recent posts.
                </p>
                {learnedToggle}
              </div>
            ) : eligible ? (
              // ── AVAILABLE ──
              <CardButton
                onClick={needsReconnect ? undefined : () => act("refresh", async () => {
                  const r = await runVoiceRefresh()
                  setJustRefreshed(r.postsAnalyzed)
                  onRefreshed()
                })}
                tint={tint}
                disabled={needsReconnect}>
                {variant === "onboarding" ? "Learn from my X" : "Refresh my voice"}
              </CardButton>
            ) : (
              // ── LOCKED ──
              <div>
                <p className={T.bodySm} style={{ color: C.text }}>Your voice is up to date.</p>
                {learnedToggle}
              </div>
            )}

            {/* Footer: cooldown/recency metadata and the two low-emphasis
                account actions. Disconnect is destructive, so it stays a
                quiet text button here rather than competing with Refresh. */}
            <div className="flex items-center justify-between gap-3 mt-3">
              <span className={`${T.meta} leading-none`} style={{ color: C.textGhost }}>{statusMeta}</span>
              <button
                onClick={busy ? undefined : () => act("disconnect", async () => {
                  await disconnectX()
                  // disconnectX() already clears xConnected/xUsername in
                  // storage — without this, the panel keeps showing the old
                  // "Connected as @handle" state until something else
                  // happens to trigger a re-render, which reads as "the
                  // Disconnect button doesn't work."
                  onRefreshed()
                })}
                className={`${T.buttonSm} leading-none shrink-0`}
                style={{ color: C.textGhost }}>
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>

            {(affordance.kind !== "none") && (
              <button
                onClick={() => setShowHow((v) => !v)}
                className={`${T.buttonSm} leading-none mt-2 block`}
                style={{ color: C.textGhost }}>
                How posts are chosen
              </button>
            )}
            {showHow && (
              <p className={`${T.meta} mt-1.5`} style={{ color: C.textGhost }}>
                Aminta analyzes your recent original posts and automatically chooses the
                strongest examples of your writing. Replies and reposts aren't used.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3">
            <p className={`${T.bodySm} text-red-400`}>{error}</p>
            {needsReconnect && (
              <button
                onClick={busy ? undefined : () => act("connect", async () => { setNeedsReconnect(false); await startXConnect() })}
                className={`${T.buttonSm} mt-1.5 block`}
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

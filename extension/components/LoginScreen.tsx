import { useEffect, useState } from "react"
import { C } from "~lib/theme"
import { loginUrl } from "~lib/webUrl"

interface Props {
  // Called by sidepanel's own storage-change listener; kept for API compat.
  // LoginScreen itself does NOT call this — the sidepanel detects auth_access_token
  // appearing in chrome.storage.local and transitions automatically.
  onSignedIn: () => void
}

// idle       — default, X-first entry point
// waiting    — tab opened, watching for the session to land
// stalled    — 90s with no session (tab closed, user got stuck, etc.)
// cancelled  — user tapped Cancel while waiting
type State = "idle" | "waiting" | "stalled" | "cancelled"

export default function LoginScreen({ onSignedIn: _onSignedIn }: Props) {
  const [state, setState] = useState<State>("idle")

  // If sign-in hasn't completed after 90s, stop spinning and offer a retry —
  // the user may have closed the tab or hit an error on the website.
  useEffect(() => {
    if (state !== "waiting") return
    const t = setTimeout(() => setState("stalled"), 90_000)
    return () => clearTimeout(t)
  }, [state])

  function openLoginPage() {
    const extId = chrome.runtime.id
    // Opens the website's full Supabase OAuth flow (X-first, same reveal for
    // Google/email that exists on the page itself — this is the ONE URL for
    // every account type, not a second flow). After the user signs in,
    // /extension-auth sends AMINTA_AUTH to background.ts, which stores the
    // tokens. The sidepanel's chrome.storage.local.onChanged listener then
    // fires and calls pullFromCloud() + setIsLoggedIn(true) automatically.
    chrome.tabs.create({ url: loginUrl(extId) })
    setState("waiting")
  }

  function cancel() {
    setState("cancelled")
  }

  const showEntry = state === "idle" || state === "stalled" || state === "cancelled"

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6"
      style={{ backgroundColor: C.bg }}
    >
      <svg width="32" height="26" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
        <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
        <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
        <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
        <rect x="4" y="6" width="2" height="2" fill={C.bg} />
        <rect x="10" y="6" width="2" height="2" fill={C.bg} />
      </svg>

      <div className="text-center space-y-1.5">
        <p className="font-pixel text-[9px] tracking-widest" style={{ color: "#74f7b5" }}>
          Your AI companion for X.
        </p>
        <p className="text-xs" style={{ color: C.textFaint }}>
          Connect your X account to start training Aminta.
        </p>
      </div>

      {showEntry && (
        <div className="w-full flex flex-col items-center gap-3">
          {state === "stalled" && (
            <p className="text-[10px] text-center" style={{ color: C.textFaint }}>
              Couldn&apos;t connect your X account. Try again.
            </p>
          )}
          {state === "cancelled" && (
            <p className="text-[10px] text-center" style={{ color: C.textFaint }}>
              Connection cancelled.
            </p>
          )}
          <button
            onClick={openLoginPage}
            className="w-full py-3 rounded-xl font-pixel text-[8px] tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: "#74f7b5" }}
          >
            {state === "idle" && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            )}
            {state === "idle" ? "Connect X" : "Try again"}
          </button>
          {/* Opens the exact same login page — its own reveal already
              surfaces Google/email for anyone who needs them. Not a second
              flow, just a second entry point into the same one. */}
          <button
            onClick={openLoginPage}
            className="text-[10px] transition-colors"
            style={{ color: C.textGhost }}
          >
            Already use Google or email? Use another sign-in method.
          </button>
        </div>
      )}

      {state === "waiting" && (
        <div className="w-full flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <div
              className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#74f7b5", borderTopColor: "transparent" }}
            />
            <p className="font-pixel text-[8px] tracking-widest" style={{ color: "#74f7b5" }}>
              Connecting to X…
            </p>
            <p className="text-[10px]" style={{ color: C.textFaint }}>
              Complete sign-in on the tab that just opened
            </p>
          </div>
          <button
            onClick={cancel}
            className="font-pixel text-[7px] tracking-widest transition-colors"
            style={{ color: C.textGhost }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

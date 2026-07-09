import { useEffect, useState } from "react"
import { C } from "~lib/theme"

interface Props {
  // Called by sidepanel's own storage-change listener; kept for API compat.
  // LoginScreen itself does NOT call this — the sidepanel detects auth_access_token
  // appearing in chrome.storage.local and transitions automatically.
  onSignedIn: () => void
}

type State = "idle" | "waiting" | "stalled"

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
    // Opens the website's full Supabase OAuth flow. After the user signs in,
    // /extension-auth sends AMINTA_AUTH to background.ts, which stores the tokens.
    // The sidepanel's chrome.storage.local.onChanged listener then fires and
    // calls pullFromCloud() + setIsLoggedIn(true) automatically.
    chrome.tabs.create({ url: `https://amintaapp.com/login?ext_id=${extId}` })
    setState("waiting")
  }

  function cancel() {
    setState("idle")
  }

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
          Sign in to Aminta
        </p>
        <p className="text-xs" style={{ color: C.textFaint }}>
          Your XP, streak &amp; plan sync to your account
        </p>
      </div>

      {(state === "idle" || state === "stalled") && (
        <div className="w-full flex flex-col items-center gap-3">
          {state === "stalled" && (
            <p className="text-[10px] text-center" style={{ color: C.textFaint }}>
              Still waiting… Finish sign-in in the tab that opened, or try again.
            </p>
          )}
          <button
            onClick={openLoginPage}
            className="w-full py-3 rounded-xl font-pixel text-[8px] tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ backgroundColor: "#74f7b5" }}
          >
            {state === "stalled" ? "Try again" : "Sign in on amintaapp.com"}
          </button>
          <p className="text-[10px]" style={{ color: C.textGhost }}>
            Google · Email &amp; password
          </p>
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
              Waiting for sign in…
            </p>
            <p className="text-[10px]" style={{ color: C.textFaint }}>
              Complete sign in on the tab that just opened
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

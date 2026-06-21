import { useState } from "react"
import { C } from "~lib/theme"
import { storeAuthSession } from "~lib/auth"

const GOOGLE_CLIENT_ID = "110269399450-vfmckhcemps4s9k3okeb1ebh4bk17po7.apps.googleusercontent.com"

interface Props {
  onSignedIn: () => void
}

export default function LoginScreen({ onSignedIn }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function signInWithGoogle() {
    setLoading(true)
    setError("")

    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`
    const nonce = Math.random().toString(36).slice(2)

    const authUrl =
      `https://accounts.google.com/o/oauth2/auth` +
      `?client_id=${GOOGLE_CLIENT_ID}` +
      `&response_type=token id_token` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent("openid email profile")}` +
      `&nonce=${nonce}`

    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          setError("Sign in cancelled")
          setLoading(false)
          return
        }

        // Extract id_token from the redirect hash
        const hash = new URL(responseUrl).hash.slice(1)
        const params = new URLSearchParams(hash)
        const idToken = params.get("id_token")

        if (!idToken) {
          setError("No token received")
          setLoading(false)
          return
        }

        // Exchange with our backend
        try {
          const res = await fetch("https://amintaapp.com/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? "Auth failed")

          await storeAuthSession({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            userId: data.userId,
            email: data.email,
          })
          onSignedIn()
        } catch (e: any) {
          setError(e.message)
          setLoading(false)
        }
      }
    )
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
          Sign in to sync
        </p>
        <p className="text-xs" style={{ color: C.textFaint }}>
          Keep your XP &amp; streak safe across devices
        </p>
      </div>

      {error && (
        <p className="font-pixel text-[7px] text-red-400 text-center">{error}</p>
      )}

      <button
        onClick={signInWithGoogle}
        disabled={loading}
        className="w-full py-3 rounded-xl font-pixel text-[8px] tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        style={{ backgroundColor: "#74f7b5" }}
      >
        {loading ? "Signing in..." : "Sign in with Google"}
      </button>

      <button
        onClick={onSignedIn}
        className="font-pixel text-[7px] tracking-widest transition-colors"
        style={{ color: C.textGhost }}
      >
        Skip for now
      </button>
    </div>
  )
}

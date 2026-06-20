"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

function DemonIcon({ size = 32 }: { size?: number }) {
  const s = size / 16
  return (
    <svg
      width={size}
      height={Math.round(size * 13 / 16)}
      viewBox="0 0 16 13"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
      <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
      <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
      <rect x="4" y="6" width="2" height="2" fill="#1f1f1f" />
      <rect x="10" y="6" width="2" height="2" fill="#1f1f1f" />
    </svg>
  )
}

function PixelFloat({ x, y, size, delay, color }: { x: string; y: string; size: number; delay: string; color: string }) {
  return (
    <div
      className="absolute animate-pixel-float opacity-30"
      style={{ left: x, top: y, animationDelay: delay }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ imageRendering: "pixelated" }}>
        <rect width={size} height={size} fill={color} />
      </svg>
    </div>
  )
}

export default function LoginPage() {
  const [email, setEmail]     = useState("")
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")

  const supabase = createClient()

  const extId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("ext_id")
    : null
  const callbackBase = `${typeof window !== "undefined" ? location.origin : ""}/auth/callback`
  const callbackUrl = extId ? `${callbackBase}?ext_id=${extId}` : callbackBase

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl },
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    })
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">

      {/* Ambient pixel floats */}
      <PixelFloat x="8%"  y="12%" size={6}  delay="0s"    color="#74f7b5" />
      <PixelFloat x="15%" y="70%" size={4}  delay="1.2s"  color="#74f7b5" />
      <PixelFloat x="80%" y="18%" size={8}  delay="0.7s"  color="#74f7b5" />
      <PixelFloat x="88%" y="65%" size={5}  delay="2.1s"  color="#74f7b5" />
      <PixelFloat x="72%" y="82%" size={4}  delay="0.4s"  color="#2f6b4f" />
      <PixelFloat x="25%" y="22%" size={5}  delay="1.8s"  color="#2f6b4f" />

      {/* Glow orb behind card */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(116,247,181,0.07) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm space-y-6">

        {/* Back */}
        <a
          href="/"
          className="flex items-center gap-1.5 font-pixel text-[7px] tracking-widest transition-colors"
          style={{ color: "#3a3a4a" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#74f7b5")}
          onMouseLeave={e => (e.currentTarget.style.color = "#3a3a4a")}
        >
          ← Back
        </a>

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="aminta-glow">
            <DemonIcon size={40} />
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{
            background: "rgba(36,36,36,0.85)",
            border: "1px solid #343438",
            boxShadow: "0 0 40px rgba(116,247,181,0.06), 0 20px 60px rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
          }}
        >
          {sent ? (
            <div className="text-center space-y-3 py-6">
              <div className="flex justify-center mb-2">
                <svg width="32" height="28" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
                  <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
                  <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
                  <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
                  <rect x="5" y="6" width="2" height="2" fill="#1f1f1f" />
                  <rect x="9" y="6" width="2" height="2" fill="#1f1f1f" />
                  <rect x="6" y="9" width="4" height="1" fill="#1f1f1f" />
                </svg>
              </div>
              <p className="font-pixel text-[9px] tracking-widest" style={{ color: "#74f7b5" }}>
                Check your email
              </p>
              <p className="text-sm text-[#9a9aa3]">
                Magic link sent to{" "}
                <span style={{ color: "#74f7b5" }}>{email}</span>
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="font-pixel text-[9px] tracking-widest mb-2" style={{ color: "#74f7b5" }}>
                  Sign in
                </p>
                <p className="text-[#9a9aa3] text-xs">Sync your progress across devices</p>
              </div>

              {/* Google */}
              <button
                onClick={handleGoogle}
                className="rpg-btn-secondary w-full flex items-center justify-center gap-2 text-xs"
              >
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#343438]" />
                <span className="font-pixel text-[7px] text-[#3a3a4a]">or</span>
                <div className="flex-1 h-px bg-[#343438]" />
              </div>

              {/* Magic link */}
              <form onSubmit={handleMagicLink} className="space-y-3">
                <div>
                  <label className="font-pixel text-[7px] text-[#555] mb-1.5 block tracking-widest">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-lg text-sm placeholder-[#3a3a4a] text-white focus:outline-none transition-colors"
                    style={{
                      background: "#1f1f1f",
                      border: "1px solid #343438",
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = "#74f7b5")}
                    onBlur={e => (e.currentTarget.style.borderColor = "#343438")}
                  />
                </div>
                {error && (
                  <p className="font-pixel text-[7px] text-red-400">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg font-pixel text-[9px] tracking-widest text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
                  style={{ background: "#74f7b5" }}
                >
                  {loading ? "Sending…" : "Send magic link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[#3a3a4a] text-xs">
          By signing in you agree to our{" "}
          <a href="/terms" className="text-[#555] hover:text-[#74f7b5] transition-colors">Terms</a>
          {" & "}
          <a href="/privacy" className="text-[#555] hover:text-[#74f7b5] transition-colors">Privacy</a>
        </p>
      </div>
    </div>
  )
}

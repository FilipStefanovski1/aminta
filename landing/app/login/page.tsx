"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export const dynamic = "force-dynamic"

function DemonIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 13 / 16)} viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
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
    <div className="absolute animate-pixel-float opacity-30" style={{ left: x, top: y, animationDelay: delay }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ imageRendering: "pixelated" }}>
        <rect width={size} height={size} fill={color} />
      </svg>
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
  const strength = checks.filter(r => r.test(password)).length
  const colors = ["#343438", "#ef4444", "#f97316", "#eab308", "#74f7b5"]
  return (
    <div className="flex gap-1 mt-1.5">
      {[1,2,3,4].map(i => (
        <div key={i} className="h-1 flex-1 rounded-full transition-colors duration-300"
          style={{ backgroundColor: i <= strength ? colors[strength] : "#343438" }} />
      ))}
    </div>
  )
}

export default function LoginPage() {
  const [isCreate, setIsCreate] = useState(false)
  const [name, setName]         = useState("")
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [agreed, setAgreed]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const [sent, setSent]         = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const extId = params.get("ext_id")
    if (extId) localStorage.setItem("aminta_ext_id", extId)
    setIsCreate(params.get("mode") === "create")
  }, [])

  const cb = () => `${location.origin}/auth/callback`

  async function handleGoogle() {
    await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: cb() } })
  }

  async function handleGitHub() {
    await createClient().auth.signInWithOAuth({ provider: "github", options: { redirectTo: cb() } })
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    if (isCreate && !agreed) { setError("Please agree to the Terms of Service"); return }
    setLoading(true)
    setError("")
    const supabase = createClient()
    if (isCreate) {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name }, emailRedirectTo: cb() },
      })
      if (error) setError(error.message)
      else setSent(true)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else window.location.href = "/"
    }
    setLoading(false)
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden">

      <PixelFloat x="8%"  y="12%" size={6} delay="0s"   color="#74f7b5" />
      <PixelFloat x="15%" y="70%" size={4} delay="1.2s" color="#74f7b5" />
      <PixelFloat x="80%" y="18%" size={8} delay="0.7s" color="#74f7b5" />
      <PixelFloat x="88%" y="65%" size={5} delay="2.1s" color="#74f7b5" />
      <PixelFloat x="72%" y="82%" size={4} delay="0.4s" color="#2f6b4f" />
      <PixelFloat x="25%" y="22%" size={5} delay="1.8s" color="#2f6b4f" />

      <div className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(116,247,181,0.07) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />

      <div className="relative z-10 w-full max-w-sm space-y-5">

        {/* Back */}
        <a href="/" className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: "#aaa" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
          onMouseLeave={e => (e.currentTarget.style.color = "#aaa")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </a>

        {/* Logo */}
        <div className="flex justify-center">
          <div className="aminta-glow"><DemonIcon size={40} /></div>
        </div>

        {sent ? (
          <div className="rounded-2xl p-8 text-center space-y-3"
            style={{ background: "rgba(36,36,36,0.85)", border: "1px solid #343438", backdropFilter: "blur(8px)" }}>
            <DemonIcon size={32} />
            <p className="font-pixel text-[9px] tracking-widest" style={{ color: "#74f7b5" }}>Check your email</p>
            <p className="text-sm text-[#9a9aa3]">Confirmation sent to <span style={{ color: "#74f7b5" }}>{email}</span></p>
          </div>
        ) : (
          <div className="rounded-2xl p-6 space-y-4"
            style={{ background: "rgba(36,36,36,0.85)", border: "1px solid #343438", boxShadow: "0 0 40px rgba(116,247,181,0.06), 0 20px 60px rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>

            <div>
              <p className="font-pixel text-[9px] tracking-widest mb-1" style={{ color: "#74f7b5" }}>
                {isCreate ? "Create account" : "Sign in"}
              </p>
              <p className="text-[#9a9aa3] text-xs">
                {isCreate ? "Start growing your audience with Aminta" : "Sync your progress across devices"}
              </p>
            </div>

            {/* OAuth buttons */}
            <div className="space-y-2">
              <button onClick={handleGoogle}
                className="rpg-btn-secondary w-full flex items-center justify-center gap-2 text-xs">
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              <button onClick={handleGitHub}
                className="rpg-btn-secondary w-full flex items-center justify-center gap-2 text-xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.54-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                Continue with GitHub
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#343438]" />
              <span className="font-pixel text-[7px] text-[#3a3a4a]">or</span>
              <div className="flex-1 h-px bg-[#343438]" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmail} className="space-y-3">
              {isCreate && (
                <div>
                  <label className="font-pixel text-[7px] text-[#555] mb-1.5 block tracking-widest">Full name</label>
                  <input
                    type="text" placeholder="John Doe" value={name}
                    onChange={e => setName(e.target.value)} required
                    className="w-full px-3 py-2.5 rounded-lg text-sm placeholder-[#3a3a4a] text-white focus:outline-none transition-colors"
                    style={{ background: "#1f1f1f", border: "1px solid #343438" }}
                    onFocus={e => (e.currentTarget.style.borderColor = "#74f7b5")}
                    onBlur={e => (e.currentTarget.style.borderColor = "#343438")}
                  />
                </div>
              )}

              <div>
                <label className="font-pixel text-[7px] text-[#555] mb-1.5 block tracking-widest">Email address</label>
                <input
                  type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-lg text-sm placeholder-[#3a3a4a] text-white focus:outline-none transition-colors"
                  style={{ background: "#1f1f1f", border: "1px solid #343438" }}
                  onFocus={e => (e.currentTarget.style.borderColor = "#74f7b5")}
                  onBlur={e => (e.currentTarget.style.borderColor = "#343438")}
                />
              </div>

              <div>
                <label className="font-pixel text-[7px] text-[#555] mb-1.5 block tracking-widest">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"} placeholder="········" value={password}
                    onChange={e => setPassword(e.target.value)} required minLength={8}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm placeholder-[#3a3a4a] text-white focus:outline-none transition-colors"
                    style={{ background: "#1f1f1f", border: "1px solid #343438" }}
                    onFocus={e => (e.currentTarget.style.borderColor = "#74f7b5")}
                    onBlur={e => (e.currentTarget.style.borderColor = "#343438")}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-white transition-colors">
                    {showPass
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
                {isCreate && password && <PasswordStrength password={password} />}
                {isCreate && <p className="text-[#555] text-[10px] mt-1">Must be at least 8 characters</p>}
              </div>

              {isCreate && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                    className="mt-0.5 accent-[#74f7b5]" />
                  <span className="text-[#888] text-xs leading-relaxed">
                    I agree to the{" "}
                    <a href="/terms" className="text-[#74f7b5] hover:text-white transition-colors">Terms of Service</a>
                    {" "}and{" "}
                    <a href="/privacy" className="text-[#74f7b5] hover:text-white transition-colors">Privacy Policy</a>
                  </span>
                </label>
              )}

              {error && <p className="font-pixel text-[7px] text-red-400">{error}</p>}

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-lg font-pixel text-[9px] tracking-widest text-black transition-all disabled:opacity-50 hover:brightness-110 active:scale-[0.98]"
                style={{ background: "#74f7b5" }}>
                {loading ? "…" : isCreate ? "Create account" : "Sign in"}
              </button>
            </form>
          </div>
        )}

        <div className="space-y-2 text-center">
          <p className="text-[#888] text-xs">
            {isCreate
              ? <>Already have an account?{" "}<a href="/login" className="text-[#74f7b5] hover:text-white transition-colors">Sign in</a></>
              : <>Don&apos;t have an account?{" "}<a href="/login?mode=create" className="text-[#74f7b5] hover:text-white transition-colors">Create one</a></>}
          </p>
          <p className="text-[#666] text-xs">
            By continuing you agree to our{" "}
            <a href="/terms" className="text-[#888] hover:text-[#74f7b5] transition-colors">Terms</a>
            {" & "}
            <a href="/privacy" className="text-[#888] hover:text-[#74f7b5] transition-colors">Privacy</a>
          </p>
        </div>
      </div>
    </div>
  )
}

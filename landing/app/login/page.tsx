"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
// magic link removed — Google OAuth only

export const dynamic = "force-dynamic"

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
  const [isCreate, setIsCreate] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const extId = params.get("ext_id")
    if (extId) localStorage.setItem("aminta_ext_id", extId)
    setIsCreate(params.get("mode") === "create")
  }, [])

  async function handleGoogle() {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">

      <PixelFloat x="8%"  y="12%" size={6}  delay="0s"    color="#74f7b5" />
      <PixelFloat x="15%" y="70%" size={4}  delay="1.2s"  color="#74f7b5" />
      <PixelFloat x="80%" y="18%" size={8}  delay="0.7s"  color="#74f7b5" />
      <PixelFloat x="88%" y="65%" size={5}  delay="2.1s"  color="#74f7b5" />
      <PixelFloat x="72%" y="82%" size={4}  delay="0.4s"  color="#2f6b4f" />
      <PixelFloat x="25%" y="22%" size={5}  delay="1.8s"  color="#2f6b4f" />

      <div
        className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(116,247,181,0.07) 0%, transparent 70%)",
          top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm space-y-6">

        <a href="/" className="font-pixel text-[7px] tracking-widest transition-colors"
          style={{ color: "#74f7b5" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
          onMouseLeave={e => (e.currentTarget.style.color = "#74f7b5")}>
          Back
        </a>

        <div className="flex justify-center">
          <div className="aminta-glow"><DemonIcon size={40} /></div>
        </div>

        <div className="rounded-2xl p-6 space-y-5"
          style={{
            background: "rgba(36,36,36,0.85)",
            border: "1px solid #343438",
            boxShadow: "0 0 40px rgba(116,247,181,0.06), 0 20px 60px rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
          }}>
          <div>
            <p className="font-pixel text-[9px] tracking-widest mb-2" style={{ color: "#74f7b5" }}>
              {isCreate ? "Create account" : "Sign in"}
            </p>
            <p className="text-[#9a9aa3] text-xs">
              {isCreate ? "Start growing your audience with Aminta" : "Sync your progress across devices"}
            </p>
          </div>

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
        </div>

        <div className="space-y-2 text-center">
          <p className="text-[#888] text-xs">
            {isCreate ? (
              <>Already have an account?{" "}
                <a href="/login" className="text-[#74f7b5] hover:text-white transition-colors">Sign in</a>
              </>
            ) : (
              <>Don&apos;t have an account?{" "}
                <a href="/login?mode=create" className="text-[#74f7b5] hover:text-white transition-colors">Create one</a>
              </>
            )}
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

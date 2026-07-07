"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  AuthShell, CARD_STYLE, Field, OAuthButtons, OrDivider, SubmitButton,
  ensureProfile, oauthCallbackUrl, persistExtId, postAuthDestination,
} from "@/components/auth/AuthShell"

// Sign in — email/password + Google/GitHub. Account creation lives on /signup.

const isDev = process.env.NODE_ENV !== "production"

export default function LoginPage() {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors]     = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState("")
  const [loading, setLoading]   = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resent, setResent]     = useState(false)
  // Hides the form while we check for an existing session, so a
  // browser that's already signed in never flashes a blank login form.
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    persistExtId()
    // Back-compat: old "create account" links pointed at /login?mode=create.
    const params = new URLSearchParams(window.location.search)
    if (params.get("mode") === "create") {
      params.delete("mode")
      const qs = params.toString()
      window.location.replace("/signup" + (qs ? `?${qs}` : ""))
      return
    }

    // If this browser already has a live Supabase session, don't show a
    // blank login form — that's exactly how someone ends up typing in a
    // *different* account's credentials and binding the extension (or a
    // second tab) to the wrong identity than the one already active here.
    // Hand off the existing session instead, same as a fresh sign-in would.
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const dest = postAuthDestination()
        if (isDev) console.log("[auth] /login: already signed in as", session.user.email, "— redirecting to", dest)
        window.location.href = dest
        return
      }
      setCheckingSession(false)
    })
  }, [])

  function validate(): boolean {
    const next: typeof errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter a valid email address."
    if (!password) next.password = "Enter your password."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")
    setUnconfirmed(false)
    if (!validate()) return
    setLoading(true)

    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setLoading(false)
      if (/email not confirmed/i.test(error.message)) {
        setUnconfirmed(true)
        setFormError("Your email isn't verified yet. Check your inbox, or resend the link below.")
      } else if (/invalid login credentials/i.test(error.message)) {
        setFormError("Wrong email or password. If you signed up with Google or GitHub, use those buttons instead.")
      } else {
        setFormError(error.message)
      }
      return
    }

    await ensureProfile()
    window.location.href = postAuthDestination()
  }

  async function handleResendConfirmation() {
    setResent(true)
    await createClient().auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: oauthCallbackUrl() },
    })
  }

  const handleGoogle = async () => {
    await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: oauthCallbackUrl() } })
  }
  const handleGitHub = async () => {
    await createClient().auth.signInWithOAuth({ provider: "github", options: { redirectTo: oauthCallbackUrl() } })
  }

  // Avoid flashing the form while we check for an existing session above —
  // either it redirects immediately, or this clears in well under a second.
  if (checkingSession) return null

  return (
    <AuthShell>
      <div className="rounded-2xl p-6 space-y-4" style={CARD_STYLE}>
        <div>
          <p className="font-pixel text-[9px] tracking-widest mb-1" style={{ color: "#74f7b5" }}>
            Sign in
          </p>
          <p className="text-[#9a9aa3] text-xs">Welcome back. Aminta missed you.</p>
        </div>

        <OAuthButtons onGoogle={handleGoogle} onGitHub={handleGitHub} />

        <OrDivider />

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <Field
            label="Email address"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email}
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password}
          />

          <div className="flex justify-end">
            <a href="/reset-password" className="text-xs text-[#888] hover:text-[#74f7b5] transition-colors">
              Forgot password?
            </a>
          </div>

          {formError && <p className="text-xs text-red-400">{formError}</p>}
          {unconfirmed && (
            <button type="button" onClick={handleResendConfirmation} disabled={resent}
              className="text-xs transition-colors disabled:cursor-not-allowed"
              style={{ color: resent ? "#555" : "#74f7b5" }}>
              {resent ? "Verification email sent ✓" : "Resend verification email"}
            </button>
          )}

          <SubmitButton loading={loading} loadingText="Signing in…">Sign in</SubmitButton>
        </form>
      </div>

      <div className="space-y-2 text-center">
        <p className="text-[#888] text-xs">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-[#74f7b5] hover:text-white transition-colors">Create one</a>
        </p>
      </div>
    </AuthShell>
  )
}

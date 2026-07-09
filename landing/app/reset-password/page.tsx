"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  AuthShell, CARD_STYLE, Field, SubmitButton,
} from "@/components/auth/AuthShell"
import posthog from "posthog-js"

// Two modes on one route:
//   request — no session: enter email → Supabase sends a recovery link
//             (redirects through /auth/callback?next=/reset-password)
//   update  — session present (user arrived via the recovery link, or is
//             signed in and wants a new password): set a new password
type Mode = "loading" | "request" | "sent" | "update" | "done"

export default function ResetPasswordPage() {
  const [mode, setMode]         = useState<Mode>("loading")
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm]   = useState("")
  const [errors, setErrors]     = useState<{ email?: string; password?: string; confirm?: string }>({})
  const [formError, setFormError] = useState("")
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      setMode(data.session ? "update" : "request")
    })
  }, [])

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrors({ email: "Enter a valid email address." })
      return
    }
    setErrors({})
    setLoading(true)
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) { setFormError(error.message); return }
    posthog.capture("password_reset_requested")
    setMode("sent")
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")
    const next: typeof errors = {}
    if (password.length < 8) next.password = "Password must be at least 8 characters."
    if (confirm !== password) next.confirm = "Passwords don't match."
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setLoading(true)
    const { error } = await createClient().auth.updateUser({ password })
    setLoading(false)
    if (error) { setFormError(error.message); return }
    posthog.capture("password_updated")
    setMode("done")
  }

  return (
    <AuthShell backHref="/login">
      <div className="rounded-2xl p-6 space-y-4" style={CARD_STYLE}>

        {mode === "loading" && (
          <p className="text-center text-[#555] text-sm py-6">Loading…</p>
        )}

        {mode === "request" && (
          <>
            <div>
              <p className="font-pixel text-[9px] tracking-widest mb-1" style={{ color: "#74f7b5" }}>
                Reset password
              </p>
              <p className="text-[#9a9aa3] text-xs">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>
            <form onSubmit={handleRequest} className="space-y-3" noValidate>
              <Field
                label="Email address"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email}
              />
              {formError && <p className="text-xs text-red-400">{formError}</p>}
              <SubmitButton loading={loading} loadingText="Sending…">Send reset link</SubmitButton>
            </form>
          </>
        )}

        {mode === "sent" && (
          <div className="text-center space-y-3 py-2">
            <p className="text-white font-semibold text-base">Check your email</p>
            <p className="text-[#9a9aa3] text-sm leading-relaxed">
              If an account exists for{" "}
              <span style={{ color: "#74f7b5" }}>{email.trim()}</span>, a reset
              link is on its way.
            </p>
          </div>
        )}

        {mode === "update" && (
          <>
            <div>
              <p className="font-pixel text-[9px] tracking-widest mb-1" style={{ color: "#74f7b5" }}>
                New password
              </p>
              <p className="text-[#9a9aa3] text-xs">Choose a new password for your account.</p>
            </div>
            <form onSubmit={handleUpdate} className="space-y-3" noValidate>
              <Field
                label="New password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="8+ characters"
                autoComplete="new-password"
                error={errors.password}
              />
              <Field
                label="Confirm new password"
                type="password"
                value={confirm}
                onChange={setConfirm}
                placeholder="••••••••"
                autoComplete="new-password"
                error={errors.confirm}
              />
              {formError && <p className="text-xs text-red-400">{formError}</p>}
              <SubmitButton loading={loading} loadingText="Saving…">Set new password</SubmitButton>
            </form>
          </>
        )}

        {mode === "done" && (
          <div className="text-center space-y-4 py-2">
            <p className="text-white font-semibold text-base">Password updated ✓</p>
            <a href="/dashboard"
              className="inline-block w-full py-3 rounded-lg font-pixel text-[9px] tracking-widest text-black transition-all hover:brightness-110"
              style={{ background: "#74f7b5" }}>
              Go to dashboard
            </a>
          </div>
        )}
      </div>
    </AuthShell>
  )
}

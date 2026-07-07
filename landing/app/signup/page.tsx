"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  AuthShell, CARD_STYLE, Field, OAuthButtons, OrDivider, SubmitButton,
  ensureProfile, oauthCallbackUrl, persistExtId, postAuthDestination,
} from "@/components/auth/AuthShell"

// Real account creation: name, email, password, confirm, optional referral,
// terms consent. Email/password via Supabase signUp. If email confirmation is
// enabled in Supabase, signUp returns no session — we show an honest
// "check your email" screen (never a code-entry screen; no codes are sent).

interface FieldErrors {
  name?: string
  email?: string
  password?: string
  confirm?: string
  terms?: string
}

export default function SignupPage() {
  const [name, setName]         = useState("")
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm]   = useState("")
  const [referral, setReferral] = useState("")
  const [terms, setTerms]       = useState(false)
  const [errors, setErrors]     = useState<FieldErrors>({})
  const [formError, setFormError] = useState("")
  const [loading, setLoading]   = useState(false)
  const [step, setStep]         = useState<"form" | "verify">("form")
  const [resent, setResent]     = useState(false)

  useEffect(() => { persistExtId() }, [])

  function validateField(field: keyof FieldErrors): string | undefined {
    switch (field) {
      case "name":
        return name.trim() ? undefined : "Enter your name."
      case "email":
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : "Enter a valid email address."
      case "password":
        return password.length >= 8 ? undefined : "Password must be at least 8 characters."
      case "confirm":
        return confirm === password ? undefined : "Passwords don't match."
      case "terms":
        return terms ? undefined : "You need to accept the Terms & Privacy Policy."
    }
  }

  function blurValidate(field: keyof FieldErrors) {
    setErrors(prev => ({ ...prev, [field]: validateField(field) }))
  }

  function validateAll(): boolean {
    const next: FieldErrors = {}
    for (const f of ["name", "email", "password", "confirm", "terms"] as const) {
      const err = validateField(f)
      if (err) next[f] = err
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")
    if (!validateAll()) return
    setLoading(true)

    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: oauthCallbackUrl(),
        data: {
          full_name: name.trim(),
          ...(referral.trim() ? { referral_code: referral.trim() } : {}),
        },
      },
    })

    if (error) {
      setLoading(false)
      setFormError(
        /already registered/i.test(error.message)
          ? "An account with this email already exists — sign in instead."
          : error.message
      )
      return
    }

    // Supabase obfuscates existing accounts: signUp "succeeds" but returns a
    // user with no identities. Treat it as "account exists".
    if (data.user && data.user.identities?.length === 0) {
      setLoading(false)
      setFormError("An account with this email already exists — sign in instead.")
      return
    }

    if (data.session) {
      // Email confirmation disabled — user is signed in right now.
      await ensureProfile()
      window.location.href = postAuthDestination()
      return
    }

    // Email confirmation enabled — no session until the link is clicked.
    setLoading(false)
    setStep("verify")
  }

  async function handleResend() {
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

  if (step === "verify") {
    return (
      <AuthShell onBack={() => { setStep("form"); setResent(false) }}>
        <div className="rounded-2xl p-6 space-y-5 text-center" style={CARD_STYLE}>
          <div className="flex justify-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#74f7b5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polyline points="2,4 12,13 22,4" />
            </svg>
          </div>
          <div className="space-y-1.5">
            <p className="text-white font-semibold text-base">Check your email</p>
            <p className="text-[#9a9aa3] text-sm leading-relaxed">
              We sent a verification link to{" "}
              <span style={{ color: "#74f7b5" }}>{email.trim()}</span>.
              <br />
              Click it to activate your account.
            </p>
          </div>

          <div className="h-px bg-[#343438]" />

          <div className="space-y-1">
            <p className="text-[#888] text-sm">Didn&apos;t get it? Check spam, or</p>
            <button onClick={handleResend} disabled={resent}
              className="text-sm font-medium transition-colors disabled:cursor-not-allowed"
              style={{ color: resent ? "#555" : "#74f7b5" }}>
              {resent ? "Email sent ✓" : "Resend verification email"}
            </button>
          </div>
        </div>

        <p className="text-center text-[#666] text-xs">
          You can close this tab after verifying — then sign in.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="rounded-2xl p-6 space-y-4" style={CARD_STYLE}>
        <div>
          <p className="font-pixel text-[9px] tracking-widest mb-1" style={{ color: "#74f7b5" }}>
            Create account
          </p>
          <p className="text-[#9a9aa3] text-xs">Start growing your audience with Aminta</p>
        </div>

        <OAuthButtons onGoogle={handleGoogle} onGitHub={handleGitHub} />

        <OrDivider />

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <Field
            label="Full name"
            value={name}
            onChange={setName}
            onBlur={() => blurValidate("name")}
            placeholder="Ada Lovelace"
            autoComplete="name"
            error={errors.name}
          />
          <Field
            label="Email address"
            value={email}
            onChange={setEmail}
            onBlur={() => blurValidate("email")}
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email}
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            onBlur={() => blurValidate("password")}
            placeholder="8+ characters"
            autoComplete="new-password"
            error={errors.password}
          />
          <Field
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            onBlur={() => blurValidate("confirm")}
            placeholder="••••••••"
            autoComplete="new-password"
            error={errors.confirm}
          />
          <Field
            label="Referral code"
            value={referral}
            onChange={setReferral}
            placeholder="FRIEND-1234"
            optional
          />

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={terms}
              onChange={e => { setTerms(e.target.checked); setErrors(prev => ({ ...prev, terms: undefined })) }}
              className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#74f7b5]"
            />
            <span className="text-xs text-[#888] leading-relaxed">
              I agree to the{" "}
              <a href="/terms" target="_blank" className="text-[#9a9aa3] underline hover:text-[#74f7b5] transition-colors">Terms of Service</a>
              {" "}and{" "}
              <a href="/privacy" target="_blank" className="text-[#9a9aa3] underline hover:text-[#74f7b5] transition-colors">Privacy Policy</a>
            </span>
          </label>
          {errors.terms && <p className="text-xs text-red-400">{errors.terms}</p>}

          {formError && (
            <p className="text-xs text-red-400">
              {formError}{" "}
              {formError.includes("already exists") && (
                <a href="/login" className="underline text-[#74f7b5]">Sign in</a>
              )}
            </p>
          )}

          <SubmitButton loading={loading} loadingText="Creating account…">Create account</SubmitButton>
        </form>
      </div>

      <div className="space-y-2 text-center">
        <p className="text-[#888] text-xs">
          Already have an account?{" "}
          <a href="/login" className="text-[#74f7b5] hover:text-white transition-colors">Sign in</a>
        </p>
      </div>
    </AuthShell>
  )
}

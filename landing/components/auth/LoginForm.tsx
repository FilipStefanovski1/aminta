"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  AuthShell, CARD_STYLE, Field, OAuthButtons, OrDivider, SubmitButton,
  ensureProfile, oauthCallbackUrl, persistExtId, postAuthDestination, shouldSkipPassiveSessionRestore,
} from "@/components/auth/AuthShell"
import type { AuthProvidersConfig } from "@/lib/authProviders"
import posthog from "posthog-js"

// Sign-in form and logic — the single /login route. `providers` sets what's
// visible BY DEFAULT (X-only today, per AUTH_PROVIDERS). Every method stays
// fully implemented regardless of what's shown; visibility is the only thing
// `providers` controls, so re-enabling one later is a config change here, not
// a rewrite of this file.
//
// Existing Google/email accounts are never stranded behind a separate page:
// if anything is hidden by the default config, a subtle "Sign in with
// another method" link reveals every implemented method in place, in the
// same form, on the same route. One login experience, not two.

const isDev = process.env.NODE_ENV !== "production"

export function LoginForm({ providers }: { providers: AuthProvidersConfig }) {
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
  // Set when this page loads with ?error=... — e.g. /auth/callback
  // redirecting here after Supabase couldn't exchange the X OAuth code
  // ("Unable to exchange external code..." — a provider/credential-level
  // failure on Supabase's side, not something this page caused). Shown
  // inline so a user retrying directly on this tab sees why the first
  // attempt didn't work, not just a blank form again.
  const [oauthError, setOauthError] = useState(false)
  // Default view only shows what `providers` allows (X-only today). If
  // anything is hidden, "Sign in with another method" flips this to reveal
  // every implemented method in place — same route, same form, no separate
  // page. Once revealed there's nothing left to reveal, so the link itself
  // disappears along with the rest of the collapsed state.
  const [showAll, setShowAll] = useState(false)
  const hasHiddenProviders = !providers.google || !providers.email
  const visible: AuthProvidersConfig = showAll
    ? { x: true, google: true, email: true }
    : providers

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

    // /auth/callback redirects here with ?error=... when Supabase couldn't
    // complete the OAuth flow (e.g. "Unable to exchange external code" — a
    // provider-side token-exchange failure, not a bug in this page). If the
    // attempt started from the extension (ext_id persisted to localStorage
    // when this page first loaded, before the OAuth redirect — it's never
    // on this failure redirect's own URL), tell the extension immediately
    // via the same content-script bridge extension-auth uses for success,
    // rather than leaving the sidepanel spinning until its own timeout.
    // See extension/contents/aminta-auth-bridge.ts.
    if (params.get("error")) {
      setOauthError(true)
      window.history.replaceState({}, "", "/login")
      const extId = localStorage.getItem("aminta_ext_id")
      if (extId) {
        window.postMessage({ type: "AMINTA_AUTH_ERROR", error: "auth_failed" }, window.location.origin)
      }
    }

    // ?ext_id means the extension opened this page specifically to
    // authenticate itself — always show the real form and let X's own OAuth
    // flow decide the outcome. See shouldSkipPassiveSessionRestore's own
    // comment for why the passive-session shortcut below must never apply
    // here: it's exactly how "Connect with X" ends up silently restoring a
    // different account than the one active on x.com.
    if (shouldSkipPassiveSessionRestore(window.location.search)) {
      setCheckingSession(false)
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
        setFormError("Wrong email or password. Make sure you're using the same sign-in method you used when creating your account.")
      } else {
        setFormError(error.message)
      }
      return
    }

    await ensureProfile()
    const { data: { session } } = await createClient().auth.getSession()
    if (session) {
      posthog.identify(session.user.id)
      posthog.capture("user_logged_in", { method: "email" })
    }
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
    posthog.capture("google_oauth_initiated", { page: "login" })
    await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: oauthCallbackUrl() } })
  }

  // Identical shape to handleGoogle — same redirectTo, same callback route,
  // same extension handoff. Deliberately passes NO `scopes`: Supabase's X
  // provider already requests the identity-only set (users.email, users.read,
  // tweet.read, offline.access) and a custom `scopes` value is APPENDED to
  // that list rather than replacing it, so passing anything here could only
  // ever request MORE than identity. Read-only by construction.
  const handleX = async () => {
    posthog.capture("x_oauth_initiated", { page: "login" })
    await createClient().auth.signInWithOAuth({ provider: "x", options: { redirectTo: oauthCallbackUrl() } })
  }

  // Avoid flashing the form while we check for an existing session above —
  // either it redirects immediately, or this clears in well under a second.
  if (checkingSession) return null

  return (
    <AuthShell>
      <div className="rounded-2xl p-6 space-y-4" style={CARD_STYLE}>
        <div>
          <p className="font-pixel text-[9px] tracking-widest mb-1" style={{ color: "var(--accent)" }}>
            Sign in
          </p>
          {showAll && (
            <p className="text-[#9a9aa3] text-xs">
              Welcome back. Aminta missed you.
            </p>
          )}
        </div>

        {oauthError && (
          <p className="text-xs text-red-400">Couldn&apos;t connect to X. Try again.</p>
        )}

        <OAuthButtons onGoogle={handleGoogle} onX={handleX} showGoogle={visible.google} showX={visible.x} />

        {!showAll && hasHiddenProviders && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full text-center text-xs text-[#888] hover:text-accent transition-colors"
          >
            Use another sign-in method
          </button>
        )}

        {visible.email && (
          <>
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
                <a href="/reset-password" className="text-xs text-[#888] hover:text-accent transition-colors">
                  Forgot password?
                </a>
              </div>

              {formError && <p className="text-xs text-red-400">{formError}</p>}
              {unconfirmed && (
                <button type="button" onClick={handleResendConfirmation} disabled={resent}
                  className="text-xs transition-colors disabled:cursor-not-allowed"
                  style={{ color: resent ? "#555" : "var(--accent)" }}>
                  {resent ? "Verification email sent ✓" : "Resend verification email"}
                </button>
              )}

              <SubmitButton loading={loading} loadingText="Signing in…">Sign in</SubmitButton>
            </form>
          </>
        )}
      </div>

      <div className="space-y-2 text-center">
        <p className="text-[#888] text-xs">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-accent hover:text-white transition-colors">Create one</a>
        </p>
      </div>
    </AuthShell>
  )
}

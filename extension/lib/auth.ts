const AUTH_KEYS = ["auth_access_token", "auth_refresh_token", "auth_user_id", "auth_user_email"] as const

export interface AuthSession {
  accessToken: string
  refreshToken: string
  userId: string
  email: string
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const data = await chrome.storage.local.get(AUTH_KEYS as unknown as string[])
  if (!data.auth_access_token) return null
  return {
    accessToken: data.auth_access_token,
    refreshToken: data.auth_refresh_token,
    userId: data.auth_user_id,
    email: data.auth_user_email,
  }
}

export async function setAuthSession(session: AuthSession): Promise<void> {
  await chrome.storage.local.set({
    auth_access_token: session.accessToken,
    auth_refresh_token: session.refreshToken,
    auth_user_id: session.userId,
    auth_user_email: session.email,
  })
}

export async function clearAuthSession(): Promise<void> {
  await chrome.storage.local.remove(AUTH_KEYS as unknown as string[])
}

const isDev = (() => {
  try { return !("update_url" in chrome.runtime.getManifest()) } catch { return false }
})()

// www, not the bare apex — see lib/sync.ts's API_URL comment: amintaapp.com
// 308-redirects every API request to www.amintaapp.com, an extra
// cross-origin hop worth avoiding on every fetch call.
const LOGOUT_URL = "https://www.amintaapp.com/api/auth/logout"
// A background (unfocused) tab at this page signs the WEBSITE itself out —
// see app/logout-complete/page.tsx. The extension has no access to
// amintaapp.com's own browser-side Supabase session (createBrowserClient
// stores it in that origin's own cookies), so without this, "Sign out" in
// the extension left the website still fully signed in — which is exactly
// what let a later "Connect with X" silently hand back that same stale
// account (see shouldSkipPassiveSessionRestore in landing's AuthShell.tsx
// for the other half of that fix). Never touches x.com.
const LOGOUT_COMPLETE_URL = "https://amintaapp.com/logout-complete"

// Not a discriminated union on purpose — see lib/xAccountGuard.ts's
// GuardResult for why: this project builds with `strict: false`, under
// which `if (!result.ok)` does not reliably narrow a
// `{ok:true}|{ok:false,error}` union at every call site.
export interface SignOutResult {
  ok: boolean
  error?: string
}

/**
 * Signs out everywhere, not just this device: revokes the underlying
 * Supabase session server-side first (POST /api/auth/logout, scope
 * "global" — see that route), then always clears the local copy.
 *
 * The local clear is UNCONDITIONAL now, not gated on the remote call
 * succeeding. It used to leave local state untouched on any non-2xx
 * response ("clearing anyway would show a half-logged-out state") — but
 * that reasoning only holds if the remote session is actually still alive,
 * and the single most common way this call fails is the opposite: the
 * access token was already expired/invalid, so there was never a live
 * server-side session left to half-clear. The server route already treats
 * that specific case (401/403 — see isTolerableLogoutError there) as a
 * successful sign-out and returns 200; this was still only reachable if
 * that route response never arrived (network down) or came back with a
 * genuinely different failure the extension had no way to distinguish from
 * "your account is stuck" — which is exactly the "Sign out failed. Try
 * again." bug: the user's ONLY signal was to press the same button again,
 * against the same already-broken remote call, forever.
 *
 * The local credential is what actually lets THIS device act as the user —
 * once it's cleared, this device can no longer use it regardless of
 * whatever state the token is in server-side, so there is no meaningful
 * security cost to always clearing it. The only thing that can genuinely
 * fail here is clearAuthSession() itself throwing (a broken storage write),
 * which is the one real "can't safely complete" case still surfaced as an
 * error — see the catch below.
 */
export async function signOutEverywhere(): Promise<SignOutResult> {
  const session = await getAuthSession()
  if (session?.accessToken) {
    try {
      const res = await fetch(LOGOUT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
      if (isDev && !res.ok) {
        console.warn("[Aminta auth] remote sign-out did not confirm (status", res.status, ") — clearing local session anyway")
      }
    } catch (e) {
      // Network unreachable — the remote revoke simply never happened.
      // Still not a reason to trap the user on this device; sync/refresh
      // will surface connectivity problems on their own the next time
      // something actually needs the network.
      if (isDev) console.warn("[Aminta auth] remote sign-out request failed (network) — clearing local session anyway:", e)
    }
  }

  try {
    await clearAuthSession()
  } catch (e) {
    if (isDev) console.error("[Aminta auth] local sign-out failed:", e)
    return { ok: false, error: "Couldn't sign out on this device. Try again." }
  }

  // Best-effort, fire-and-forget: the extension's own sign-out is already
  // complete at this point (local state cleared above) and must not wait on
  // or be blocked by this — a background tab failing to open, the page
  // failing to load, or the bridge message never arriving all leave the
  // extension correctly signed out regardless. This only ever ADDS "the
  // website is also signed out" on top of that, opened unfocused so it
  // never interrupts whatever the user is doing.
  try {
    await chrome.tabs.create({ url: LOGOUT_COMPLETE_URL, active: false })
  } catch (e) {
    if (isDev) console.warn("[Aminta auth] couldn't open logout-complete tab:", e)
  }

  return { ok: true }
}

// www, not the bare apex — see lib/sync.ts's API_URL comment. This one
// matters most of all: it's on the retry path of every authed fetch in the
// extension, so a flaky redirect here can look like everything is broken.
const REFRESH_URL = "https://www.amintaapp.com/api/auth/refresh"

// Exchange the stored refresh token for a fresh access token via the website
// (which holds the Supabase project config). Supabase access tokens expire in
// ~1 hour, so every authed request must be able to recover through this.
//
// Returns the new session on success.
// Returns null and CLEARS the session when the refresh token itself is
// invalid/expired (definitive sign-out — the sidepanel's storage listener
// flips the UI to the login screen so the user sees it).
// Returns null and KEEPS the session on network/server errors (offline is
// not a sign-out).
export async function refreshAuthSession(): Promise<AuthSession | null> {
  const session = await getAuthSession()
  if (!session?.refreshToken) return null

  let res: Response
  try {
    res = await fetch(REFRESH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    })
  } catch {
    return null // offline / transient — keep the session, retry later
  }

  if (res.status === 400 || res.status === 401) {
    await clearAuthSession()
    return null
  }
  if (!res.ok) return null // 5xx — transient, keep the session

  try {
    const data = await res.json()
    if (!data?.access_token || !data?.refresh_token) return null
    const next: AuthSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userId: data.user?.id ?? session.userId,
      email: data.user?.email ?? session.email,
    }
    await setAuthSession(next)
    return next
  } catch {
    return null
  }
}

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

const REFRESH_URL = "https://amintaapp.com/api/auth/refresh"

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

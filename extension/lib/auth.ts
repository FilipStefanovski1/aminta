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

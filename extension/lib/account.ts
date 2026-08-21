// Real account deletion — not sign-out. See landing/app/api/account/route.ts
// for the server-side cascade/billing-safety behavior.
import { getAuthSession, refreshAuthSession } from "~lib/auth"

const BASE = "https://amintaapp.com/api"

export async function deleteAccount(): Promise<void> {
  const session = await getAuthSession()
  if (!session) throw new Error("Sign in required.")

  const call = (token: string) =>
    fetch(`${BASE}/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirm: "DELETE" }),
    })

  let res = await call(session.accessToken)
  if (res.status === 401) {
    const refreshed = await refreshAuthSession()
    if (!refreshed) throw new Error("Session expired. Please sign in again.")
    res = await call(refreshed.accessToken)
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) msg = json.error
    } catch { /* keep the generic message */ }
    throw new Error(msg)
  }
}

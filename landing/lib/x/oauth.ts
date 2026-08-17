// X OAuth 2.0 Authorization Code + PKCE.
//
// Endpoints and scopes verified against X's official documentation
// (docs.x.com, "OAuth 2.0 Authorization Code Flow with PKCE"):
//   authorize  https://x.com/i/oauth2/authorize
//   token      https://api.x.com/2/oauth2/token
//
// Scopes are the documented minimum for GET /2/users/:id/tweets, plus
// offline.access. Per the docs, "If the scope offline.access is applied an
// OAuth 2.0 refresh token will be issued" — without it there is no refresh
// token at all, and a feature used a few times a month would demand
// reconnection constantly.
//
// Aminta is a confidential client (Web App), so the token exchange sends the
// client secret via HTTP Basic. PKCE is still applied: it binds the
// authorization code to this specific request, so an intercepted code is
// useless without the verifier.
import { createHash, randomBytes } from "node:crypto"

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize"
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token"
export const X_REVOKE_URL = "https://api.x.com/2/oauth2/revoke"

/** Read-only. Never request a write scope — Voice Refresh only reads. */
export const X_SCOPES = ["tweet.read", "users.read", "offline.access"] as const

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export interface PkcePair {
  verifier: string
  challenge: string
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

export function createState(): string {
  return randomBytes(32).toString("base64url")
}

export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.amintaapp.com"
  return `${base.replace(/\/$/, "")}/api/x/oauth/callback`
}

export function buildAuthorizeUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    scope: X_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })
  return `${X_AUTHORIZE_URL}?${params.toString()}`
}

function basicAuthHeader(): string {
  const id = process.env.X_CLIENT_ID ?? ""
  const secret = process.env.X_CLIENT_SECRET ?? ""
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`
}

export interface XTokenSet {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
}

async function tokenRequest(body: URLSearchParams): Promise<XTokenSet> {
  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body,
  })
  if (!res.ok) {
    // Status only. The body can echo the code or verifier, and neither may
    // ever reach a log.
    throw new Error(`x_token_request_failed_${res.status}`)
  }
  const json = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!json.access_token) throw new Error("x_token_response_missing_access_token")
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
  }
}

export function exchangeCode(code: string, verifier: string): Promise<XTokenSet> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    })
  )
}

export function refreshAccessToken(refreshToken: string): Promise<XTokenSet> {
  return tokenRequest(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
  )
}

/** Best-effort revoke on disconnect. Failure must not block deletion. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(X_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({ token, token_type_hint: "access_token" }),
    })
  } catch {
    // Deliberately silent: the user asked to disconnect, and the local
    // credentials are deleted regardless of what X says.
  }
}

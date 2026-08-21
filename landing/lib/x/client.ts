// X API client — the only place that talks to api.x.com.
//
// Endpoint verified against official docs: GET /2/users/{id}/tweets,
// max_results maximum 100, exclude accepts "replies" and "retweets".
//
// Cost discipline: X bills per post read (standard Post Read pricing; the
// $0.001 Owned Read rate does NOT apply here, because it requires the
// authenticating user to be the owner of the developer app, and our
// authenticating users are customers). exclude=retweets,replies is applied
// SERVER-SIDE by X, so we never pay to read posts we would discard. That is
// what keeps a typical refresh to one 25-post request.
import { decryptToken, encryptToken } from "@/lib/x/crypto"
import { refreshAccessToken } from "@/lib/x/oauth"
import { createServiceClient } from "@/lib/supabase/server"
import type { RawXPost } from "@/lib/x/filter"

const API_BASE = "https://api.x.com/2"

/** First page. Big enough to usually yield a full corpus, small enough to stay cheap. */
export const FIRST_FETCH = 25
/** Only if the first page underdelivers. */
export const SECOND_FETCH = 25
/** Hard ceiling per refresh, enforced regardless of anything else. */
export const MAX_FETCH = 50

export class XApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

interface TimelinePage {
  posts: RawXPost[]
  nextToken: string | null
}

function mapPosts(json: {
  data?: Array<{ id: string; text: string; referenced_tweets?: Array<{ type: string; id: string }> }>
  includes?: { tweets?: Array<{ id: string; text: string }> }
  meta?: { next_token?: string }
}): TimelinePage {
  const quotedById = new Map((json.includes?.tweets ?? []).map((t) => [t.id, t.text]))
  const posts = (json.data ?? []).map((t) => {
    const refs = t.referenced_tweets ?? []
    const quoted = refs.find((r) => r.type === "quoted")
    return {
      id: t.id,
      text: t.text,
      referencedTypes: refs.map((r) => r.type),
      quotedText: quoted ? quotedById.get(quoted.id) ?? null : null,
    }
  })
  return { posts, nextToken: json.meta?.next_token ?? null }
}

async function get(path: string, accessToken: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401) throw new XApiError(401, "x_unauthorized")
  if (res.status === 429) throw new XApiError(429, "x_rate_limited")
  if (!res.ok) throw new XApiError(res.status, `x_error_${res.status}`)
  return res.json()
}

/**
 * Returns a usable access token, refreshing and re-persisting it if the
 * stored one has expired. Tokens are decrypted only in memory and are never
 * returned to any caller outside this module's own requests.
 */
async function usableAccessToken(userId: string): Promise<{ token: string; xUserId: string }> {
  const service = await createServiceClient()
  const { data } = await service
    .from("x_connections")
    .select("x_user_id, access_token_cipher, refresh_token_cipher, token_expires_at")
    .eq("user_id", userId)
    .single()

  if (!data) throw new XApiError(400, "x_not_connected")

  const expired =
    data.token_expires_at != null && Date.parse(data.token_expires_at) < Date.now() + 60_000

  if (!expired) {
    return { token: decryptToken(data.access_token_cipher), xUserId: data.x_user_id }
  }

  if (!data.refresh_token_cipher) throw new XApiError(401, "x_reauth_required")

  let next
  try {
    next = await refreshAccessToken(decryptToken(data.refresh_token_cipher))
  } catch {
    // A revoked or rotated refresh token is unrecoverable — the user must
    // reconnect. Surfaced as its own code so the UI can say exactly that.
    throw new XApiError(401, "x_reauth_required")
  }

  await service
    .from("x_connections")
    .update({
      access_token_cipher: encryptToken(next.accessToken),
      refresh_token_cipher: next.refreshToken ? encryptToken(next.refreshToken) : data.refresh_token_cipher,
      token_expires_at: next.expiresAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  return { token: next.accessToken, xUserId: data.x_user_id }
}

export async function fetchOwnPosts(
  userId: string,
  maxResults: number,
  paginationToken?: string | null
): Promise<TimelinePage & { xUserId: string }> {
  const { token, xUserId } = await usableAccessToken(userId)
  const params = new URLSearchParams({
    max_results: String(Math.min(maxResults, 100)),
    // Applied by X before billing — we never pay for these.
    exclude: "retweets,replies",
    "tweet.fields": "id,text,referenced_tweets,created_at",
    expansions: "referenced_tweets.id",
  })
  if (paginationToken) params.set("pagination_token", paginationToken)

  const json = await get(`/users/${xUserId}/tweets?${params.toString()}`, token)
  return { ...mapPosts(json as never), xUserId }
}

/** Identity of the connected account — fetched once at connect time and
 * cached (x_connections.x_display_name/x_avatar_url) so Settings never
 * needs a live X API call just to render an avatar. */
export async function fetchMe(
  accessToken: string
): Promise<{ id: string; username: string; name: string | null; profileImageUrl: string | null }> {
  const json = (await get("/users/me?user.fields=username,name,profile_image_url", accessToken)) as {
    data?: { id: string; username: string; name?: string; profile_image_url?: string }
  }
  if (!json.data?.id) throw new XApiError(500, "x_me_failed")
  return {
    id: json.data.id,
    username: json.data.username,
    name: json.data.name ?? null,
    // X serves the "_normal" (48x48) size by default; swap to a larger
    // variant for a crisper Settings avatar without a second request.
    profileImageUrl: json.data.profile_image_url?.replace("_normal", "_200x200") ?? null,
  }
}

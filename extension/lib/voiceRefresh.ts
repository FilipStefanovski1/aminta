// Voice Refresh client.
//
// Thin on purpose: entitlement, allowance, X reads and the Gemini call all
// happen server-side. This file starts the OAuth tab, asks the backend to run
// a refresh, and writes the resulting StyleProfile into the same cache the
// existing DNA system already uses.
//
// It never sees an X access token, refresh token, or the raw posts — the
// backend returns only the distilled profile plus counts.
import { getAuthSession, refreshAuthSession } from "~lib/auth"
import { parseStyleProfile, computeConfidenceScore, X_HISTORY_SOURCE_PREFIX } from "~lib/styleProfile"
import { getStore, setStore } from "~lib/storage"
import type { StyleCorpusEntry, StyleProfile } from "~lib/storage"

const BASE = "https://amintaapp.com/api/x"

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await getAuthSession()
  if (!session) throw new Error("Sign in required.")

  const call = (token: string) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })

  let res = await call(session.accessToken)
  if (res.status === 401) {
    const refreshed = await refreshAuthSession()
    if (!refreshed) throw new Error("Session expired. Please sign in again.")
    res = await call(refreshed.accessToken)
  }
  return res
}

async function errorFrom(res: Response): Promise<Error> {
  let msg = `Request failed (${res.status}).`
  try {
    const json = (await res.json()) as { error?: string }
    if (json.error) msg = json.error
  } catch { /* keep the generic message */ }
  return new Error(msg)
}

/** Opens X's authorization page in a new tab. */
export async function startXConnect(): Promise<void> {
  const res = await authedFetch("/oauth/start", { method: "POST" })
  if (!res.ok) throw await errorFrom(res)
  const { authorizeUrl } = (await res.json()) as { authorizeUrl: string }
  await chrome.tabs.create({ url: authorizeUrl })
}

export async function disconnectX(): Promise<void> {
  const res = await authedFetch("/connection", { method: "DELETE" })
  if (!res.ok) throw await errorFrom(res)
  await setStore({ xConnected: false, xUsername: "" })
}

export interface ConnectionState {
  connected: boolean
  username: string | null
  entitled: boolean
  remaining: number
  allowance: number
  periodEnd: string
  lastRefreshAt: string | null
}

export async function fetchConnectionState(): Promise<ConnectionState> {
  const res = await authedFetch("/connection")
  if (!res.ok) throw await errorFrom(res)
  const j = (await res.json()) as Record<string, unknown>
  const state: ConnectionState = {
    connected: !!j.connected,
    username: (j.username as string) ?? null,
    entitled: !!j.entitled,
    remaining: (j.remaining as number) ?? 0,
    allowance: (j.allowance as number) ?? 0,
    periodEnd: (j.period_end as string) ?? "",
    lastRefreshAt: (j.last_refresh_at as string) ?? null,
  }
  await setStore({
    xConnected: state.connected,
    xUsername: state.username ?? "",
    voiceRefreshRemaining: state.remaining,
    voiceRefreshAllowance: state.allowance,
    voiceRefreshPeriodEnd: state.periodEnd,
    lastVoiceRefreshAt: state.lastRefreshAt ?? "",
  })
  return state
}

/**
 * True when every descriptive field came back blank — the shape
 * parseStyleProfile returns when the model output could not be read. An
 * all-empty profile teaches generation nothing, so it must never replace a
 * real one.
 */
export function isEmptyProfile(p: StyleProfile): boolean {
  return [
    p.rhythm, p.punctuation, p.emojiUsage, p.humorStyle,
    p.formattingPreferences, p.rhetoricalDevices, p.cadence,
  ].every((v) => !v || v.trim() === "")
}

export interface RefreshResult {
  postsAnalyzed: number
  remaining: number
  allowance: number
}

/**
 * Runs one Voice Refresh and installs the resulting profile.
 *
 * requestId is generated once per click and reused across the internal
 * 401-refresh retry, so a token refresh mid-flight cannot consume a second
 * allowance — the backend's reservation is idempotent per (user, requestId).
 *
 * The existing profile is only overwritten AFTER a successful parse, so a
 * failed or malformed refresh leaves a good DNA profile intact.
 */
export async function runVoiceRefresh(): Promise<RefreshResult> {
  const requestId = crypto.randomUUID()
  const res = await authedFetch("/voice-refresh", {
    method: "POST",
    body: JSON.stringify({ requestId }),
  })
  if (!res.ok) throw await errorFrom(res)

  const json = (await res.json()) as {
    profileJson: string
    postsAnalyzed: number
    refreshes: { remaining: number; allowance: number; periodEnd: string }
  }

  // computeConfidenceScore only reads corpus.length, so a length-accurate
  // placeholder gives the same deterministic score the local path would.
  const sized: StyleCorpusEntry[] = Array.from({ length: json.postsAnalyzed }, () => ({
    text: "", source: "x_history" as const,
  }))
  const profile = parseStyleProfile(json.profileJson, computeConfidenceScore(sized))

  // parseStyleProfile never throws — malformed JSON yields a NEUTRAL default
  // profile. Installing that would silently erase a good DNA profile and
  // replace it with something blander than what the user had, which is the
  // worst outcome of a failed refresh. Detect it and keep the old profile.
  if (isEmptyProfile(profile)) {
    throw new Error("Couldn't read the new voice profile. Your existing profile was kept.")
  }

  const store = await getStore()
  await setStore({
    styleProfile: profile,
    // This prefix is what getOrBuildStyleProfile() checks to treat the
    // profile as authoritative and skip its own corpus/hash rebuild —
    // see isXHistorySourced() in styleProfile.ts. The timestamp suffix
    // just keeps each refresh's value distinct; it plays no role in that
    // check. Written together with styleProfile in one setStore call so
    // the two can never desync, and both travel as a pair through cloud
    // sync (lib/sync.ts push/pull), which is what keeps a second device
    // from treating a pulled X-derived profile as manually sourced.
    styleProfileHash: `${X_HISTORY_SOURCE_PREFIX}${Date.now()}`,
    voiceRefreshRemaining: json.refreshes.remaining,
    voiceRefreshAllowance: json.refreshes.allowance,
    voiceRefreshPeriodEnd: json.refreshes.periodEnd,
    lastVoiceRefreshAt: new Date().toISOString(),
    xConnected: store.xConnected || true,
  })

  return {
    postsAnalyzed: json.postsAnalyzed,
    remaining: json.refreshes.remaining,
    allowance: json.refreshes.allowance,
  }
}

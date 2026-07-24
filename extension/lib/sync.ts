import { getAuthSession, refreshAuthSession, type AuthSession } from "./auth"
import { getStore, setStore, type AmintaStore, type AmintaTemplate } from "./storage"

const API_URL = "https://amintaapp.com/api/sync"

const isDev = !("update_url" in chrome.runtime.getManifest())

// Bumped by lib/accountScope.ts's handleAuthUserChanged() every time the
// signed-in user changes in this JS context (sidepanel page or background
// service worker — each has its own module instance/epoch, which is the
// right scope since an in-flight Promise can't outlive the page it started
// in anyway).
//
// push/pull calls are fired-and-forgotten from several places (XP award,
// onboarding completion, the startup pull raced against a timeout). Without
// this guard, a slow request started under account A that resolves *after*
// the user has switched to account B would either push A's cached XP onto
// B's cloud row (using whatever token happens to be in storage when the
// fetch fires) or overwrite B's freshly-loaded local state with A's stale
// merge result. Every send and every write below re-checks the epoch
// immediately beforehand and bails out if it's stale.
let syncEpoch = 0
export function currentSyncEpoch(): number {
  return syncEpoch
}
export function bumpSyncEpoch(): number {
  return ++syncEpoch
}

// Sync status is written to chrome.storage.local so the UI (Settings) can show
// it. Sync must never fail silently.
//   ok         — last sync succeeded
//   offline    — network unreachable; progress is saved locally
//   error      — server rejected the request; will retry on next sync
//   signed_out — session expired and could not be refreshed
export type SyncStatus = "ok" | "offline" | "error" | "signed_out"

async function setSyncStatus(status: SyncStatus, error?: string): Promise<void> {
  await chrome.storage.local.set({
    sync_status: status,
    sync_last_error: error ?? "",
  })
}

function xpToLevel(xp: number): number {
  const thresholds = [0, 300, 750, 1400, 2300, 3500, 5200, 7500, 10500, 14500]
  let level = 1
  for (let i = 1; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1
  }
  return level
}

// Perform an authenticated request. On 401, refresh the access token once and
// retry. Returns null when the request could not be made (no session / offline
// / refresh failed) — the caller has already had the sync status set.
async function authedFetch(
  init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> }
): Promise<Response | null> {
  let session = await getAuthSession()
  if (!session) {
    await setSyncStatus("signed_out")
    return null
  }

  const doFetch = (s: AuthSession) =>
    fetch(API_URL, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${s.accessToken}` },
    })

  let res: Response
  try {
    res = await doFetch(session)
  } catch {
    await setSyncStatus("offline")
    return null
  }

  if (res.status === 401) {
    const refreshed = await refreshAuthSession()
    if (!refreshed) {
      // refreshAuthSession cleared the session if the token was truly dead;
      // distinguish that from a transient failure.
      const still = await getAuthSession()
      await setSyncStatus(still ? "error" : "signed_out", "Session expired")
      return null
    }
    try {
      res = await doFetch(refreshed)
    } catch {
      await setSyncStatus("offline")
      return null
    }
  }

  return res
}

export async function pushToCloud(): Promise<void> {
  const epoch = currentSyncEpoch()
  const store = await getStore()

  if (epoch !== currentSyncEpoch()) {
    if (isDev) console.log("[Aminta sync] PUSH aborted — account changed before send")
    return
  }

  const payload = {
    xp: store.xp,
    generations_total: store.generationsTotal,
    earned_hashes: store.earnedHashes,
    streak: store.streak,
    streak_date: store.streakDate,
    mission_date: store.missionDate,
    mission_generates: store.missionGenerates,
    mission_published: store.missionPublished,
    voice_profile: store.voice,
    style_profile: store.styleProfile,
    style_profile_hash: store.styleProfileHash,
    templates: store.templates,
    tweet_dna: store.tweetDNA,
    display_name: store.displayName,
    bio: store.bio,
    interests: store.interests,
    onboarding_done: store.onboardingDone,
  }

  const res = await authedFetch({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res) return

  if (epoch !== currentSyncEpoch()) {
    if (isDev) console.log("[Aminta sync] PUSH response discarded — account changed mid-flight")
    return
  }

  if (!res.ok) {
    await setSyncStatus("error", `Push failed (${res.status})`)
    return
  }

  const now = new Date().toISOString()
  await chrome.storage.local.set({ sync_last_push: now })
  await setSyncStatus("ok")

  if (isDev) {
    console.log("[Aminta sync] PUSH", {
      xp: store.xp,
      level: xpToLevel(store.xp),
      timestamp: now,
    })
  }
}

export async function pullFromCloud(): Promise<{ cloudXp: number } | void> {
  const epoch = currentSyncEpoch()
  const res = await authedFetch({ method: "GET" })
  if (!res) return

  if (epoch !== currentSyncEpoch()) {
    if (isDev) console.log("[Aminta sync] PULL response discarded — account changed mid-flight")
    return
  }

  if (!res.ok) {
    await setSyncStatus("error", `Pull failed (${res.status})`)
    return
  }

  let data: Record<string, unknown> & {
    xp?: number
    generations_total?: number
    earned_hashes?: string[]
    streak?: number
    streak_date?: string
    plan?: AmintaStore["plan"]
    subscription_status?: string | null
    ai_included?: boolean
    voice_profile?: AmintaStore["voice"]
    style_profile?: AmintaStore["styleProfile"]
    style_profile_hash?: string
    templates?: AmintaTemplate[]
    display_name?: string
    bio?: string
    interests?: string
    tweet_dna?: string[]
    onboarding_done?: boolean
  }
  try {
    data = await res.json()
  } catch {
    await setSyncStatus("error", "Pull failed (bad response)")
    return
  }
  if (!data) return

  const local = await getStore()

  const localXpWasHigher = local.xp > (data.xp ?? 0)

  // Merge: never go backwards on XP; union earned hashes so two devices with
  // different histories can't re-earn each other's XP.
  const mergedHashes = Array.from(
    new Set([...(local.earnedHashes ?? []), ...(data.earned_hashes ?? [])])
  )

  const patch: Partial<AmintaStore> = {
    xp: Math.max(local.xp, data.xp ?? 0),
    generationsTotal: Math.max(local.generationsTotal, data.generations_total ?? 0),
    earnedHashes: mergedHashes,
  }

  // Streak: trust whichever side posted most recently (dates are YYYY-MM-DD,
  // so string comparison is chronological). Math.max on the bare count could
  // resurrect a stale streak from a dormant device.
  const localDate = local.streakDate ?? ""
  const cloudDate = data.streak_date ?? ""
  if (cloudDate > localDate) {
    patch.streak = data.streak ?? 0
    patch.streakDate = cloudDate
  } else if (cloudDate === localDate) {
    patch.streak = Math.max(local.streak ?? 0, data.streak ?? 0)
  }
  // else: local is newer — keep local streak untouched

  // Always trust cloud for plan/subscription_status — Supabase users table
  // is the source of truth. subscription_status is written even when null
  // (a real "no status" from the server), unlike the other cloud fields
  // below which only overwrite local when the cloud value is truthy.
  if (data.plan) patch.plan = data.plan
  if ("subscription_status" in data) patch.subscriptionStatus = data.subscription_status ?? null
  // aiIncluded is the canonical Included-AI entitlement (plan/override
  // resolved server-side via lib/entitlements.ts's aiIncluded()) — always
  // trust the cloud here too, same reasoning as plan/subscription_status.
  if ("ai_included" in data) patch.aiIncluded = !!data.ai_included

  // Only overwrite these if cloud has them and local doesn't
  if (!local.voice && data.voice_profile)      patch.voice = data.voice_profile
  if (!local.displayName && data.display_name) patch.displayName = data.display_name
  if (!local.bio && data.bio)                  patch.bio = data.bio
  if (!local.interests && data.interests)      patch.interests = data.interests
  if ((!local.tweetDNA?.length) && data.tweet_dna?.length) patch.tweetDNA = data.tweet_dna
  if (!local.onboardingDone && data.onboarding_done)       patch.onboardingDone = data.onboarding_done

  // Style profile is a cache (always regenerable from voice + tweet DNA via
  // getOrBuildStyleProfile), not a source of truth — same "fill if local is
  // empty" rule as voice/bio/etc above, never overwrite a cache the user's
  // current device already has.
  if (!local.styleProfile && data.style_profile) {
    patch.styleProfile = data.style_profile
    patch.styleProfileHash = data.style_profile_hash ?? ""
  }

  // Templates: union by id, newer updatedAt wins per id. This can't detect
  // "deleted on device A, never pulled by device B" — a template removed
  // elsewhere can resurrect if device B still has its own local copy and
  // pushes before pulling that deletion. Same class of tradeoff as the
  // earned-hashes union above: favors never silently losing a template over
  // handling every delete race perfectly.
  if (data.templates?.length) {
    const byId = new Map<string, AmintaTemplate>()
    for (const t of local.templates ?? []) byId.set(t.id, t)
    for (const t of data.templates) {
      const existing = byId.get(t.id)
      if (!existing || t.updatedAt > existing.updatedAt) byId.set(t.id, t)
    }
    patch.templates = Array.from(byId.values())
  }

  if (epoch !== currentSyncEpoch()) {
    // The account changed again while we were computing the merge above
    // (each step here is synchronous, but getStore()/setStore() below yield,
    // so re-check right at the write boundary). Writing this patch now would
    // silently overwrite whatever the newer account-switch handler already
    // loaded for the current user.
    if (isDev) console.log("[Aminta sync] PULL merge discarded — account changed before write")
    return
  }

  await setStore(patch)

  const now = new Date().toISOString()
  await chrome.storage.local.set({ sync_last_pull: now })
  await setSyncStatus("ok")

  if (isDev) {
    console.log("[Aminta sync] PULL", {
      local_xp: local.xp,
      cloud_xp: data.xp ?? 0,
      merged_xp: patch.xp,
      local_was_higher: localXpWasHigher,
      timestamp: now,
    })
  }

  // If local state was ahead of cloud, push merged state so Supabase catches up.
  // Handles the "used extension offline, then logged in" case.
  if (localXpWasHigher) {
    await pushToCloud()
  }

  return { cloudXp: data.xp ?? 0 }
}

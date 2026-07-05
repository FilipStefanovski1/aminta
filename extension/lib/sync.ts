import { getAuthSession } from "./auth"
import { getStore, setStore, type AmintaStore } from "./storage"

const API_URL = "https://amintaapp.com/api/sync"

const isDev = !("update_url" in chrome.runtime.getManifest())

function xpToLevel(xp: number): number {
  const thresholds = [0, 300, 750, 1400, 2300, 3500, 5200, 7500, 10500, 14500]
  let level = 1
  for (let i = 1; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1
  }
  return level
}

export async function pushToCloud(): Promise<void> {
  const session = await getAuthSession()
  if (!session) return

  const store = await getStore()

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
    tweet_dna: store.tweetDNA,
    display_name: store.displayName,
    bio: store.bio,
    interests: store.interests,
    onboarding_done: store.onboardingDone,
  }

  try {
    await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    const now = new Date().toISOString()
    await chrome.storage.local.set({ sync_last_push: now })

    if (isDev) {
      console.log("[Aminta sync] PUSH", {
        auth_user_id: session.userId,
        email: session.email,
        xp: store.xp,
        level: xpToLevel(store.xp),
        timestamp: now,
      })
    }
  } catch { /* silent — offline or token expired */ }
}

export async function pullFromCloud(): Promise<void> {
  const session = await getAuthSession()
  if (!session) return

  try {
    const res = await fetch(API_URL, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    if (!res.ok) return

    const data = await res.json()
    if (!data) return

    const local = await getStore()

    const localXpWasHigher = local.xp > (data.xp ?? 0)

    // Merge: take the higher XP (never go backwards)
    const patch: Partial<AmintaStore> = {
      xp: Math.max(local.xp, data.xp ?? 0),
      generationsTotal: Math.max(local.generationsTotal, data.generations_total ?? 0),
      earnedHashes: data.earned_hashes?.length > (local.earnedHashes?.length ?? 0)
        ? data.earned_hashes
        : local.earnedHashes,
      streak: Math.max(local.streak, data.streak ?? 0),
    }

    // Always trust cloud for plan — Supabase users table is the source of truth
    if (data.plan) patch.plan = data.plan

    // Only overwrite these if cloud has them and local doesn't
    if (!local.voice && data.voice_profile)     patch.voice = data.voice_profile
    if (!local.displayName && data.display_name) patch.displayName = data.display_name
    if (!local.bio && data.bio)                  patch.bio = data.bio
    if (!local.interests && data.interests)      patch.interests = data.interests
    if ((!local.tweetDNA?.length) && data.tweet_dna?.length) patch.tweetDNA = data.tweet_dna
    if (!local.onboardingDone && data.onboarding_done)       patch.onboardingDone = data.onboarding_done

    await setStore(patch)

    const now = new Date().toISOString()
    await chrome.storage.local.set({ sync_last_pull: now })

    if (isDev) {
      console.log("[Aminta sync] PULL", {
        auth_user_id: session.userId,
        email: session.email,
        local_xp: local.xp,
        cloud_xp: data.xp ?? 0,
        merged_xp: patch.xp,
        local_level: xpToLevel(local.xp),
        cloud_level: xpToLevel(data.xp ?? 0),
        merged_level: xpToLevel(patch.xp ?? 0),
        local_was_higher: localXpWasHigher,
        timestamp: now,
      })
    }

    // If local state was ahead of cloud, push merged state so Supabase catches up.
    // Handles the "used extension offline, then logged in" case.
    if (localXpWasHigher) {
      await pushToCloud()
    }
  } catch { /* silent */ }
}

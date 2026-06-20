import { getAuthSession } from "./auth"
import { getStore, setStore, type AmintaStore } from "./storage"

const API_URL = "https://amintaapp.com/api/sync"

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

    // Merge: take the higher XP (never go backwards)
    const patch: Partial<AmintaStore> = {
      xp: Math.max(local.xp, data.xp ?? 0),
      generationsTotal: Math.max(local.generationsTotal, data.generations_total ?? 0),
      earnedHashes: data.earned_hashes?.length > (local.earnedHashes?.length ?? 0)
        ? data.earned_hashes
        : local.earnedHashes,
      streak: Math.max(local.streak, data.streak ?? 0),
    }

    // Only overwrite these if cloud has them and local doesn't
    if (!local.voice && data.voice_profile)     patch.voice = data.voice_profile
    if (!local.displayName && data.display_name) patch.displayName = data.display_name
    if (!local.bio && data.bio)                  patch.bio = data.bio
    if (!local.interests && data.interests)      patch.interests = data.interests
    if ((!local.tweetDNA?.length) && data.tweet_dna?.length) patch.tweetDNA = data.tweet_dna
    if (!local.onboardingDone && data.onboarding_done)       patch.onboardingDone = data.onboarding_done

    await setStore(patch)
  } catch { /* silent */ }
}

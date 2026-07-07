import { todayLocal, yesterdayLocal } from "~lib/dates"
import { getStore, setStore, type AmintaStore } from "~lib/storage"
import { tryAwardBountyXP } from "~lib/xp"

// Count of writing samples Aminta has learned from — voice examples + liked DNA.
export function sampleCount(store: AmintaStore): number {
  const examples = (store.voice?.examples ?? "").split("\n").filter(l => l.trim()).length
  return examples + (store.tweetDNA?.length ?? 0)
}

// Voice Match: 0–100 heuristic from how much Aminta has learned about the user.
export function computeDNAStrength(store: AmintaStore): number {
  let score = 0
  score += Math.min(40, sampleCount(store) * 8)
  if (store.voice?.niche?.trim()) score += 25
  if (store.voice?.voiceStyle?.trim()) score += 20
  if (store.voice?.customRules?.trim() || store.voice?.voiceInspiration?.trim()) score += 15
  return Math.min(100, score)
}

// Training quest: 4 items, +200 XP once
export const TRAINING_LABELS = [
  "Add niche",
  "Add inspiration account",
  "Add custom rules",
  "Add 10 DNA tweets",
] as const

export function getTrainingDone(store: AmintaStore): boolean[] {
  return [
    !!(store.voice?.niche?.trim()),
    !!(store.voice?.voiceInspiration?.trim()),
    !!(store.voice?.customRules?.trim()),
    (store.tweetDNA?.length ?? 0) >= 10,
  ]
}

export async function tryCompleteTrainingQuest(store: AmintaStore): Promise<boolean> {
  if (!getTrainingDone(store).every(Boolean)) return false
  const res = await tryAwardBountyXP("training-quest-v1", 200)
  return !("error" in res)
}

// Daily missions: reset daily, +150 XP when all done
export function getMissionProgress(store: AmintaStore) {
  const today = todayLocal()
  const isToday = store.missionDate === today
  return {
    generates: isToday ? (store.missionGenerates ?? 0) : 0,
    published: isToday ? (store.missionPublished ?? 0) : 0,
    dnaTrained: sampleCount(store) >= 3,
  }
}

export async function tryCompleteDailyMissions(store: AmintaStore): Promise<boolean> {
  const { generates, published, dnaTrained } = getMissionProgress(store)
  if (generates < 3 || published < 1 || !dnaTrained) return false
  const res = await tryAwardBountyXP(`daily-missions:${todayLocal()}`, 150)
  return !("error" in res)
}

export async function incrementMissionGenerates(): Promise<void> {
  const store = await getStore()
  const today = todayLocal()
  const isToday = store.missionDate === today
  await setStore({
    missionDate: today,
    missionGenerates: (isToday ? (store.missionGenerates ?? 0) : 0) + 1,
    missionPublished: isToday ? (store.missionPublished ?? 0) : 0,
  })
}

export async function incrementMissionPublished(): Promise<void> {
  const store = await getStore()
  const today = todayLocal()
  const isToday = store.missionDate === today
  await setStore({
    missionDate: today,
    missionGenerates: isToday ? (store.missionGenerates ?? 0) : 0,
    missionPublished: (isToday ? (store.missionPublished ?? 0) : 0) + 1,
  })
}

export async function recordStreak(): Promise<void> {
  const store = await getStore()
  const today = todayLocal()
  if (store.streakDate === today) return
  const streak = store.streakDate === yesterdayLocal() ? (store.streak ?? 0) + 1 : 1
  await setStore({ streak, streakDate: today })
}

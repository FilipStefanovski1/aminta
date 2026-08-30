import { todayLocal, yesterdayLocal } from "~lib/dates"
import { getStore, setStore, type AmintaStore } from "~lib/storage"
import { countExamples } from "~lib/trainingExamples"
import { tryAwardBountyXP } from "~lib/xp"
import type { Mode } from "~lib/prompts"

// Count of writing samples Aminta has learned from — voice examples + liked
// DNA. voice.examples is a JSON-encoded string[] (see
// lib/trainingExamples.ts) — a raw `.split("\n")` here used to always
// collapse to 1 regardless of how many real examples existed, since
// JSON.stringify never emits literal newlines, silently undercounting every
// account's progress toward the "3 voice samples" daily mission and the
// Voice Match score below.
export function sampleCount(store: AmintaStore): number {
  return countExamples(store.voice?.examples) + (store.tweetDNA?.length ?? 0)
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

// Daily goals: reset daily, +150 XP when all done. Each goal is a
// CONFIRMED-PUBLISH flag for one generation mode — not a training/teaching
// task, and not gameable by re-publishing the same mode twice in one day
// (booleans, not counters).
const EMPTY_MODES = { tweet: false, reply: false, polish: false }

export function getMissionProgress(store: AmintaStore) {
  const today = todayLocal()
  const isToday = store.missionDate === today
  const modes = isToday ? (store.missionModes ?? EMPTY_MODES) : EMPTY_MODES
  return {
    postDone: modes.tweet,
    replyDone: modes.reply,
    polishDone: modes.polish,
  }
}

export async function tryCompleteDailyMissions(store: AmintaStore): Promise<boolean> {
  const { postDone, replyDone, polishDone } = getMissionProgress(store)
  if (!postDone || !replyDone || !polishDone) return false
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
    missionModes: isToday ? (store.missionModes ?? EMPTY_MODES) : EMPTY_MODES,
  })
}

// mode: which generation mode was actually confirmed-published — drives
// which of the 3 daily goals (post/reply/polish) this publish satisfies.
export async function incrementMissionPublished(mode: Mode): Promise<void> {
  const store = await getStore()
  const today = todayLocal()
  const isToday = store.missionDate === today
  const modes = isToday ? (store.missionModes ?? EMPTY_MODES) : EMPTY_MODES
  await setStore({
    missionDate: today,
    missionGenerates: isToday ? (store.missionGenerates ?? 0) : 0,
    missionPublished: (isToday ? (store.missionPublished ?? 0) : 0) + 1,
    missionModes: {
      tweet: modes.tweet || mode === "tweet",
      reply: modes.reply || mode === "reply",
      polish: modes.polish || mode === "polish",
    },
  })
}

export async function recordStreak(): Promise<void> {
  const store = await getStore()
  const today = todayLocal()
  if (store.streakDate === today) return
  const streak = store.streakDate === yesterdayLocal() ? (store.streak ?? 0) + 1 : 1
  await setStore({ streak, streakDate: today })
}

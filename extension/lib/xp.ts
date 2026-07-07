import { getLevel } from "~lib/evolution"
import { todayLocal } from "~lib/dates"
import { getStore, setStore } from "~lib/storage"
import type { Mode } from "~lib/prompts"

export const XP_PER_MODE: Record<Mode, number> = { tweet: 50, reply: 25, polish: 15 }
export const DAILY_CAP = 500

export function hashText(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h, 33) ^ text.charCodeAt(i)
  }
  return (h >>> 0).toString(36)
}

export type XPResult =
  | { awarded: number; total: number }
  | { error: "already_claimed" | "daily_cap" }

export { getLevel }

export async function tryAwardXP(hash: string, amount: number): Promise<XPResult> {
  const store = await getStore()
  const today = todayLocal()

  const earnedHashes = store.earnedHashes ?? []
  if (earnedHashes.includes(hash)) {
    return { error: "already_claimed" }
  }

  const xpToday = store.xpTodayDate === today ? (store.xpToday ?? 0) : 0
  if (xpToday >= DAILY_CAP) {
    return { error: "daily_cap" }
  }

  const actualAmount = Math.min(amount, DAILY_CAP - xpToday)
  const newXP = (store.xp ?? 0) + actualAmount

  await setStore({
    xp: newXP,
    earnedHashes: [...earnedHashes, hash],
    xpToday: xpToday + actualAmount,
    xpTodayDate: today,
  })

  return { awarded: actualAmount, total: newXP }
}

export async function tryAwardBountyXP(bountyId: string, amount: number): Promise<XPResult> {
  const store = await getStore()
  const key = `bounty:${bountyId}`
  const earnedHashes = store.earnedHashes ?? []

  if (earnedHashes.includes(key)) {
    return { error: "already_claimed" }
  }

  const newXP = (store.xp ?? 0) + amount

  await setStore({
    xp: newXP,
    earnedHashes: [...earnedHashes, key],
  })

  return { awarded: amount, total: newXP }
}

export async function incrementGenerations(): Promise<void> {
  const store = await getStore()
  await setStore({ generationsTotal: (store.generationsTotal ?? 0) + 1 })
}

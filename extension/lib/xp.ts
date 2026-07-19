import { getForm, getLevel } from "~lib/evolution"
import { todayLocal } from "~lib/dates"
import { getStore, setStore, type PendingXPRecord } from "~lib/storage"
import type { Mode } from "~lib/prompts"

export const XP_PER_MODE: Record<Mode, number> = { tweet: 50, reply: 25, polish: 15 }
export const DAILY_CAP = 500

// How long a queued insert stays eligible to be matched to a later confirmed
// publish. Past this, it's treated as abandoned (never posted) and dropped.
export const PENDING_XP_WINDOW_MS = 15 * 60 * 1000
const MAX_PENDING_XP = 20

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

// ─── Pending XP (insert → confirmed publish) ──────────────────────────────
//
// XP is no longer awarded on insert. Inserting queues a candidate; only a
// network-confirmed successful X publish (twitter-publish-detector.ts →
// twitter-bridge.ts → background.ts) resolves it into real XP. This keeps
// closing the composer, cancelling, saving a draft, or copying text from
// ever awarding XP — none of those produce a publish confirmation.

function dropExpired(pending: PendingXPRecord[]): PendingXPRecord[] {
  const cutoff = Date.now() - PENDING_XP_WINDOW_MS
  return pending.filter(p => p.createdAt >= cutoff)
}

export async function queuePendingXP(
  hash: string,
  amount: number,
  mode: Mode
): Promise<{ queued: boolean }> {
  const store = await getStore()

  const earnedHashes = store.earnedHashes ?? []
  if (earnedHashes.includes(hash)) return { queued: false }

  let pending = dropExpired(store.pendingXP ?? [])
  if (pending.some(p => p.hash === hash)) return { queued: false }

  pending = [...pending, { hash, amount, mode, createdAt: Date.now() }]
  if (pending.length > MAX_PENDING_XP) {
    pending = pending.slice(pending.length - MAX_PENDING_XP)
  }

  await setStore({ pendingXP: pending })
  return { queued: true }
}

export type ResolvedXP =
  | {
      amount: number
      total: number
      firstPost: boolean
      levelUp?: { level: number; stage: string }
    }
  | null

// Called when a publish is confirmed. Matches the most recent still-valid
// queued insert — everything older is discarded too, since a single publish
// can only correspond to one post, and letting stale entries linger would
// let a later unrelated publish "collect" them one at a time.
export async function resolvePendingXP(): Promise<ResolvedXP> {
  const store = await getStore()
  const valid = dropExpired(store.pendingXP ?? [])

  if (valid.length === 0) {
    // Nothing pending (or everything expired) — persist the GC, nothing to award.
    if ((store.pendingXP ?? []).length > 0) await setStore({ pendingXP: [] })
    return null
  }

  const candidate = valid.reduce((newest, p) => (p.createdAt > newest.createdAt ? p : newest))
  await setStore({ pendingXP: [] })

  const prevXP = store.xp ?? 0
  const xpRes = await tryAwardXP(candidate.hash, candidate.amount)
  if ("error" in xpRes) return null

  const oldLevel = getLevel(prevXP)
  const newLevel = getLevel(xpRes.total)
  const firstPost = prevXP === 0

  return {
    amount: xpRes.awarded,
    total: xpRes.total,
    firstPost,
    levelUp: newLevel > oldLevel ? { level: newLevel, stage: getForm(xpRes.total).name } : undefined,
  }
}

// Saves/reads the Recent Creations list — a lightweight local memory of
// recent successful generations, surfaced on Home. See storage.ts's
// RecentCreation for the shape. Never calls generation and never costs a
// credit: this only persists an output a real generation already produced.

import { getStore, setStore, type RecentCreation, type RecentCreationType } from "~lib/storage"

export const MAX_RECENT_CREATIONS = 20

export interface SaveRecentCreationInput {
  type: RecentCreationType
  text?: string
  posts?: string[]
}

// Called exactly once per real, completed generation (see call sites in
// GeneratorPanel.tsx) — never on a React rerender, since it's a plain async
// write, not an effect keyed on render-time state. Newest-first, capped at
// MAX_RECENT_CREATIONS by dropping the oldest.
export async function saveRecentCreation(input: SaveRecentCreationInput): Promise<void> {
  const isThread = input.type === "thread"
  const hasContent = isThread ? !!input.posts?.length : !!input.text?.trim()
  if (!hasContent) return

  const store = await getStore()
  const entry: RecentCreation = {
    id: crypto.randomUUID(),
    type: input.type,
    createdAt: Date.now(),
    ...(isThread ? { posts: input.posts } : { text: input.text }),
  }
  const next = [entry, ...(store.recentCreations ?? [])].slice(0, MAX_RECENT_CREATIONS)
  await setStore({ recentCreations: next })
}

export async function deleteRecentCreation(id: string): Promise<void> {
  const store = await getStore()
  await setStore({ recentCreations: (store.recentCreations ?? []).filter((c) => c.id !== id) })
}

// Compact relative-time label for Home's list — "Just now" / "12m" / "2h" /
// "Yesterday" / an older absolute date, never a raw timestamp.
export function relativeTimeLabel(createdAt: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - createdAt)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d`
  return new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const TYPE_LABEL: Record<RecentCreationType, string> = {
  tweet: "Post",
  reply: "Reply",
  polish: "Polish",
  thread: "Thread",
}

export function creationTypeLabel(c: RecentCreation): string {
  if (c.type === "thread") return `Thread · ${c.posts?.length ?? 0} posts`
  return TYPE_LABEL[c.type]
}

// First useful line for the compact card preview — the first post for a
// thread, the full text otherwise (the card itself clamps/truncates visually).
export function creationPreview(c: RecentCreation): string {
  if (c.type === "thread") return c.posts?.[0] ?? ""
  return c.text ?? ""
}

// Sensible blank-line-separated join for "Copy thread" — no artificial
// numbering unless it was already part of the generated text.
export function joinThreadForCopy(posts: string[]): string {
  return posts.join("\n\n")
}

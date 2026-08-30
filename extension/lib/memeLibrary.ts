// A personal, local meme library for the Meme Reply composer feature.
// Images are real Blobs (uploaded photos are typically hundreds of KB —
// far too heavy for chrome.storage.local's 10MB total quota, see
// storage.ts's own comment on avatarDataUrl for the same reasoning at
// smaller scale), so this uses IndexedDB, which natively stores Blobs
// without a base64 size penalty. Nothing here is synced to the server or
// shared between accounts — no public gallery, no upload-to-others.

export interface MemeRecord {
  id: string
  name?: string
  tags: string[]
  blob: Blob
  createdAt: number
}

const DB_NAME = "aminta-memes"
const DB_VERSION = 1
const STORE = "memes"

function openDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("Couldn't open the meme library."))
  })
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE)
}

/** Normalizes free-typed tags into a clean, deduped, lowercase list — same shape whichever way a meme was added. */
export function normalizeTags(raw: string | string[] | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : (raw ?? "").split(",")
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const t = part.trim().toLowerCase()
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
  }
  return out
}

export async function addMeme(input: { blob: Blob; name?: string; tags?: string | string[] }): Promise<MemeRecord> {
  const record: MemeRecord = {
    id: crypto.randomUUID(),
    name: input.name?.trim() || undefined,
    tags: normalizeTags(input.tags),
    blob: input.blob,
    createdAt: Date.now(),
  }
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, "readwrite").add(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error("Couldn't save meme."))
  })
  return record
}

export async function listMemes(): Promise<MemeRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").getAll()
    req.onsuccess = () => resolve((req.result as MemeRecord[]).sort((a, b) => b.createdAt - a.createdAt))
    req.onerror = () => reject(req.error ?? new Error("Couldn't load memes."))
  })
}

export async function deleteMeme(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, "readwrite").delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error("Couldn't delete meme."))
  })
}

export async function renameMeme(id: string, name: string): Promise<void> {
  const db = await openDb()
  const store = tx(db, "readwrite")
  const existing = await new Promise<MemeRecord | undefined>((resolve, reject) => {
    const req = store.get(id)
    req.onsuccess = () => resolve(req.result as MemeRecord | undefined)
    req.onerror = () => reject(req.error ?? new Error("Couldn't load meme."))
  })
  if (!existing) return
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ ...existing, name: name.trim() || undefined })
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error("Couldn't rename meme."))
  })
}

// ─── Zero-AI local prefilter ────────────────────────────────────────────
// Ranks saved memes against the reply context using nothing but tag
// substring matching — no model call, so opening the picker with a
// pre-sorted "best matches first" order costs nothing. The AI step (if the
// user asks Aminta to also write a caption) is a separate, explicit action
// — see contents/twitter-bridge.ts's runMemeCaption.

export function rankMemesByTags(memes: MemeRecord[], contextText: string): MemeRecord[] {
  const haystack = contextText.toLowerCase()
  const score = (m: MemeRecord): number => {
    let s = 0
    for (const tag of m.tags) if (tag && haystack.includes(tag)) s++
    if (m.name && haystack.includes(m.name.toLowerCase())) s++
    return s
  }
  return [...memes].sort((a, b) => {
    const diff = score(b) - score(a)
    return diff !== 0 ? diff : b.createdAt - a.createdAt
  })
}

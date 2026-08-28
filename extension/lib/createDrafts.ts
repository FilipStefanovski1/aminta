// Local draft persistence for the Create screen — what the user was
// WRITING, not what Aminta generated. Deliberately separate from
// lib/recentCreations.ts: that stores finished generated outputs (history),
// this stores unfinished input so nothing is lost when the sidepanel closes,
// the extension reloads, or the user switches modes.
//
// Purely local (chrome.storage.local via the existing AmintaStore) — no
// backend, no sync, no AI call, zero credits.

import { getStore, setStore } from "~lib/storage"
import type { OutputLength, ThreadPostCount, Tone } from "~lib/prompts"

/** Matches GeneratorPanel's UiMode — each mode keeps its own independent draft. */
export type DraftMode = "tweet" | "reply" | "polish" | "thread"

const DRAFT_MODES: DraftMode[] = ["tweet", "reply", "polish", "thread"]

export interface CreateDraft {
  topic: string
  context: string
  tone: Tone
  length: OutputLength
  /** Thread Creator only; carried for every mode so the shape stays uniform. */
  postCount: ThreadPostCount
  /**
   * Thread template reference ONLY — never a copy of the template itself.
   * Resolved against store.templates at restore time, so a template deleted
   * in the meantime simply restores nothing (see resolveDraftTemplate).
   */
  templateId?: string
  /**
   * Reply Discovery leftovers, plain serializable data only. DOM nodes,
   * React refs, selectors, and observers are never persisted — these are
   * just the image URLs and the one-line ranking reason that belong to the
   * `topic` text saved alongside them, so the restored draft stays coherent.
   */
  postImageUrls?: string[]
  replyReason?: string
}

export type CreateDrafts = Partial<Record<DraftMode, CreateDraft>>

/** Debounce for auto-save — small enough to feel instant, large enough that normal typing isn't a write per keystroke. */
export const DRAFT_SAVE_DEBOUNCE_MS = 400

// Generous ceiling that protects storage from a pathological paste without
// ever truncating real writing (the topic field targets ~120 characters).
const MAX_DRAFT_FIELD_CHARS = 8_000
const MAX_DRAFT_IMAGE_URLS = 4

// Must match GeneratorPanel's own initial values — an absent draft has to
// behave exactly like a fresh, untouched Create screen.
export const EMPTY_DRAFT: CreateDraft = {
  topic: "",
  context: "",
  tone: "direct",
  length: "medium",
  postCount: 4,
}

const TONES: Tone[] = ["direct", "witty", "analytical", "inspiring"]
const LENGTHS: OutputLength[] = ["short", "medium", "long"]
const POST_COUNTS: ThreadPostCount[] = [2, 3, 4, 5, "6+"]

function str(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_DRAFT_FIELD_CHARS) : ""
}

// Every field is validated against the values the UI can actually produce.
// Anything unrecognized (old shape, hand-edited storage, a value from a
// future version) falls back to the default rather than reaching the
// prompt builder or a control that can't render it.
function normalizeDraft(raw: unknown): CreateDraft | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>

  const draft: CreateDraft = {
    topic: str(o.topic),
    context: str(o.context),
    tone: TONES.includes(o.tone as Tone) ? (o.tone as Tone) : EMPTY_DRAFT.tone,
    length: LENGTHS.includes(o.length as OutputLength) ? (o.length as OutputLength) : EMPTY_DRAFT.length,
    postCount: POST_COUNTS.includes(o.postCount as ThreadPostCount) ? (o.postCount as ThreadPostCount) : EMPTY_DRAFT.postCount,
  }

  if (typeof o.templateId === "string" && o.templateId) draft.templateId = o.templateId
  if (Array.isArray(o.postImageUrls)) {
    const urls = o.postImageUrls.filter((u): u is string => typeof u === "string").slice(0, MAX_DRAFT_IMAGE_URLS)
    if (urls.length > 0) draft.postImageUrls = urls
  }
  if (typeof o.replyReason === "string" && o.replyReason) draft.replyReason = str(o.replyReason)

  return draft
}

/** Never throws. Anything malformed becomes {} — i.e. a normal empty Create screen. */
export function normalizeCreateDrafts(raw: unknown): CreateDrafts {
  if (!raw || typeof raw !== "object") return {}
  const source = raw as Record<string, unknown>
  const out: CreateDrafts = {}
  for (const mode of DRAFT_MODES) {
    const draft = normalizeDraft(source[mode])
    if (draft) out[mode] = draft
  }
  return out
}

export function getDraft(drafts: CreateDrafts, mode: DraftMode): CreateDraft {
  return drafts[mode] ?? EMPTY_DRAFT
}

/** Returns a new record — writing one mode never touches the others. */
export function setDraft(drafts: CreateDrafts, mode: DraftMode, draft: CreateDraft): CreateDrafts {
  return { ...drafts, [mode]: draft }
}

export function clearDraft(drafts: CreateDrafts, mode: DraftMode): CreateDrafts {
  const next = { ...drafts }
  delete next[mode]
  return next
}

/** An untouched draft is not worth persisting — keeps storage free of empty rows. */
export function isEmptyDraft(draft: CreateDraft): boolean {
  return (
    !draft.topic.trim() &&
    !draft.context.trim() &&
    !draft.templateId &&
    !draft.postImageUrls?.length &&
    !draft.replyReason &&
    draft.tone === EMPTY_DRAFT.tone &&
    draft.length === EMPTY_DRAFT.length &&
    draft.postCount === EMPTY_DRAFT.postCount
  )
}

// ── Storage ─────────────────────────────────────────────────────────────

export async function loadCreateDrafts(): Promise<CreateDrafts> {
  const store = await getStore()
  return normalizeCreateDrafts(store.createDrafts)
}

export async function saveCreateDrafts(drafts: CreateDrafts): Promise<void> {
  await setStore({ createDrafts: drafts })
}

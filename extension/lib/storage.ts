// Typed wrapper over chrome.storage.local. All app state lives here.

export type BountyStatus = "pending" | "approved" | "featured" | "rejected"

export interface Bounty {
  id: string
  content: string
  status: BountyStatus
  createdAt: number
  rewarded: boolean
}

export interface VoiceProfile {
  niche: string
  tone: string
  examples: string // tweets separated by double newline
  voiceStyle: string
  voiceInspiration: string
  customRules: string
}

// ─── Style Profile ──────────────────────────────────────────────────────
// A distilled, topic-free description of HOW a user writes — extracted once
// from their Voice examples + Tweet DNA and cached. Raw examples/DNA are
// never used directly in generation; only this structured profile is.
// See lib/styleProfile.ts for extraction/caching logic.

export type Confidence = "hedging" | "balanced" | "assertive" | "declarative"
export type Energy = "low" | "moderate" | "high" | "intense"
export type VocabComplexity = "simple" | "casual" | "moderate" | "sophisticated"
export type Capitalization = "lowercase-leaning" | "standard" | "emphatic-caps"
export type Directness = "indirect" | "balanced" | "direct" | "blunt"

export interface StyleProfile {
  confidence: Confidence
  energy: Energy
  vocabularyComplexity: VocabComplexity
  capitalization: Capitalization
  directness: Directness
  // free text — always passed through sanitizeStyleText() before storage
  rhythm: string
  punctuation: string
  emojiUsage: string
  // Was previously ungrounded: systemX() told the model "no hashtags...
  // unless their examples use them" but the model never sees the raw
  // examples — only this extracted profile. Without this field there was
  // nothing in the profile for that instruction to actually point at.
  hashtagUsage: string
  humorStyle: string
  formattingPreferences: string
  rhetoricalDevices: string
  cadence: string
  // deterministic 0–1 score computed from corpus size — NOT self-reported
  // by the model. Scales how strongly the profile is applied in prompts.ts.
  confidenceScore: number
  // Personal length baseline — character-count percentiles across the
  // corpus, computed with plain arithmetic (never the model). Only these 3
  // numbers are derived and kept; the corpus itself is never persisted.
  // null/absent when there wasn't enough corpus to derive a baseline —
  // callers must fall back to the fixed LENGTH_GUIDE ranges in that case.
  lengthProfile?: { p25: number; median: number; p75: number } | null
}

// Source-tagged writing samples used to build a StyleProfile. Only
// "example" and "tweet_dna" are populated today; "approved_edit" exists so
// a future feature (capturing user-edited drafts) can extend the corpus
// without changing extraction/hashing/caching signatures.
export type StyleCorpusSource = "example" | "tweet_dna" | "approved_edit" | "x_history"
export interface StyleCorpusEntry {
  text: string
  source: StyleCorpusSource
}

// ─── Templates ──────────────────────────────────────────────────────────
// A deliberately separate memory from Voice/Style: Voice Training answers
// "how does this user write," Templates answer "what structures does this
// user repeatedly use." Templates never feed StyleProfile extraction, and
// StyleProfile never determines template structure. See lib/templates.ts.

export type TemplateMode = "exact" | "fill" | "generate"

// Curated, deliberately small — see lib/templates.ts's TEMPLATE_CATEGORIES
// for the id->label mapping. "other" is also the safe default for templates
// saved before this field existed (see lib/templates.ts's normalizeTemplate).
export type TemplateCategory =
  | "build_in_public" | "launch" | "opinion" | "story" | "educational" | "product" | "other"
// "any" is kept alongside "x" even though X is the only supported platform —
// it's still the value written for templates saved before this field had any
// UI, and dropping it would make that data fail to type-check on read.
// Older stored templates may carry a stale "linkedin"/"threads" value from
// when multi-platform was supported; those are simply never displayed or
// filtered on anymore (see TemplatesModal.tsx) rather than migrated in place.
export type TemplatePlatform = "x" | "any"

export interface TemplateVariable {
  key: string // normalized: lowercase, [a-z0-9_]+, unique within a template
  label: string
  placeholder?: string
  required: boolean
  defaultValue?: string
}

export interface AmintaTemplate {
  id: string
  name: string
  description?: string
  mode: TemplateMode
  platform: TemplatePlatform
  content: string // raw text (exact/fill) or instruction (generate)
  variables: TemplateVariable[]
  // Missing on templates saved before this field existed — always read
  // through lib/templates.ts's normalizeTemplate(), never this field raw.
  category?: TemplateCategory
  // Structured thread posts, preserved separately rather than flattened into
  // `content` — present only for templates meant to guide Thread Creator
  // (see lib/templates.ts's isThreadTemplate/buildThreadTemplateInstruction).
  // `content` still holds a flattened join for display/back-compat, but
  // generation-time structure always comes from this array.
  threadPosts?: string[]
  favorite: boolean
  tags: string[]
  usageCount: number
  // tracked now so a future "you've used this format 6 times" suggestion
  // engine needs no schema change later — not built in this pass.
  lastUsedAt?: number
  createdAt: number
  updatedAt: number
}

// ─── Recent Creations ───────────────────────────────────────────────────
// A lightweight local memory of recent successful generations, surfaced on
// Home so a user doesn't lose a draft after navigating away. Deliberately
// NOT a history/analytics product — capped at MAX_RECENT_CREATIONS (see
// lib/recentCreations.ts), local-only, no server round-trip.
export type RecentCreationType = "tweet" | "reply" | "polish" | "thread"

export interface RecentCreation {
  id: string
  type: RecentCreationType
  /** Full text for tweet/reply/polish. Absent for thread (see `posts`). */
  text?: string
  /** Ordered posts for a thread. Absent for tweet/reply/polish. */
  posts?: string[]
  createdAt: number
}

export type Plan = "free" | "pro" | "lifetime"

// A generate-and-insert that hasn't been confirmed as a real X post yet.
// Queued by queuePendingXP() on insert, consumed by resolvePendingXP() once
// twitter-publish-detector.ts confirms a successful publish. See lib/xp.ts.
export interface PendingXPRecord {
  hash: string
  amount: number
  mode: "tweet" | "reply" | "polish"
  createdAt: number
}

export interface AmintaStore {
  apiKey: string
  model: string
  voice: VoiceProfile | null
  avatarDataUrl: string
  displayName: string
  bio: string
  interests: string
  tweetDNA: string[]
  styleProfile: StyleProfile | null
  styleProfileHash: string
  templates: AmintaTemplate[]
  onboardingDone: boolean
  xp: number
  generationsTotal: number
  // Lifetime count of CONFIRMED publishes (see lib/xp.ts → resolvePendingXP),
  // not generate-clicks. Distinct from generationsTotal, which counts every
  // Generate press regardless of whether the draft was ever posted.
  postsPublishedTotal: number
  earnedHashes: string[]
  xpToday: number
  xpTodayDate: string
  bounties: Bounty[]
  streak: number
  streakDate: string
  missionDate: string
  missionGenerates: number
  missionPublished: number
  // Daily-reset, per-mode "did a confirmed publish of this mode happen
  // today" flags — the basis for the 3 daily goals (Write one post / Join a
  // conversation / Polish one post). Booleans, not counters: a goal is done
  // or not, so re-publishing the same mode again can't be gamed into
  // "more progress." Reset alongside missionDate, same pattern as
  // missionGenerates/missionPublished above.
  missionModes: { tweet: boolean; reply: boolean; polish: boolean }
  plan: Plan
  // Mirrors Supabase users.subscription_status — synced alongside plan (see
  // lib/sync.ts). Used together with `plan` by lib/entitlements.ts; never
  // set locally, always trusted from the cloud like `plan` itself.
  subscriptionStatus: string | null
  // Canonical "does this account get Included AI" flag, pulled verbatim from
  // the backend's aiIncluded() (see lib/sync.ts) — NOT derived locally from
  // `plan`/`subscriptionStatus`. This is what makes gifted access
  // (plan='free' + ai_included_override=true server-side) actually route to
  // Included AI: storeHasProAccess(store) alone can never see that override,
  // since it only exists in the users table, never synced into `plan`
  // itself. Always trust the cloud, like `plan`/`subscriptionStatus`.
  aiIncluded: boolean
  // Local UI preference, device-scoped (see DEVICE_SCOPED_KEYS below) — lets
  // an aiIncluded user opt back into BYOK once that toggle ships, without
  // touching dispatch logic again. No settings UI writes this yet; every
  // aiIncluded user defaults to "included". See lib/entitlements.ts's
  // shouldUseIncludedAi().
  providerMode: "included" | "byok"
  // ── Included AI credits ──────────────────────────────────────────────
  // Server-authoritative, synced from /api/sync. NEVER decremented locally:
  // the backend reserves and charges (see landing/lib/ai/creditService.ts),
  // and these fields exist purely to display a balance. A client-side
  // counter would be both wrong under concurrency and trivially editable.
  //
  // Completely separate from XP. XP is Aminta's progression/game currency;
  // credits are Included AI usage. Never render them as the same thing.
  creditsBalance: number
  creditsAllowance: number
  /** ISO timestamp when the current credit period ends (reset time). */
  creditsPeriodEnd: string
  /** 'day' for Free, 'billing' for Pro, 'monthly' for Founder/Gifted. */
  creditsPeriodKind: string
  /** True for pro/lifetime/active-gift. Free users are aiIncluded but not paid. */
  aiIncludedPaid: boolean

  // ── Voice Refresh ────────────────────────────────────────────────────
  // All server-authoritative, synced from /api/sync. Display only — the
  // backend decides entitlement and allowance on every request and never
  // trusts these. Deliberately separate from credits*: a Voice Refresh
  // costs 0 Included AI credits.
  /** Whether an X account is linked. The access token never comes here. */
  xConnected: boolean
  /** @handle for display. Never the X user id. */
  xUsername: string
  /** X display name, cached at connect/refresh time — never a live API call. */
  xDisplayName: string
  /** X avatar URL, cached at connect/refresh time. */
  xAvatarUrl: string
  /** Can attempt a refresh right now. Server-authoritative — the only thing the UI should gate the button on. */
  voiceRefreshEligible: boolean
  /** ISO timestamp when the 168-hour cooldown ends, or "" when already eligible / never refreshed. */
  voiceRefreshNextEligibleAt: string
  /** ISO timestamp of the last successful refresh, or "" if never. */
  lastVoiceRefreshAt: string

  pendingXP: PendingXPRecord[]

  recentCreations: RecentCreation[]

  // Unfinished Create input, per mode — deliberately NOT typed to
  // lib/createDrafts.ts's CreateDrafts here, because a persisted value can
  // predate the current shape (or be hand-edited). Every read goes through
  // normalizeCreateDrafts(), which validates it back into that type.
  // Completely separate from recentCreations above: that's generated
  // history, this is what the user was still writing.
  createDrafts: unknown
}

export const DEFAULT_MODEL = "google/gemini-flash-1.5"

const DEFAULTS: AmintaStore = {
  apiKey: "",
  model: DEFAULT_MODEL,
  voice: null,
  avatarDataUrl: "",
  displayName: "",
  bio: "",
  interests: "",
  tweetDNA: [],
  styleProfile: null,
  styleProfileHash: "",
  templates: [],
  onboardingDone: false,
  xp: 0,
  generationsTotal: 0,
  postsPublishedTotal: 0,
  earnedHashes: [],
  xpToday: 0,
  xpTodayDate: "",
  bounties: [],
  streak: 0,
  streakDate: "",
  missionDate: "",
  missionGenerates: 0,
  missionPublished: 0,
  missionModes: { tweet: false, reply: false, polish: false },
  plan: "free",
  subscriptionStatus: null,
  aiIncluded: false,
  providerMode: "included",
  creditsBalance: 0,
  creditsAllowance: 0,
  creditsPeriodEnd: "",
  creditsPeriodKind: "day",
  aiIncludedPaid: false,
  xConnected: false,
  xUsername: "",
  xDisplayName: "",
  xAvatarUrl: "",
  voiceRefreshEligible: false,
  voiceRefreshNextEligibleAt: "",
  lastVoiceRefreshAt: "",
  pendingXP: [],
  recentCreations: [],
  createDrafts: {},
}

export async function getStore(): Promise<AmintaStore> {
  const data = await chrome.storage.local.get(DEFAULTS)
  return { ...DEFAULTS, ...data } as AmintaStore
}

export async function setStore(patch: Partial<AmintaStore>): Promise<void> {
  await chrome.storage.local.set(patch)
}

// Device-scoped: tied to this browser/install, not to whoever is signed in.
// Everything else in AmintaStore is account-scoped and must never survive
// a switch to a different Supabase auth user.
// avatarDataUrl isn't synced to the cloud (no schema column, purely a local
// nicety) — device-scoped so it survives clearAccountScopedState() on
// sign-out instead of silently vanishing with nothing to restore it from.
const DEVICE_SCOPED_KEYS = new Set<keyof AmintaStore>(["apiKey", "model", "avatarDataUrl", "providerMode"])

export const ACCOUNT_SCOPED_KEYS = (Object.keys(DEFAULTS) as (keyof AmintaStore)[])
  .filter((k) => !DEVICE_SCOPED_KEYS.has(k))

// Resets every account-scoped field back to its default (Lv.1 / 0 XP / no
// voice profile / etc.) while leaving device-scoped settings (API key, model)
// untouched. Call this before loading a different user's cloud state so a
// stale local cache can never be merged into the wrong account.
export async function clearAccountScopedState(): Promise<void> {
  const patch: Partial<AmintaStore> = {}
  for (const key of ACCOUNT_SCOPED_KEYS) {
    ;(patch as Record<string, unknown>)[key] = DEFAULTS[key]
  }
  await setStore(patch)
}

// Everything above PLUS the personal device-scoped fields — the user's BYOK
// key and their uploaded avatar. Used ONLY after a confirmed successful
// account deletion, never on sign-out: signing out is reversible and keeping
// a provider key you'd otherwise have to re-paste is a deliberate
// convenience, but a deleted account must not leave its owner's API key or
// content sitting on the device.
//
// `model` and `providerMode` are intentionally preserved — they're inert
// preferences (a model name, an enum), carry nothing personal, and clearing
// them would just degrade the next account's setup for no privacy gain.
export async function clearAllLocalUserData(): Promise<void> {
  const patch: Partial<AmintaStore> = {}
  for (const key of ACCOUNT_SCOPED_KEYS) {
    ;(patch as Record<string, unknown>)[key] = DEFAULTS[key]
  }
  patch.apiKey = DEFAULTS.apiKey
  patch.avatarDataUrl = DEFAULTS.avatarDataUrl
  await setStore(patch)
}

// ─── earned_hashes bound ────────────────────────────────────────────────
// earnedHashes prevents the same generated text from being awarded XP twice
// (see lib/xp.ts). It only ever needs to cover the window in which a user
// could plausibly re-insert the same draft — but it was unbounded, so it
// grew by one entry per awarded post forever and synced both ways.
//
// 1000 is sized off the real ceiling: DAILY_CAP is 500 XP/day and the
// cheapest award is 15 XP (polish), so at most ~33 awards land per day.
// 1000 entries is therefore ~30 days of continuous maximum-rate use — far
// beyond any realistic "did I already post this?" window, while keeping the
// array small and bounded. Newest wins: appends go on the end, so the cap
// drops the oldest.
export const MAX_EARNED_HASHES = 1000

export function capEarnedHashes(hashes: string[]): string[] {
  return hashes.length > MAX_EARNED_HASHES ? hashes.slice(-MAX_EARNED_HASHES) : hashes
}

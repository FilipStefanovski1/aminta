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
  humorStyle: string
  formattingPreferences: string
  rhetoricalDevices: string
  cadence: string
  // deterministic 0–1 score computed from corpus size — NOT self-reported
  // by the model. Scales how strongly the profile is applied in prompts.ts.
  confidenceScore: number
}

// Source-tagged writing samples used to build a StyleProfile. Only
// "example" and "tweet_dna" are populated today; "approved_edit" exists so
// a future feature (capturing user-edited drafts) can extend the corpus
// without changing extraction/hashing/caching signatures.
export type StyleCorpusSource = "example" | "tweet_dna" | "approved_edit"
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
  favorite: boolean
  tags: string[]
  usageCount: number
  // tracked now so a future "you've used this format 6 times" suggestion
  // engine needs no schema change later — not built in this pass.
  lastUsedAt?: number
  createdAt: number
  updatedAt: number
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
  companionName: string
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
  earnedHashes: string[]
  xpToday: number
  xpTodayDate: string
  bounties: Bounty[]
  streak: number
  streakDate: string
  missionDate: string
  missionGenerates: number
  missionPublished: number
  plan: Plan
  // Mirrors Supabase users.subscription_status — synced alongside plan (see
  // lib/sync.ts). Used together with `plan` by lib/entitlements.ts; never
  // set locally, always trusted from the cloud like `plan` itself.
  subscriptionStatus: string | null
  pendingXP: PendingXPRecord[]
}

export const DEFAULT_MODEL = "google/gemini-flash-1.5"

const DEFAULTS: AmintaStore = {
  apiKey: "",
  model: DEFAULT_MODEL,
  voice: null,
  companionName: "",
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
  earnedHashes: [],
  xpToday: 0,
  xpTodayDate: "",
  bounties: [],
  streak: 0,
  streakDate: "",
  missionDate: "",
  missionGenerates: 0,
  missionPublished: 0,
  plan: "free",
  subscriptionStatus: null,
  pendingXP: [],
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
// companionName/avatarDataUrl aren't synced to the cloud (no schema column,
// purely a local nicety) — device-scoped so they survive
// clearAccountScopedState() on sign-out instead of silently vanishing with
// nothing to restore them from.
const DEVICE_SCOPED_KEYS = new Set<keyof AmintaStore>(["apiKey", "model", "companionName", "avatarDataUrl"])

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

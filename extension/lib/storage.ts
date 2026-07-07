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

export type Plan = "free" | "pro" | "lifetime"

export interface AmintaStore {
  apiKey: string
  model: string
  voice: VoiceProfile | null
  displayName: string
  bio: string
  interests: string
  tweetDNA: string[]
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
}

export const DEFAULT_MODEL = "google/gemini-flash-1.5"

const DEFAULTS: AmintaStore = {
  apiKey: "",
  model: DEFAULT_MODEL,
  voice: null,
  displayName: "",
  bio: "",
  interests: "",
  tweetDNA: [],
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
const DEVICE_SCOPED_KEYS = new Set<keyof AmintaStore>(["apiKey", "model"])

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

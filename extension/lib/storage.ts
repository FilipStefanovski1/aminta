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
}

export async function getStore(): Promise<AmintaStore> {
  const data = await chrome.storage.local.get(DEFAULTS)
  return { ...DEFAULTS, ...data } as AmintaStore
}

export async function setStore(patch: Partial<AmintaStore>): Promise<void> {
  await chrome.storage.local.set(patch)
}

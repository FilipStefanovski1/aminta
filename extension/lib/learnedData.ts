// "Delete learned data" — removes what Aminta has LEARNED about how the
// user writes, without touching their account, their X connection, or
// anything they authored themselves.
//
// The distinction this file exists to enforce:
//
//   LEARNED / IMPORTED  → removed here
//     styleProfile        distilled traits from a corpus (Voice Refresh or
//                         local extraction)
//     styleProfileHash    cache key for the above; stale once it's gone
//     tweetDNA            imported writing samples
//     voice.examples      pasted/imported writing samples
//
//   EXPLICITLY CONFIGURED → preserved
//     voice.customRules   Instincts — rules the user typed themselves
//     voice.niche/tone/voiceStyle/voiceInspiration
//                         settings the user chose, not things Aminta inferred
//
// VoiceProfile mixes both, so it is rebuilt field-by-field rather than
// nulled — nulling it would silently destroy Instincts, which the user
// never asked to delete.
//
// Deliberately NOT touched: templates and recentCreations (user-authored
// content), createDrafts (unfinished work), x_connections (the user may
// want to re-run Voice Refresh immediately), and the voice_refresh /
// credit ledgers (cooldown and anti-abuse state, not personal content).

import { getStore, setStore, type AmintaStore, type VoiceProfile } from "~lib/storage"

/** The learned-data subset of a store patch. Pure so it can be tested without chrome.storage. */
export interface LearnedDataPatch {
  voice: VoiceProfile | null
  styleProfile: null
  styleProfileHash: string
  tweetDNA: string[]
}

export function buildLearnedDataPatch(voice: VoiceProfile | null): LearnedDataPatch {
  return {
    // Keep the user's own configuration; drop only the imported corpus.
    voice: voice
      ? {
          niche: voice.niche,
          tone: voice.tone,
          examples: "",
          voiceStyle: voice.voiceStyle,
          voiceInspiration: voice.voiceInspiration,
          customRules: voice.customRules,
        }
      : null,
    styleProfile: null,
    styleProfileHash: "",
    tweetDNA: [],
  }
}

/** True once there is nothing learned left to delete — drives the disabled state. */
export function hasLearnedData(store: Pick<AmintaStore, "styleProfile" | "tweetDNA" | "voice">): boolean {
  return (
    !!store.styleProfile ||
    (store.tweetDNA?.length ?? 0) > 0 ||
    !!store.voice?.examples?.trim()
  )
}

/**
 * Clears learned data locally, then pushes the cleared state through the
 * existing sync path so the server copy matches. Local-first by design (the
 * whole app is), but the push is awaited and its failure surfaces to the
 * caller so the UI can say "cleared here, couldn't reach the server" rather
 * than silently diverging.
 */
export async function clearLearnedData(
  pushToCloud: () => Promise<unknown>
): Promise<{ ok: boolean; error?: string }> {
  const store = await getStore()
  await setStore(buildLearnedDataPatch(store.voice))
  try {
    await pushToCloud()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't sync the change." }
  }
}

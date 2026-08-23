import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock lib/ai.ts's generate() so no real API calls happen in tests.
vi.mock("~lib/ai", () => ({
  generate: vi.fn(),
}))
// Mock lib/backendGenerate.ts's backendGenerate() — the Included-AI path
// (shouldUseIncludedAi(store) === true), a real network call otherwise.
// Needed for the "Free-user manual DNA" suite below: a Free account's real
// entitlement is aiIncluded:true funded by its own small daily allowance
// (see app/api/sync/route.ts's `ai_included: true`), not BYOK — BYOK is now
// Pro/Founder only (lib/entitlements.ts's canUseByok()).
vi.mock("~lib/backendGenerate", () => ({
  backendGenerate: vi.fn(),
}))

import { generate } from "~lib/ai"
import { backendGenerate } from "~lib/backendGenerate"
import { buildMessages } from "~lib/prompts"
import { getStore, setStore, type AmintaStore, type StyleProfile, type VoiceProfile } from "~lib/storage"
import {
  buildCorpus,
  computeConfidenceScore,
  getOrBuildStyleProfile,
  hashInputs,
  isXHistorySourced,
  parseStyleProfile,
  sanitizeStyleText,
  X_HISTORY_SOURCE_PREFIX,
} from "~lib/styleProfile"

const mockGenerate = vi.mocked(generate)
const mockBackendGenerate = vi.mocked(backendGenerate)

// In-memory chrome.storage.local stand-in — keeps getStore/setStore working
// under Vitest's node environment (no real chrome global).
let memoryStore: Record<string, unknown> = {}
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: (keys: Record<string, unknown>) =>
        Promise.resolve({ ...keys, ...memoryStore }),
      set: (patch: Record<string, unknown>) => {
        memoryStore = { ...memoryStore, ...patch }
        return Promise.resolve()
      },
    },
  },
})

function baseVoice(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    niche: "general",
    tone: "casual",
    examples: "",
    voiceStyle: "casual",
    voiceInspiration: "nobody",
    customRules: "",
    ...overrides,
  }
}

// Defaults to Pro so the many `apiKey: "gsk_test"` fixtures throughout this
// file keep exercising the BYOK extraction path they were written to test —
// none of those tests are about plan/entitlement, and BYOK now requires
// Pro/Founder (lib/entitlements.ts's canUseByok()). The "Free-user manual
// DNA" suite below explicitly overrides plan back to "free" to test that
// case specifically.
async function makeStore(overrides: Partial<AmintaStore> = {}): Promise<AmintaStore> {
  const store = await getStore()
  const merged = { ...store, plan: "pro" as const, ...overrides }
  await setStore(merged)
  return merged
}

const VALID_EXTRACTION_JSON = JSON.stringify({
  confidence: "assertive",
  energy: "high",
  vocabularyComplexity: "casual",
  capitalization: "lowercase-leaning",
  directness: "direct",
  rhythm: "short, punchy",
  punctuation: "dashes over commas",
  emojiUsage: "none",
  humorStyle: "dry, deadpan",
  formattingPreferences: "single-line",
  rhetoricalDevices: "rhetorical questions",
  cadence: "builds to a punchline",
})

beforeEach(() => {
  memoryStore = {}
  mockGenerate.mockReset()
  mockGenerate.mockResolvedValue(VALID_EXTRACTION_JSON)
})

describe("sanitizeStyleText", () => {
  it("truncates 'about' connective leakage", () => {
    expect(sanitizeStyleText("dry humor about crypto")).toBe("dry humor")
  })

  it("truncates at the earliest topic connective, keeping the style-only prefix", () => {
    expect(sanitizeStyleText("writes like a founder talking about startups")).toBe("writes")
  })

  it("strips URLs, mentions, hashtags, cashtags", () => {
    expect(sanitizeStyleText("check https://example.com @someone #hype $TSLA now")).toBe(
      "check now"
    )
  })

  it("caps free text to 8 words", () => {
    const long = "one two three four five six seven eight nine ten"
    expect(sanitizeStyleText(long).split(" ")).toHaveLength(8)
  })

  it("returns empty string for empty input", () => {
    expect(sanitizeStyleText("")).toBe("")
  })
})

describe("computeConfidenceScore", () => {
  it("staircases with corpus size", () => {
    expect(computeConfidenceScore([])).toBe(0)
    expect(computeConfidenceScore(buildCorpus(["a", "b"], []))).toBe(0.3)
    expect(computeConfidenceScore(buildCorpus(["a", "b", "c", "d", "e"], []))).toBe(0.6)
    expect(computeConfidenceScore(buildCorpus([], Array(10).fill("x")))).toBe(0.85)
    expect(computeConfidenceScore(buildCorpus([], Array(11).fill("x")))).toBe(1.0)
  })
})

describe("parseStyleProfile", () => {
  it("parses valid JSON into a StyleProfile", () => {
    const profile = parseStyleProfile(VALID_EXTRACTION_JSON, 0.6)
    expect(profile.confidence).toBe("assertive")
    expect(profile.humorStyle).toBe("dry, deadpan")
    expect(profile.confidenceScore).toBe(0.6)
  })

  it("falls back to safe defaults on malformed JSON", () => {
    const profile = parseStyleProfile("not json at all {{{", 0.6)
    expect(profile.confidence).toBe("balanced")
    expect(profile.energy).toBe("moderate")
    expect(profile.rhythm).toBe("")
    expect(profile.confidenceScore).toBe(0.6)
  })

  it("rejects out-of-enum values and falls back to defaults", () => {
    const bad = JSON.stringify({ ...JSON.parse(VALID_EXTRACTION_JSON), confidence: "sarcastic" })
    const profile = parseStyleProfile(bad, 0.6)
    expect(profile.confidence).toBe("balanced")
  })

  it("sanitizes free-text fields even when the extractor leaks a topic", () => {
    const leaky = JSON.stringify({
      ...JSON.parse(VALID_EXTRACTION_JSON),
      humorStyle: "dry humor about crypto",
      cadence: "writes like a founder talking about startups",
    })
    const profile = parseStyleProfile(leaky, 0.6)
    expect(profile.humorStyle).toBe("dry humor")
    expect(profile.cadence).toBe("writes")
  })
})

describe("hashInputs / cache invalidation", () => {
  it("changes when corpus content changes", () => {
    const a = buildCorpus(["hello world"], [])
    const b = buildCorpus(["different text"], [])
    expect(hashInputs(a)).not.toBe(hashInputs(b))
  })

  it("is stable for identical corpus content", () => {
    const a = buildCorpus(["hello world"], ["dna one"])
    const b = buildCorpus(["hello world"], ["dna one"])
    expect(hashInputs(a)).toBe(hashInputs(b))
  })
})

describe("getOrBuildStyleProfile", () => {
  it("returns null with no apiKey or empty corpus", async () => {
    const store = await makeStore({ apiKey: "", voice: baseVoice(), tweetDNA: [] })
    expect(await getOrBuildStyleProfile(store)).toBeNull()

    const store2 = await makeStore({ apiKey: "gsk_test", voice: baseVoice(), tweetDNA: [] })
    expect(await getOrBuildStyleProfile(store2)).toBeNull()
  })

  it("extracts and caches on first call, reuses cache on repeat calls", async () => {
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["sample one", "sample two"]) }),
      tweetDNA: ["dna sample"],
    })

    const first = await getOrBuildStyleProfile(store)
    expect(first).not.toBeNull()
    expect(mockGenerate).toHaveBeenCalledTimes(1)

    // Second call reads the persisted cache from storage, not the stale
    // in-memory `store` object — simulate a fresh read like a real caller.
    const refreshed = await getStore()
    const second = await getOrBuildStyleProfile(refreshed)
    expect(second).toEqual(first)
    expect(mockGenerate).toHaveBeenCalledTimes(1) // no second extraction call
  })

  it("re-extracts when the corpus changes (cache invalidation)", async () => {
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["sample one"]) }),
      tweetDNA: [],
    })
    await getOrBuildStyleProfile(store)
    expect(mockGenerate).toHaveBeenCalledTimes(1)

    const edited = await makeStore({
      voice: baseVoice({ examples: JSON.stringify(["a completely different sample"]) }),
    })
    await getOrBuildStyleProfile(edited)
    expect(mockGenerate).toHaveBeenCalledTimes(2)
  })

  it("falls back safely when extraction throws", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("network down"))
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["sample one"]) }),
      tweetDNA: [],
    })
    const result = await getOrBuildStyleProfile(store)
    expect(result).toBeNull() // no prior cache to fall back to
  })

  it("dedupes concurrent calls via single-flight (only one extraction fires)", async () => {
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["sample one"]) }),
      tweetDNA: [],
    })

    const [a, b, c] = await Promise.all([
      getOrBuildStyleProfile(store),
      getOrBuildStyleProfile(store),
      getOrBuildStyleProfile(store),
    ])

    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
    expect(b).toEqual(c)
  })
})

describe("X Voice Refresh precedence — P0 fix", () => {
  // Root cause: getOrBuildStyleProfile() hashed the manual examples/DNA
  // corpus and treated ANY mismatch against the stored hash as staleness,
  // then silently re-extracted and overwrote styleProfile. A Voice
  // Refresh's hash could never match that corpus-derived hash, so the very
  // next Generate call after any successful refresh discarded it — even
  // though onboarding requires at least one example, making this the
  // default outcome for nearly every account, not an edge case.
  //
  // Fix: getOrBuildStyleProfile() now checks isXHistorySourced(hash) FIRST
  // and returns the stored profile immediately when true, before the
  // corpus/hash machinery runs at all. These tests stand in for what
  // voiceRefresh.ts writes on a successful refresh (styleProfile +
  // X_HISTORY_SOURCE_PREFIX-tagged hash, verified against the real
  // constant/predicate rather than a hardcoded string).
  const X_PROFILE: StyleProfile = {
    confidence: "declarative",
    energy: "moderate",
    vocabularyComplexity: "simple",
    capitalization: "lowercase-leaning",
    directness: "direct",
    rhythm: "very short, abrupt fragments",
    punctuation: "completely omitted punctuation",
    emojiUsage: "none",
    humorStyle: "earnest and literal",
    formattingPreferences: "single-sentence posts",
    rhetoricalDevices: "implied subjects, brief observations",
    cadence: "quick and conversational",
    confidenceScore: 1,
  }
  const xHash = () => `${X_HISTORY_SOURCE_PREFIX}${Date.now()}`

  it("isXHistorySourced recognizes exactly the prefix voiceRefresh.ts writes", () => {
    expect(isXHistorySourced(`${X_HISTORY_SOURCE_PREFIX}1234567890`)).toBe(true)
    expect(isXHistorySourced("v1:abc123:5")).toBe(false) // a real hashInputs() output
    expect(isXHistorySourced("")).toBe(false)
  })

  it("[1/2/3] Generate/Reply/Polish all resolve through the same function — the X profile comes back byte-identical, no extraction call", async () => {
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["an old manual example"]) }),
      tweetDNA: ["old dna sample"],
      styleProfile: X_PROFILE,
      styleProfileHash: xHash(),
    })

    for (let i = 0; i < 3; i++) { // stands in for tweet / reply / polish, same call site
      const result = await getOrBuildStyleProfile(await getStore())
      expect(result).toEqual(X_PROFILE)
    }
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it("[4] survives a fresh read of the store (closing/reopening the panel)", async () => {
    await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["example"]) }),
      styleProfile: X_PROFILE,
      styleProfileHash: xHash(),
    })
    // getStore() here is a genuinely fresh read, exactly what a remounted
    // component does — not the stale `store` object from setup.
    const reopened = await getStore()
    expect(await getOrBuildStyleProfile(reopened)).toEqual(X_PROFILE)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it("[5] old manual examples that predate the refresh still lose to the X profile", async () => {
    const store = await makeStore({
      apiKey: "gsk_test",
      // A corpus that, pre-fix, would have hashed to something guaranteed
      // not to match the X-tagged hash and triggered a rebuild.
      voice: baseVoice({ examples: JSON.stringify(["pre-existing example one", "pre-existing example two"]) }),
      tweetDNA: ["pre-existing dna"],
      styleProfile: X_PROFILE,
      styleProfileHash: xHash(),
    })
    expect(await getOrBuildStyleProfile(store)).toEqual(X_PROFILE)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it("[6] adding an example after a refresh does not retrain or touch the X profile — explicit, not silent", async () => {
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["first example"]) }),
      styleProfile: X_PROFILE,
      styleProfileHash: xHash(),
    })
    expect(await getOrBuildStyleProfile(store)).toEqual(X_PROFILE)

    // The user adds a new writing example — VoiceProfileForm's save() path,
    // simulated here as the store mutation it produces.
    const afterAdding = await makeStore({
      voice: baseVoice({ examples: JSON.stringify(["first example", "second example"]) }),
    })
    const result = await getOrBuildStyleProfile(afterAdding)

    // Explicit behavior: the X profile is untouched and no extraction ran.
    // The new example is saved (round-trips through voice.examples, feeding
    // manual extraction later if the source ever becomes "manual" again)
    // but does not, by itself, retrain or discard the learned profile.
    expect(result).toEqual(X_PROFILE)
    expect(mockGenerate).not.toHaveBeenCalled()
    expect(afterAdding.voice?.examples).toContain("second example")
  })

  it("[7] deleting a writing example does not destroy the X profile", async () => {
    await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["a", "b", "c"]) }),
      styleProfile: X_PROFILE,
      styleProfileHash: xHash(),
    })
    const afterDeleting = await makeStore({ voice: baseVoice({ examples: JSON.stringify(["a", "c"]) }) })
    expect(await getOrBuildStyleProfile(afterDeleting)).toEqual(X_PROFILE)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it("[8] a newer X-tagged write (another successful refresh) replaces the old one", async () => {
    await makeStore({ apiKey: "gsk_test", styleProfile: X_PROFILE, styleProfileHash: xHash() })
    const NEWER_PROFILE: StyleProfile = { ...X_PROFILE, cadence: "different cadence from the new refresh" }
    // voiceRefresh.ts writes styleProfile + hash together, unconditionally,
    // on every successful refresh — this is that write, not a rebuild path.
    const afterSecondRefresh = await makeStore({ styleProfile: NEWER_PROFILE, styleProfileHash: xHash() })
    expect(await getOrBuildStyleProfile(afterSecondRefresh)).toEqual(NEWER_PROFILE)
  })

  it("[10] a user who never used Voice Refresh keeps the exact pre-fix behavior", async () => {
    // No X_HISTORY_SOURCE_PREFIX anywhere in this store — isXHistorySourced
    // is false, so the corpus/hash path below runs completely unmodified.
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["sample one"]) }),
      tweetDNA: [],
    })
    await getOrBuildStyleProfile(store)
    expect(mockGenerate).toHaveBeenCalledTimes(1)

    const edited = await makeStore({ voice: baseVoice({ examples: JSON.stringify(["a different sample"]) }) })
    await getOrBuildStyleProfile(edited)
    // The mock always returns the same JSON, so content equality isn't the
    // signal — a second real extraction call firing on a genuine corpus
    // change is: manual-only accounts must keep re-extracting exactly as
    // before this fix (that behavior is untouched, only X-sourced profiles
    // get the new early return).
    expect(mockGenerate).toHaveBeenCalledTimes(2)
  })

  it("[11] BYOK generation still gets the X profile back without touching the BYOK key", async () => {
    // Voice Refresh always runs server-side on Aminta's own key regardless
    // of the user's BYOK setting — a BYOK user's local apiKey must never be
    // consulted to read back an X-derived profile.
    const store = await makeStore({
      apiKey: "gsk_realkey",
      aiIncluded: false,
      providerMode: "byok",
      styleProfile: X_PROFILE,
      styleProfileHash: xHash(),
    })
    expect(await getOrBuildStyleProfile(store)).toEqual(X_PROFILE)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it("[12] confirms zero extraction calls across repeated generations post-refresh", async () => {
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["e1", "e2", "e3"]) }),
      tweetDNA: ["d1", "d2"],
      styleProfile: X_PROFILE,
      styleProfileHash: xHash(),
    })
    for (let i = 0; i < 5; i++) await getOrBuildStyleProfile(await getStore())
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it("a corpus of zero examples/DNA no longer returns null when an X profile exists (second manifestation of the same bug)", async () => {
    // Before the fix, corpus.length === 0 short-circuited to `return null`
    // unconditionally — discarding a perfectly good X-derived profile for
    // any account with no manual examples/DNA, independent of the hash
    // check entirely.
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: "" }),
      tweetDNA: [],
      styleProfile: X_PROFILE,
      styleProfileHash: xHash(),
    })
    expect(await getOrBuildStyleProfile(store)).toEqual(X_PROFILE)
  })
})

describe("buildMessages — no raw voice data ever reaches the prompt", () => {
  it("never contains raw Voice example text", async () => {
    const canaryExample = "XYZZY_EXAMPLE_CANARY_TOKEN about my startup"
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify([canaryExample]) }),
      tweetDNA: [],
    })

    const styleProfile = await getOrBuildStyleProfile(store)
    const messages = buildMessages("x", "tweet", store.voice!, "i like bagels", styleProfile)
    const system = messages.find((m) => m.role === "system")!.content as string

    expect(system).not.toContain(canaryExample)
    expect(system).not.toContain("XYZZY_EXAMPLE_CANARY_TOKEN")
  })

  it("never contains raw Tweet DNA text, including a seeded canary phrase", async () => {
    const canaryDna = "XYZZY_DNA_CANARY_TOKEN blockchain meetup recap"
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice(),
      tweetDNA: [canaryDna, "another dna sample"],
    })

    const styleProfile = await getOrBuildStyleProfile(store)
    const messages = buildMessages("x", "tweet", store.voice!, "i like bagels", styleProfile)
    const system = messages.find((m) => m.role === "system")!.content as string

    expect(system).not.toContain(canaryDna)
    expect(system).not.toContain("XYZZY_DNA_CANARY_TOKEN")
  })

  it("only the structured WRITING STYLE block appears — enum + sanitized fields", async () => {
    const store = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["sample one", "sample two"]) }),
      tweetDNA: ["dna one"],
    })

    const styleProfile = await getOrBuildStyleProfile(store)
    const messages = buildMessages("x", "tweet", store.voice!, "i like bagels", styleProfile)
    const system = messages.find((m) => m.role === "system")!.content as string

    expect(system).toContain("WRITING STYLE")
    expect(system).toContain("Confidence: assertive")
    expect(system).toContain("Humor: dry, deadpan")
  })

  it("scales the confidence prefix with a small vs large corpus", async () => {
    const lowStore = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(["one sample"]) }),
      tweetDNA: [],
    })
    const lowProfile = await getOrBuildStyleProfile(lowStore)
    const lowMessages = buildMessages("x", "tweet", lowStore.voice!, "topic", lowProfile)
    const lowSystem = lowMessages.find((m) => m.role === "system")!.content as string
    expect(lowSystem).toContain("Limited evidence")

    memoryStore = {}
    mockGenerate.mockReset()
    mockGenerate.mockResolvedValue(VALID_EXTRACTION_JSON)

    const highStore = await makeStore({
      apiKey: "gsk_test",
      voice: baseVoice({ examples: JSON.stringify(Array(12).fill("sample")) }),
      tweetDNA: [],
    })
    const highProfile = await getOrBuildStyleProfile(highStore)
    const highMessages = buildMessages("x", "tweet", highStore.voice!, "topic", highProfile)
    const highSystem = highMessages.find((m) => m.role === "system")!.content as string
    expect(highSystem).toContain("well-established pattern")
  })
})

// A real Free account's entitlement is aiIncluded:true (funded by its own
// smaller daily allowance, not BYOK — see app/api/sync/route.ts's
// `ai_included: true` and lib/entitlements.ts's canUseByok(), which now
// requires Pro/Founder). These tests route through backendGenerate()
// (mocked above), never a BYOK key, since a Free plan can no longer use one.
describe("Free-user manual DNA — no X connection, no Pro entitlement required", () => {
  beforeEach(() => {
    mockBackendGenerate.mockReset()
    mockBackendGenerate.mockResolvedValue(VALID_EXTRACTION_JSON)
  })

  it("builds a StyleProfile from bulk-pasted manual examples alone, with no X connection and no Pro entitlement", async () => {
    const store = await makeStore({
      apiKey: "",
      aiIncluded: true,       // Free's own Included-AI allowance, not Pro/Founder
      aiIncludedPaid: false,  // Free
      plan: "free",
      xConnected: false,      // never connected X — irrelevant to manual training
      voice: baseVoice({
        examples: JSON.stringify(["first pasted post", "second pasted post", "third pasted post"]),
      }),
      tweetDNA: [],
    })
    const profile = await getOrBuildStyleProfile(store)
    expect(profile).not.toBeNull()
    expect(profile!.confidence).toBe("assertive")
  })

  it("a 10-post bulk paste is analyzed in exactly ONE extraction call, not one per post", async () => {
    const tenPosts = Array.from({ length: 10 }, (_, i) => `bulk pasted post number ${i + 1}`)
    const store = await makeStore({
      apiKey: "",
      aiIncluded: true,
      plan: "free",
      voice: baseVoice({ examples: JSON.stringify(tenPosts) }),
      tweetDNA: [],
    })
    await getOrBuildStyleProfile(store)
    expect(mockBackendGenerate).toHaveBeenCalledTimes(1)
  })

  it("Free entitlement (aiIncludedPaid=false) does not block manual DNA building", async () => {
    const store = await makeStore({
      apiKey: "",
      aiIncluded: true,
      aiIncludedPaid: false,
      plan: "free",
      xConnected: false,
      voice: baseVoice({ examples: JSON.stringify(["a real post", "another real post"]) }),
      tweetDNA: [],
    })
    const profile = await getOrBuildStyleProfile(store)
    expect(profile).not.toBeNull()
  })

  it("Free entitlement + a stale/manually-set BYOK key: still routes through Included AI, never the stale key", async () => {
    const store = await makeStore({
      apiKey: "gsk_stale_free_key",
      aiIncluded: true,
      plan: "free",
      voice: baseVoice({ examples: JSON.stringify(["a real post", "another real post"]) }),
      tweetDNA: [],
    })
    const profile = await getOrBuildStyleProfile(store)
    expect(profile).not.toBeNull()
    expect(mockBackendGenerate).toHaveBeenCalledTimes(1)
    expect(mockGenerate).not.toHaveBeenCalled()
  })
})

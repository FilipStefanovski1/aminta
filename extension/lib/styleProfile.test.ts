import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock lib/ai.ts's generate() so no real API calls happen in tests.
vi.mock("~lib/ai", () => ({
  generate: vi.fn(),
}))

import { generate } from "~lib/ai"
import { buildMessages } from "~lib/prompts"
import { getStore, setStore, type AmintaStore, type VoiceProfile } from "~lib/storage"
import {
  buildCorpus,
  computeConfidenceScore,
  getOrBuildStyleProfile,
  hashInputs,
  parseStyleProfile,
  sanitizeStyleText,
} from "~lib/styleProfile"

const mockGenerate = vi.mocked(generate)

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

async function makeStore(overrides: Partial<AmintaStore> = {}): Promise<AmintaStore> {
  const store = await getStore()
  const merged = { ...store, ...overrides }
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

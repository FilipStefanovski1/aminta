import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { detectResearchableEntity, fetchEntityContext, maybeGetEntityContext } from "./contextEnrichment"

describe("D. entity detection — lightweight heuristic, no model call", () => {
  it("detects a multi-word Title-Case run as a probable named entity", () => {
    expect(detectResearchableEntity("Solana Summit Serbia")).toBe("Solana Summit Serbia")
    expect(detectResearchableEntity("ETHBelgrade is coming up soon")).toBe("ETHBelgrade")
  })

  it("finds a mid-sentence entity, not just the sentence's own leading word", () => {
    const found = detectResearchableEntity("thinking about going to Solana Summit Serbia next month")
    expect(found).toBe("Solana Summit Serbia")
  })

  it("E. does not fire on ordinary vague/generic text with no entity", () => {
    expect(detectResearchableEntity("just thinking about stuff today")).toBeNull()
    expect(detectResearchableEntity("i met some cool builders")).toBeNull()
  })

  it("does not treat a single leading capitalized word in a real sentence as an entity (ordinary sentence-initial capitalization)", () => {
    expect(detectResearchableEntity("Started building something new today")).toBeNull()
  })

  it("a bare single-word topic ('Cursor', 'Breakpoint', 'Solana') IS researchable — unambiguous since it's the whole input", () => {
    expect(detectResearchableEntity("Cursor")).toBe("Cursor")
    expect(detectResearchableEntity("Breakpoint")).toBe("Breakpoint")
    expect(detectResearchableEntity("Solana")).toBe("Solana")
  })

  // Regression: found via eval (landing/eval/generation-quality) — a bare
  // capitalized common noun ("Gym", "Coding") is structurally identical to
  // a bare capitalized proper noun ("Cursor") under rule 3 above, and a
  // real user capitalizes a one-word topic out of habit regardless of
  // whether the word is a proper noun. Without this stoplist, every one of
  // these silently spent a real Gemini call on nothing.
  it("does NOT treat a bare capitalized common/generic topic word as an entity, lowercase or capitalized", () => {
    const genericTopics = [
      "coding", "design", "startup", "basketball", "marketing", "gym", "coffee",
      "founders", "programming", "school",
    ]
    for (const word of genericTopics) {
      expect(detectResearchableEntity(word)).toBeNull()
      const capitalized = word[0].toUpperCase() + word.slice(1)
      expect(detectResearchableEntity(capitalized)).toBeNull()
    }
  })

  it("E. 'building in public' (a topic-only multi-word phrase, no caps) never triggers research", () => {
    expect(detectResearchableEntity("building in public")).toBeNull()
  })

  it("returns null for empty input", () => {
    expect(detectResearchableEntity("")).toBeNull()
    expect(detectResearchableEntity("   ")).toBeNull()
  })
})

describe("maybeGetEntityContext — gating", () => {
  const ORIGINAL_ENV = process.env.CONTEXT_RESEARCH_ENABLED

  afterEach(() => {
    process.env.CONTEXT_RESEARCH_ENABLED = ORIGINAL_ENV
    vi.unstubAllGlobals()
  })

  it("never researches when CONTEXT_RESEARCH_ENABLED is unset (safe default)", async () => {
    delete process.env.CONTEXT_RESEARCH_ENABLED
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const result = await maybeGetEntityContext("Solana Summit Serbia")
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("E. never researches generic text even when enabled — no entity to look up", async () => {
    process.env.CONTEXT_RESEARCH_ENABLED = "true"
    process.env.GEMINI_API_KEY = "test-key"
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const result = await maybeGetEntityContext("just vibing today")
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    delete process.env.GEMINI_API_KEY
  })
})

describe("F. fetchEntityContext — structured facts only, never a raw search dump", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GEMINI_API_KEY
  })

  function geminiResponse(text: string) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    } as unknown as Response
  }

  it("parses a well-formed grounded response into the compact EntityContext shape", async () => {
    const payload = {
      entityName: "Solana Summit Serbia",
      entityType: "event",
      verifiedFacts: ["A Solana ecosystem conference held in Serbia."],
      notableTopics: ["DeFi", "infrastructure"],
      people: [],
      dates: ["2026"],
      sourceRefs: ["solana.com"],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(payload))))

    const result = await fetchEntityContext("Solana Summit Serbia")
    expect(result).toEqual(payload)
  })

  it("uses the google_search grounding tool, not a separate search provider/dependency", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse('{"entityName":"X","entityType":"event","verifiedFacts":["fact"],"notableTopics":[],"people":[],"dates":[],"sourceRefs":[]}'))
    vi.stubGlobal("fetch", fetchMock)

    await fetchEntityContext("Solana Summit Serbia")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("generativelanguage.googleapis.com")
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.tools).toEqual([{ google_search: {} }])
  })

  it("G. a malformed/truncated JSON response degrades to null, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse("not valid json at all")))
    await expect(fetchEntityContext("Solana Summit Serbia")).resolves.toBeNull()
  })

  it("G. a network failure degrades to null, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    await expect(fetchEntityContext("Solana Summit Serbia")).resolves.toBeNull()
  })

  it("G. a non-OK provider response degrades to null, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response))
    await expect(fetchEntityContext("Solana Summit Serbia")).resolves.toBeNull()
  })

  it("returns null (never a half-empty object) when the model found nothing to say", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse('{"entityName":"","entityType":"","verifiedFacts":[],"notableTopics":[],"people":[],"dates":[],"sourceRefs":[]}')))
    await expect(fetchEntityContext("some obscure nonexistent thing")).resolves.toBeNull()
  })

  it("returns null with no GEMINI_API_KEY configured, without ever calling fetch", async () => {
    delete process.env.GEMINI_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(fetchEntityContext("Solana Summit Serbia")).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

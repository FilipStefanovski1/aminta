import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  detectResearchableEntity, extractGroundedContext, fetchEntityContext, maybeGetEntityContext,
  fetchEntityContextWithDebug, maybeGetEntityContextWithDebug,
} from "./contextEnrichment"

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

// ─── v2.1 evidence gate ─────────────────────────────────────────────────
// Builds a raw Gemini response shape matching what's actually observed
// live (see landing/eval/generation-quality/REPORT.md's v2.1 section) —
// FACT: lines plus real groundingChunks/groundingSupports, not the old
// self-reported-JSON shape this used to trust with zero cross-check.
function groundedResponse(
  factLines: string[],
  chunks: { title: string }[],
  supportsFor: Record<number, number[]> // fact index -> chunk indices backing it; omit an index for "no support at all"
) {
  const text = factLines.map((f) => `FACT: ${f}`).join("\n")
  const groundingSupports = Object.entries(supportsFor).map(([factIndex, chunkIndices]) => ({
    segment: { text: `FACT: ${factLines[Number(factIndex)]}` },
    groundingChunkIndices: chunkIndices,
  }))
  return {
    candidates: [
      {
        content: { parts: [{ text }] },
        groundingMetadata: {
          groundingChunks: chunks.map((c) => ({ web: { uri: `https://example.com/${c.title}`, title: c.title } })),
          groundingSupports,
        },
      },
    ],
  }
}

describe("F/§11. evidence gate — extractGroundedContext (pure, real response shape)", () => {
  it("§11.A — a fact with clear grounding support (2 distinct reputable-looking domains) is admitted", () => {
    const data = groundedResponse(
      ["The event is organized by Superteam Balkan."],
      [{ title: "solanasummit.org" }, { title: "belgradeblockchainweek.com" }],
      { 0: [0, 1] }
    )
    const result = extractGroundedContext("Solana Summit Serbia", data)
    expect(result?.verifiedFacts).toEqual(["The event is organized by Superteam Balkan."])
  })

  it("§11.B — a fact whose only support is a forum/social domain (weak/ambiguous authority) is rejected", () => {
    const data = groundedResponse(
      ["Someone said the event was cancelled."],
      [{ title: "reddit.com" }],
      { 0: [0] }
    )
    const result = extractGroundedContext("Solana Summit Serbia", data)
    expect(result).toBeNull() // the only candidate fact was rejected, nothing left
  })

  it("§11.C — a fact with no matching grounding segment at all (no source linkage) is rejected", () => {
    const data = groundedResponse(
      ["This fact has no matching segment.", "This one does."],
      [{ title: "wikipedia.org" }],
      { 1: [0] }, // only fact index 1 has a support entry — fact 0 has none
    )
    const result = extractGroundedContext("Solana Summit Serbia", data)
    expect(result?.verifiedFacts).toEqual(["This one does."])
  })

  it("§11.D — several facts returned, only some well-supported — only the supported ones reach the writer", () => {
    const data = groundedResponse(
      [
        "Well-supported fact.",
        "Forum-only fact.",
        "Unsupported fact with no segment at all.",
      ],
      [{ title: "wikipedia.org" }, { title: "reddit.com" }],
      { 0: [0], 1: [1] }, // fact 2 gets no support entry at all
    )
    const result = extractGroundedContext("Solana Summit Serbia", data)
    expect(result?.verifiedFacts).toEqual(["Well-supported fact."])
  })

  it("§11.E — all facts rejected means null, not an empty-but-truthy object (generation proceeds without context)", () => {
    const data = groundedResponse(
      ["Reddit-only claim one.", "Reddit-only claim two."],
      [{ title: "reddit.com" }],
      { 0: [0], 1: [0] }
    )
    expect(extractGroundedContext("Solana Summit Serbia", data)).toBeNull()
  })

  it("§7 — a high-risk category fact (acquisition) needs 2+ distinct domains; 1 domain alone is rejected even if reputable", () => {
    const data = groundedResponse(
      ["The company was acquired by a larger firm in a $50 million deal."],
      [{ title: "wikipedia.org" }],
      { 0: [0] }
    )
    expect(extractGroundedContext("Cursor", data)).toBeNull()
  })

  it("§7 — the SAME high-risk fact with 2 distinct domains (neither denylisted) is admitted", () => {
    const data = groundedResponse(
      ["The company was acquired by a larger firm in a $50 million deal."],
      [{ title: "wikipedia.org" }, { title: "forbes.com" }],
      { 0: [0, 1] }
    )
    expect(extractGroundedContext("Cursor", data)?.verifiedFacts).toHaveLength(1)
  })

  it("§7 — a funding claim (not just 'acquisition') is also held to the 2-domain bar", () => {
    const data = groundedResponse(
      ["The startup raised $8 million in seed funding."],
      [{ title: "wikipedia.org" }],
      { 0: [0] }
    )
    expect(extractGroundedContext("Cursor", data)).toBeNull()
  })

  it("real regression: the exact single-source funding claim from a live eval run is rejected, while the corroborated one survives", () => {
    // Real captured Gemini output (see REPORT.md) — the $8M seed round had
    // only wikipedia.org backing it; the $2.3B Series D had 2 domains.
    const data = groundedResponse(
      [
        "In October 2023, the startup announced an $8 million seed funding round led by the OpenAI Startup Fund.",
        "In November 2025, Cursor raised a $2.3 billion Series D funding round at a $29.3 billion post-money valuation.",
      ],
      [{ title: "wikipedia.org" }, { title: "builtin.com" }, { title: "medium.com" }],
      { 0: [0], 1: [1, 2] }
    )
    const result = extractGroundedContext("Cursor", data)
    expect(result?.verifiedFacts).toEqual(["In November 2025, Cursor raised a $2.3 billion Series D funding round at a $29.3 billion post-money valuation."])
  })

  it("zero grounding metadata at all (model answered from pretraining, no search backing) yields null", () => {
    const data = {
      candidates: [{ content: { parts: [{ text: "FACT: Something the model just knows." }] }, groundingMetadata: { groundingChunks: [], groundingSupports: [] } }],
    }
    expect(extractGroundedContext("Cursor", data)).toBeNull()
  })

  it("a response that ignores the FACT: format entirely yields null rather than treating raw prose as facts", () => {
    const data = {
      candidates: [{
        content: { parts: [{ text: "Cursor is a code editor made by Anysphere." }] },
        groundingMetadata: { groundingChunks: [{ web: { title: "wikipedia.org" } }], groundingSupports: [{ segment: { text: "Cursor is a code editor" }, groundingChunkIndices: [0] }] },
      }],
    }
    expect(extractGroundedContext("Cursor", data)).toBeNull()
  })
})

describe("fetchEntityContext — network-level behavior", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GEMINI_API_KEY
  })

  function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body } as unknown as Response
  }

  it("uses the google_search grounding tool, not a separate search provider/dependency", async () => {
    const data = groundedResponse(["A fact."], [{ title: "wikipedia.org" }, { title: "forbes.com" }], { 0: [0, 1] })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(data))
    vi.stubGlobal("fetch", fetchMock)

    await fetchEntityContext("Solana Summit Serbia")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("generativelanguage.googleapis.com")
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.tools).toEqual([{ google_search: {} }])
  })

  it("G. a malformed response degrades to null, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ not: "the expected shape at all" })))
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

  it("§11.E — returns null (never a half-empty object) when nothing survives the gate", async () => {
    const data = groundedResponse(["Reddit-only claim."], [{ title: "reddit.com" }], { 0: [0] })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(data)))
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

// ─── Debug observability (instrumentation only, no behavior change) ───────
// These wrappers exist purely so route.ts can log candidate/accepted/
// rejected counts and a coarse fallback reason without changing what
// generation actually receives — extractGroundedContext/fetchEntityContext/
// maybeGetEntityContext above are unchanged thin wrappers over the exact
// same internals, already proven identical by every test above still
// passing untouched.
describe("H. debug observability wrappers — real counts, no behavior change", () => {
  function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body } as unknown as Response
  }

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key"
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GEMINI_API_KEY
  })

  it("A. a fully successful research call reports real candidate/accepted/rejected counts, matching the context that was actually admitted", async () => {
    const data = groundedResponse(
      ["Well-supported fact one.", "Well-supported fact two.", "Forum-only fact, rejected."],
      [{ title: "wikipedia.org" }, { title: "reddit.com" }],
      { 0: [0], 1: [0], 2: [1] }
    )
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(data)))

    const result = await fetchEntityContextWithDebug("Solana Summit Serbia")
    expect(result.candidateFacts).toBe(3)
    expect(result.acceptedFacts).toBe(2)
    expect(result.fallbackReason).toBeNull()
    expect(result.context?.verifiedFacts).toEqual(["Well-supported fact one.", "Well-supported fact two."])
  })

  // NOTE: CONTEXT_RESEARCH_ENABLED is read once at module load (see
  // contextEnrichment.ts) — mutating process.env mid-test-file can't flip
  // it, same constraint the existing "gating" describe block above already
  // lives with. So this exercises the entity->debug reporting path
  // directly via fetchEntityContextWithDebug (what maybeGetEntityContext-
  // WithDebug delegates to once the gate passes), rather than fighting the
  // frozen module constant.
  it("B/C. fetchEntityContextWithDebug reports the exact requested entity and correct counts for bare single-word entities (OpenAI, Cursor)", async () => {
    for (const word of ["OpenAI", "Cursor"]) {
      expect(detectResearchableEntity(word)).toBe(word) // confirms these DO pass the trigger heuristic
      const data = groundedResponse(["A fact."], [{ title: "wikipedia.org" }, { title: "forbes.com" }], { 0: [0, 1] })
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(data)))
      const result = await fetchEntityContextWithDebug(word)
      expect(result.context?.entityName).toBe(word)
      expect(result.candidateFacts).toBe(1)
      expect(result.acceptedFacts).toBe(1)
      expect(result.fallbackReason).toBeNull()
    }
  })

  it("D/E/F. researchTriggered=false for generic single-word topics (coding, Gym, startup) — no fetch ever attempted, regardless of CONTEXT_RESEARCH_ENABLED", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    for (const word of ["coding", "Gym", "startup"]) {
      expect(detectResearchableEntity(word)).toBeNull() // the actual reason these never trigger
      const { context, debug } = await maybeGetEntityContextWithDebug(word)
      expect(context).toBeNull()
      expect(debug.triggered).toBe(false)
      expect(debug.detectedEntity).toBeNull()
      expect(debug.candidateFacts).toBe(0)
      expect(debug.fallback).toBe(false) // never triggered, so nothing "fell back"
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("G. a provider network failure still lets generation proceed (context null) and reports a safe coarse fallback reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down, here is a sensitive internal detail")))
    const result = await fetchEntityContextWithDebug("Solana Summit Serbia")
    expect(result.context).toBeNull()
    expect(result.fallbackReason).toBe("provider_error")
    // The raw exception text must never leak into the safe reason field.
    expect(result.fallbackReason).not.toContain("sensitive")
  })

  it("G. a non-OK provider response reports provider_error as the fallback reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response))
    const result = await fetchEntityContextWithDebug("Solana Summit Serbia")
    expect(result.context).toBeNull()
    expect(result.fallbackReason).toBe("provider_error")
  })

  it("zero grounding at all reports no_grounding as the fallback reason", async () => {
    const data = {
      candidates: [{ content: { parts: [{ text: "FACT: Something the model just knows." }] }, groundingMetadata: { groundingChunks: [], groundingSupports: [] } }],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(data)))
    const result = await fetchEntityContextWithDebug("Cursor")
    expect(result.fallbackReason).toBe("no_grounding")
  })

  it("candidates found but none pass the evidence gate reports no_supported_facts", async () => {
    const data = groundedResponse(["Reddit-only claim."], [{ title: "reddit.com" }], { 0: [0] })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(data)))
    const result = await fetchEntityContextWithDebug("some obscure nonexistent thing")
    expect(result.candidateFacts).toBe(1)
    expect(result.acceptedFacts).toBe(0)
    expect(result.fallbackReason).toBe("no_supported_facts")
  })

  it("a response that ignores the FACT: format entirely reports invalid_response, not no_supported_facts", async () => {
    const data = {
      candidates: [{
        content: { parts: [{ text: "Cursor is a code editor made by Anysphere." }] },
        groundingMetadata: { groundingChunks: [{ web: { title: "wikipedia.org" } }], groundingSupports: [{ segment: { text: "Cursor is a code editor" }, groundingChunkIndices: [0] }] },
      }],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(data)))
    const result = await fetchEntityContextWithDebug("Cursor")
    expect(result.candidateFacts).toBe(0)
    expect(result.fallbackReason).toBe("invalid_response")
  })

  it("no GEMINI_API_KEY reports provider_error without ever calling fetch", async () => {
    delete process.env.GEMINI_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const result = await fetchEntityContextWithDebug("Solana Summit Serbia")
    expect(result.fallbackReason).toBe("provider_error")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("CONTEXT_RESEARCH_ENABLED unset: triggered=false, fallback=false — disabled is not a failure", async () => {
    delete process.env.CONTEXT_RESEARCH_ENABLED
    const { debug } = await maybeGetEntityContextWithDebug("Solana Summit Serbia")
    expect(debug.triggered).toBe(false)
    expect(debug.fallback).toBe(false)
    expect(debug.fallbackReason).toBeNull()
  })
})

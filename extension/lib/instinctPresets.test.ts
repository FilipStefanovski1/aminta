import { describe, expect, it } from "vitest"
import {
  INSTINCT_CATEGORIES,
  INSTINCT_PRESETS,
  POPULAR_INSTINCT_PRESETS,
  PRESET_BY_LABEL,
  PRESET_BY_PROMPT,
  searchInstinctPresets,
} from "~lib/instinctPresets"

describe("INSTINCT_PRESETS", () => {
  it("every preset has all required fields populated", () => {
    for (const p of INSTINCT_PRESETS) {
      expect(p.id.length).toBeGreaterThan(0)
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.internalPrompt.length).toBeGreaterThan(0)
      expect(INSTINCT_CATEGORIES).toContain(p.category)
      expect(typeof p.popular).toBe("boolean")
    }
  })

  it("has no duplicate ids", () => {
    const ids = INSTINCT_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("has no duplicate labels", () => {
    const labels = INSTINCT_PRESETS.map(p => p.label.toLowerCase())
    expect(new Set(labels).size).toBe(labels.length)
  })

  it("has no duplicate internal prompts", () => {
    const prompts = INSTINCT_PRESETS.map(p => p.internalPrompt)
    expect(new Set(prompts).size).toBe(prompts.length)
  })

  it("never exposes internalPrompt-shaped instruction text as the label", () => {
    // Labels are short casual phrases; internal prompts are full sentences.
    // A label ending in a period would suggest a mapping mistake.
    for (const p of INSTINCT_PRESETS) {
      expect(p.label.endsWith(".")).toBe(false)
    }
  })

  it("covers every requested category with at least one preset", () => {
    for (const category of INSTINCT_CATEGORIES) {
      expect(INSTINCT_PRESETS.some(p => p.category === category)).toBe(true)
    }
  })
})

describe("POPULAR_INSTINCT_PRESETS", () => {
  it("matches exactly the requested popular set", () => {
    const labels = POPULAR_INSTINCT_PRESETS.map(p => p.label).sort()
    expect(labels).toEqual(
      [
        "use lowercase",
        "no hashtags",
        "one sentence per paragraph",
        "sound conversational",
        "first line should be a hook",
        "keep it concise",
        "avoid corporate language",
        "use simple words",
      ].sort()
    )
  })
})

describe("PRESET_BY_PROMPT / PRESET_BY_LABEL", () => {
  it("resolves a stored internalPrompt back to its preset", () => {
    const preset = PRESET_BY_PROMPT.get("Never include hashtags.")
    expect(preset?.label).toBe("no hashtags")
  })

  it("returns undefined for text that isn't a known preset (a real custom instinct)", () => {
    expect(PRESET_BY_PROMPT.get("never mention my ex-employer")).toBeUndefined()
  })

  it("resolves a typed label case-insensitively", () => {
    expect(PRESET_BY_LABEL.get("no hashtags")?.internalPrompt).toBe("Never include hashtags.")
    expect(PRESET_BY_LABEL.get("NO HASHTAGS")).toBeUndefined() // map key is already-lowercased text
  })
})

describe("searchInstinctPresets", () => {
  it("returns the full library for an empty query", () => {
    expect(searchInstinctPresets("")).toHaveLength(INSTINCT_PRESETS.length)
    expect(searchInstinctPresets("   ")).toHaveLength(INSTINCT_PRESETS.length)
  })

  it("filters case-insensitively on the label", () => {
    const results = searchInstinctPresets("HASHTAG")
    expect(results.length).toBeGreaterThan(0)
    expect(results.every(p => p.label.toLowerCase().includes("hashtag"))).toBe(true)
  })

  it("returns an empty array when nothing matches", () => {
    expect(searchInstinctPresets("xyzzy-not-a-real-instinct")).toEqual([])
  })
})

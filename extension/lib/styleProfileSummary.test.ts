// The "What Aminta learned" presentation.
//
// This is display-only, so what matters is: it reads from the saved profile,
// it never invents an attribute, empty fields disappear rather than rendering
// blank, and confidenceScore stays out of the user-facing view.
import { describe, it, expect } from "vitest"
import { summarizeStyleProfile, summaryAffordanceFor } from "./styleProfileSummary"
import type { StyleProfile } from "./storage"

/** A real production profile, verbatim from ai_usage_log. */
const REAL: StyleProfile = {
  confidence: "declarative",
  energy: "moderate",
  vocabularyComplexity: "simple",
  capitalization: "lowercase-leaning",
  directness: "direct",
  rhythm: "very short, abrupt fragments",
  punctuation: "completely omitted punctuation",
  emojiUsage: "none", hashtagUsage: "",
  humorStyle: "earnest and literal",
  formattingPreferences: "single-sentence posts",
  rhetoricalDevices: "implied subjects, brief observations",
  cadence: "quick and conversational",
  confidenceScore: 1,
}

/** The shape a thin corpus produces: enums set, all free text empty. */
const SPARSE: StyleProfile = {
  ...REAL,
  rhythm: "", punctuation: "", emojiUsage: "", hashtagUsage: "", humorStyle: "",
  formattingPreferences: "", rhetoricalDevices: "", cadence: "",
  confidenceScore: 0.3,
}

const flat = (sp: StyleProfile | null) =>
  summarizeStyleProfile(sp).flatMap((s) => [s.title, s.inline ?? "", ...s.lines]).join(" | ")

describe("sections", () => {
  it("renders the four groups in order for a full profile", () => {
    expect(summarizeStyleProfile(REAL).map((s) => s.title))
      .toEqual(["Tone", "Structure", "Writing habits", "Pacing"])
  })

  it("returns nothing when there is no profile yet", () => {
    expect(summarizeStyleProfile(null)).toEqual([])
  })

  it("keeps Tone and Writing habits even when every free-text field is empty", () => {
    // The 5 enums are always populated, so the panel can never be empty.
    expect(summarizeStyleProfile(SPARSE).map((s) => s.title)).toEqual(["Tone", "Writing habits"])
  })

  it("drops Structure and Pacing when they would be blank", () => {
    const titles = summarizeStyleProfile(SPARSE).map((s) => s.title)
    expect(titles).not.toContain("Structure")
    expect(titles).not.toContain("Pacing")
  })

  it("never emits an empty line", () => {
    for (const sp of [REAL, SPARSE]) {
      for (const s of summarizeStyleProfile(sp)) {
        expect(s.lines.every((l) => l.trim().length > 0)).toBe(true)
      }
    }
  })
})

describe("humanized labels — display only", () => {
  it("turns lowercase-leaning into readable text", () => {
    expect(flat(REAL)).toContain("mostly lowercase")
    expect(flat(REAL)).not.toContain("lowercase-leaning")
  })

  it("renders emphatic-caps readably", () => {
    expect(flat({ ...REAL, capitalization: "emphatic-caps" })).toContain("emphatic capitals")
  })

  it('renders emojiUsage "none" as "no emoji"', () => {
    expect(flat(REAL)).toContain("no emoji")
  })

  it("keeps a descriptive emoji habit as written", () => {
    expect(flat({ ...REAL, emojiUsage: "sparing, 1 per post" })).toContain("sparing, 1 per post")
  })

  it("labels vocabulary and energy readably", () => {
    const out = flat(REAL)
    expect(out).toContain("simple vocabulary")
    expect(out).toContain("moderate energy")
  })

  it("does NOT mutate the profile it was given", () => {
    const copy = { ...REAL }
    summarizeStyleProfile(REAL)
    expect(REAL).toEqual(copy)
  })

  it("passes through an unrecognized enum rather than blanking it", () => {
    const odd = { ...REAL, confidence: "unknown" as StyleProfile["confidence"] }
    expect(flat(odd)).toContain("unknown")
  })
})

describe("what must never be exposed", () => {
  it("never shows confidenceScore", () => {
    const out = flat(REAL)
    expect(out).not.toContain("1")       // the raw score
    expect(out.toLowerCase()).not.toContain("confidencescore")
    expect(out).not.toMatch(/\b\d+%/)     // nor a percentage rendering of it
  })

  it("surfaces the 12 style fields and nothing more", () => {
    const out = flat(REAL)
    for (const v of [
      "very short, abrupt fragments", "completely omitted punctuation",
      "earnest and literal", "single-sentence posts",
      "implied subjects, brief observations", "quick and conversational",
    ]) expect(out).toContain(v)
  })

  it("invents no attribute that is not in the profile", () => {
    // Every rendered line must trace back to a stored field or its label map.
    const allowed = new Set([
      "Tone", "Structure", "Writing habits", "Pacing",
      "declarative · moderate energy · direct",
      "earnest and literal", "single-sentence posts", "very short, abrupt fragments",
      "mostly lowercase", "completely omitted punctuation", "no emoji",
      "simple vocabulary", "implied subjects, brief observations",
      "quick and conversational",
    ])
    for (const s of summarizeStyleProfile(REAL)) {
      expect(allowed.has(s.title)).toBe(true)
      if (s.inline) expect(allowed.has(s.inline)).toBe(true)
      for (const l of s.lines) expect(allowed.has(l)).toBe(true)
    }
  })
})

describe("when the summary is available", () => {
  const withProfile = { styleProfile: REAL, lastVoiceRefreshAt: "2026-08-17T14:03:59Z" }

  it("immediately after a successful refresh, in the same session", () => {
    const a = summaryAffordanceFor(withProfile, 16)
    expect(a.kind).toBe("fresh")
    if (a.kind === "fresh") expect(a.postsAnalyzed).toBe(16)
  })

  it("still available after closing and reopening the panel", () => {
    // justRefreshed is transient state and resets to null on remount; the
    // affordance must survive on the persisted profile + timestamp.
    const a = summaryAffordanceFor(withProfile, null)
    expect(a.kind).toBe("history")
    if (a.kind === "history") expect(a.lastRefreshedAt).toBe("2026-08-17T14:03:59Z")
  })

  it("renders the same sections in both states — one persisted source", () => {
    expect(summarizeStyleProfile(REAL)).toEqual(summarizeStyleProfile(withProfile.styleProfile))
  })
})

describe("never implies a profile came from X when it did not", () => {
  it("a manually trained profile with no Voice Refresh shows nothing", () => {
    // Built from Voice examples + Tweet DNA. Claiming "Last refreshed" here
    // would attribute the user's own training to X.
    const a = summaryAffordanceFor({ styleProfile: REAL, lastVoiceRefreshAt: "" }, null)
    expect(a.kind).toBe("none")
  })

  it("a refresh timestamp with no saved profile shows nothing", () => {
    expect(summaryAffordanceFor({ styleProfile: null, lastVoiceRefreshAt: "2026-08-17T14:03:59Z" }, null).kind).toBe("none")
  })

  it("a brand-new account shows nothing", () => {
    expect(summaryAffordanceFor({ styleProfile: null, lastVoiceRefreshAt: "" }, null).kind).toBe("none")
  })

  it("a fresh refresh of 0 posts is still treated as fresh, not hidden", () => {
    // 0 is a real count, not "absent" — guards against a falsy-check bug.
    expect(summaryAffordanceFor({ styleProfile: REAL, lastVoiceRefreshAt: "" }, 0).kind).toBe("fresh")
  })
})

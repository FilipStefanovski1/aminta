import { describe, expect, it } from "vitest"

import { canUseByok, effectiveApiKey } from "~lib/entitlements"

describe("canUseByok — BYOK is Pro/Founder only", () => {
  it("Free (no plan, or plan: 'free') cannot use BYOK", () => {
    expect(canUseByok({})).toBe(false)
    expect(canUseByok({ plan: "free" })).toBe(false)
  })

  it("Pro with an entitled subscriptionStatus can use BYOK", () => {
    expect(canUseByok({ plan: "pro", subscriptionStatus: "active" })).toBe(true)
    expect(canUseByok({ plan: "pro", subscriptionStatus: "canceled" })).toBe(true)
    expect(canUseByok({ plan: "pro", subscriptionStatus: null })).toBe(true)
  })

  it("Pro with a revoked subscriptionStatus cannot use BYOK", () => {
    expect(canUseByok({ plan: "pro", subscriptionStatus: "expired" })).toBe(false)
  })

  it("Founder/lifetime can always use BYOK, regardless of subscriptionStatus", () => {
    expect(canUseByok({ plan: "lifetime" })).toBe(true)
    expect(canUseByok({ plan: "lifetime", subscriptionStatus: "expired" })).toBe(true)
  })
})

// Security-critical: this is THE gate every generation call site reads
// through instead of store.apiKey directly (see backendGenerate.ts,
// GeneratorPanel.tsx, styleProfile.ts, twitter-bridge.ts) — plan
// entitlement must always win over mere presence of a stored key.
describe("effectiveApiKey — plan entitlement wins over presence of a key", () => {
  it("Free user with NO stored key: still empty (baseline)", () => {
    expect(effectiveApiKey({ apiKey: "", plan: "free", subscriptionStatus: null })).toBe("")
  })

  it("Free user with a stale/manually-set Gemini key: key is NOT usable", () => {
    expect(effectiveApiKey({ apiKey: "AIzaFakeGeminiKey", plan: "free", subscriptionStatus: null })).toBe("")
  })

  it("Free user with a stale/manually-set Groq key: key is NOT usable", () => {
    expect(effectiveApiKey({ apiKey: "gsk_FakeGroqKey", plan: "free", subscriptionStatus: null })).toBe("")
  })

  it("Free user with a stale/manually-set OpenRouter key: key is NOT usable", () => {
    expect(effectiveApiKey({ apiKey: "sk-or-FakeKey", plan: "free", subscriptionStatus: null })).toBe("")
  })

  it("Pro user's key is usable for every provider", () => {
    expect(effectiveApiKey({ apiKey: "AIzaFakeGeminiKey", plan: "pro", subscriptionStatus: "active" })).toBe("AIzaFakeGeminiKey")
    expect(effectiveApiKey({ apiKey: "gsk_FakeGroqKey", plan: "pro", subscriptionStatus: "active" })).toBe("gsk_FakeGroqKey")
    expect(effectiveApiKey({ apiKey: "sk-or-FakeKey", plan: "pro", subscriptionStatus: "active" })).toBe("sk-or-FakeKey")
  })

  it("Founder/lifetime user's key is usable", () => {
    expect(effectiveApiKey({ apiKey: "AIzaFakeGeminiKey", plan: "lifetime", subscriptionStatus: null })).toBe("AIzaFakeGeminiKey")
  })

  it("downgrade Pro -> Free: the same stored key stops being usable", () => {
    const stored = "AIzaSameKeyAllAlong"
    expect(effectiveApiKey({ apiKey: stored, plan: "pro", subscriptionStatus: "active" })).toBe(stored)
    expect(effectiveApiKey({ apiKey: stored, plan: "free", subscriptionStatus: null })).toBe("")
  })

  it("upgrade Free -> Pro: the same stored key becomes usable", () => {
    const stored = "AIzaSameKeyAllAlong"
    expect(effectiveApiKey({ apiKey: stored, plan: "free", subscriptionStatus: null })).toBe("")
    expect(effectiveApiKey({ apiKey: stored, plan: "pro", subscriptionStatus: "active" })).toBe(stored)
  })

  it("Pro with a revoked subscriptionStatus (e.g. expired): key stops being usable", () => {
    expect(effectiveApiKey({ apiKey: "AIzaFakeGeminiKey", plan: "pro", subscriptionStatus: "expired" })).toBe("")
  })
})

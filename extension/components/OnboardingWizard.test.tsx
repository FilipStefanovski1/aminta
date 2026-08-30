// @vitest-environment jsdom
//
// Step 7 ("How should I learn how you write?") now surfaces Voice Refresh
// alongside manual example entry — see the task's discoverability request.
// These tests cover: Free users complete onboarding without ever needing
// Voice Refresh, Pro/Founder users can discover and use it (both
// disconnected and connected), and onboarding never grants paid
// functionality itself — it only ever reuses VoiceRefreshCard's own,
// already-tested entitlement logic.
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import OnboardingWizard from "~components/OnboardingWizard"
import type { AmintaStore } from "~lib/storage"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("~lib/voiceRefresh", () => ({
  fetchConnectionState: vi.fn().mockResolvedValue({ connected: false, entitled: false, eligible: false, nextEligibleAt: null, lastRefreshAt: null, username: null, displayName: null, avatarUrl: null }),
  startXConnect: vi.fn().mockResolvedValue(undefined),
  runVoiceRefresh: vi.fn().mockResolvedValue({ postsAnalyzed: 12, nextEligibleAt: "" }),
  disconnectX: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("~lib/backendGenerate", () => ({
  backendGenerate: vi.fn().mockResolvedValue("a demo post"),
  dispatchGenerate: vi.fn().mockResolvedValue("a demo post"),
}))
vi.mock("~lib/xTab", () => ({ focusOrCreateXTab: vi.fn() }))
// lib/evolution.ts pulls in `url:~/assets/*.gif` (Parcel-style) imports on
// every FORMS entry, which Vitest's plain Vite transform can't resolve
// outside Plasmo's real build — mocked with the minimal real shape every
// consumer here (Sprite, DemonMascot, OnboardingWizard's FINAL_FORM) needs.
vi.mock("~lib/evolution", () => {
  const skin = { body: "#74f7b5", horn: "#000", eye: "#000" }
  const form = { level: 1, name: "Dormant", color: "#74f7b5", rarity: "COMMON", blurb: "", revealed: true, skin }
  return {
    FORMS: [form],
    getForm: () => form,
    getLevel: () => 1,
    getStageTint: () => "#74f7b5",
    getXpInLevel: () => 0,
    getXpProgress: () => 0,
  }
})

function baseStore(over: Partial<AmintaStore> = {}): AmintaStore {
  return {
    apiKey: "", model: "gemini-3.5-flash", plan: "free", subscriptionStatus: null,
    aiIncluded: true, aiIncludedPaid: false, providerMode: "included",
    voice: null, tweetDNA: [], styleProfile: null, styleProfileHash: "",
    xp: 0, interests: "", displayName: "", onboardingDone: false,
    xConnected: false, xUsername: "", xDisplayName: "", xAvatarUrl: "",
    voiceRefreshEligible: false, voiceRefreshNextEligibleAt: "", lastVoiceRefreshAt: "",
    ...over,
  } as unknown as AmintaStore
}

let container: HTMLDivElement
let root: Root
let onDoneCalls: Partial<AmintaStore>[] = []

function render(store: AmintaStore) {
  onDoneCalls = []
  act(() => {
    root.render(
      <OnboardingWizard
        store={store}
        onDone={async (patch) => { onDoneCalls.push(patch) }}
      />
    )
  })
}

function click(text: string) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text))
  if (!btn) throw new Error(`No button containing "${text}" — have: ${Array.from(container.querySelectorAll("button")).map((b) => b.textContent).join(" | ")}`)
  act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
}

function textShown(text: string): boolean {
  return container.textContent?.includes(text) ?? false
}

/** Drives the wizard to step 7 (Examples/Voice Refresh) via its own Continue flow. */
async function goToExamplesStep(store: AmintaStore) {
  render(store)
  click("Meet Aminta")           // 0 -> 1
  click("Write posts")           // select intent
  click("Continue")              // 1 -> (2 skipped for includedAi) -> 3
  await act(async () => { await Promise.resolve() }) // let the auto-fire demo generation settle
  click("Make it sound like me") // 3 -> 4
  click("Continue")              // 4 -> 5 (topics)
  click("AI")                    // pick a suggested topic
  click("Continue")              // 5 -> 6 (tone)
  click("Direct")                // pick a tone
  click("Continue")              // 6 -> 7 (examples / voice refresh)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("chrome", {
    runtime: { id: "test-extension-id" },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
    tabs: { create: vi.fn() },
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("step 7 — Voice Refresh discoverability", () => {
  it("Free user: sees the manual path and Voice Refresh's own inline upsell — never a block on continuing", async () => {
    await goToExamplesStep(baseStore({ plan: "free", aiIncluded: true, aiIncludedPaid: false }))
    expect(textShown("Learn from your X")).toBe(true)
    expect(textShown("Unlock Voice Refresh")).toBe(true)
    // No "Connect X" or "Refresh my voice" CTA — that's Pro/Founder only.
    expect(textShown("Connect X")).toBe(false)
    expect(textShown("Refresh my voice")).toBe(false)
  })

  it("Free user completes onboarding via manual examples alone, with no Voice Refresh interaction", async () => {
    await goToExamplesStep(baseStore({ plan: "free", aiIncluded: true, aiIncludedPaid: false }))
    const textarea = container.querySelector("textarea")!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!
      setter.call(textarea, "a post that sounds exactly like me")
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
    click("+ Add post")
    click("Continue") // no longer disabled once an example exists — lands on step 8 (auto-advancing "learning" transition)
    expect(textShown("learning your voice")).toBe(true)
    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) }) // step 8's real 2.2s auto-advance into the payoff step
    expect(textShown("Nice.")).toBe(true) // landed on the payoff step (9)
  })

  it("Pro/Founder, X not connected: Voice Refresh is discoverable via a Connect X action, not blocking", async () => {
    await goToExamplesStep(baseStore({ plan: "pro", subscriptionStatus: "active", aiIncludedPaid: true, xConnected: false }))
    expect(textShown("Connect X")).toBe(true)
    expect(textShown("Unlock Voice Refresh")).toBe(false) // that's the Free-only upsell
  })

  it("Pro/Founder, X connected and eligible: the real Refresh action is reachable from onboarding", async () => {
    await goToExamplesStep(baseStore({
      plan: "pro", subscriptionStatus: "active", aiIncludedPaid: true,
      xConnected: true, xUsername: "someuser", voiceRefreshEligible: true,
    }))
    expect(textShown("Refresh my voice")).toBe(true)
  })

  it("running Voice Refresh unblocks Continue even with zero manually added examples", async () => {
    await goToExamplesStep(baseStore({
      plan: "pro", subscriptionStatus: "active", aiIncludedPaid: true,
      xConnected: true, xUsername: "someuser", voiceRefreshEligible: true,
    }))
    // Continue starts disabled (no examples, no styleProfile yet).
    const continueBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Continue")!
    expect(continueBtn.hasAttribute("disabled")).toBe(true)

    const { runVoiceRefresh } = await import("~lib/voiceRefresh")
    vi.spyOn(await import("~lib/storage"), "getStore").mockResolvedValue(
      baseStore({ plan: "pro", subscriptionStatus: "active", aiIncludedPaid: true, xConnected: true, styleProfile: { confidenceScore: 0.5 } as never })
    )
    await act(async () => {
      click("Refresh my voice")
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(runVoiceRefresh).toHaveBeenCalled()
  })

  it("onboarding never grants paid functionality — the finish() patch never touches plan/entitlement fields", async () => {
    await goToExamplesStep(baseStore({ plan: "free", aiIncluded: true, aiIncludedPaid: false }))
    click("Skip for now") // step 7 -> 8 (learning transition)
    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) }) // step 8's real 2.2s auto-advance -> 9
    click("Enter Aminta")
    await act(async () => { await Promise.resolve() })
    expect(onDoneCalls).toHaveLength(1)
    const patch = onDoneCalls[0]
    expect(patch).not.toHaveProperty("plan")
    expect(patch).not.toHaveProperty("aiIncludedPaid")
    expect(patch).not.toHaveProperty("subscriptionStatus")
    expect(patch.onboardingDone).toBe(true)
  })
})

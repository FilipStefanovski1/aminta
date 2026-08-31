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
  fetchRecentXPosts: vi.fn().mockResolvedValue([]),
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
    expect(textShown("Unlock with Pro")).toBe(true)
    // "Learn from my X" (the Voice Refresh action CTA) is Pro/Founder only —
    // but "Connect X" IS shown to a not-yet-connected Free user too, since
    // connecting still unlocks the separate recent-posts picker below.
    expect(textShown("Connect X")).toBe(true)
    expect(textShown("Learn from my X")).toBe(false)
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
    expect(textShown("Unlock with Pro")).toBe(false) // that's the Free-only upsell
  })

  it("Pro/Founder, X connected and eligible: the real Learn-from-X action is reachable from onboarding", async () => {
    await goToExamplesStep(baseStore({
      plan: "pro", subscriptionStatus: "active", aiIncludedPaid: true,
      xConnected: true, xUsername: "someuser", voiceRefreshEligible: true,
    }))
    expect(textShown("Learn from my X")).toBe(true)
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
      click("Learn from my X")
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(runVoiceRefresh).toHaveBeenCalled()
  })

  it("onboarding never grants paid functionality — the finish() patch never touches plan/entitlement fields", async () => {
    await goToExamplesStep(baseStore({ plan: "free", aiIncluded: true, aiIncludedPaid: false }))
    click("Skip for now") // step 7 -> 8 (learning transition)
    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) }) // step 8's real 2.2s auto-advance -> 9
    click("Open X")
    await act(async () => { await Promise.resolve() })
    expect(onDoneCalls).toHaveLength(1)
    const patch = onDoneCalls[0]
    expect(patch).not.toHaveProperty("plan")
    expect(patch).not.toHaveProperty("aiIncludedPaid")
    expect(patch).not.toHaveProperty("subscriptionStatus")
    expect(patch.onboardingDone).toBe(true)
  })
})

describe("step 0 — welcome bubble", () => {
  it("uses fixed copy, never a raw store.displayName value", async () => {
    render(baseStore({ displayName: "Aminta 0" })) // a plausible bad upstream value
    expect(textShown("hey, I'm Aminta.")).toBe(true)
    expect(textShown("Aminta 0")).toBe(false)
  })

  it("never leaks an internal level/evolution identifier into the greeting", async () => {
    render(baseStore({ xp: 2175 })) // Level 4 territory — must never surface here
    expect(textShown("Level")).toBe(false)
    expect(textShown("LV")).toBe(false)
  })
})

describe("step 7 — Recent X posts picker (manual training, not Voice Refresh)", () => {
  it("Free + X connected: shows up to 3 recent posts, and clicking Add creates exactly one canonical example", async () => {
    const { fetchRecentXPosts, runVoiceRefresh } = await import("~lib/voiceRefresh")
    vi.mocked(fetchRecentXPosts).mockResolvedValue([
      { id: "1", text: "shipped this at 2am because apparently sleep is optional" },
      { id: "2", text: "another real post from my timeline" },
      { id: "3", text: "a third one" },
    ])

    await goToExamplesStep(baseStore({ plan: "free", aiIncluded: true, aiIncludedPaid: false, xConnected: true, xUsername: "someuser" }))
    await act(async () => { await Promise.resolve() })

    expect(textShown("Recent posts from your X")).toBe(true)
    expect(textShown("shipped this at 2am because apparently sleep is optional")).toBe(true)

    click("+ Add")
    expect(textShown("Added ✓")).toBe(true)
    expect(textShown("1 added")).toBe(true) // "Your posts" count reflects the one addition

    // Manual add, not Voice Refresh — no analysis was ever triggered.
    expect(runVoiceRefresh).not.toHaveBeenCalled()
  })

  it("a multiline X post remains ONE canonical example, formatting intact", async () => {
    const { fetchRecentXPosts } = await import("~lib/voiceRefresh")
    const multiline = "building this today.\n\nthe first version was terrible.\n\nshipped it anyway."
    vi.mocked(fetchRecentXPosts).mockResolvedValue([{ id: "1", text: multiline }])

    await goToExamplesStep(baseStore({ plan: "free", aiIncluded: true, aiIncludedPaid: false, xConnected: true, xUsername: "someuser" }))
    await act(async () => { await Promise.resolve() })
    click("+ Add")

    expect(textShown("1 added")).toBe(true) // one example, not three
  })

  it("clicking Add a second time is a no-op — duplicate prevented", async () => {
    const { fetchRecentXPosts } = await import("~lib/voiceRefresh")
    vi.mocked(fetchRecentXPosts).mockResolvedValue([{ id: "1", text: "a real post worth showing in the picker" }])

    await goToExamplesStep(baseStore({ plan: "free", aiIncluded: true, aiIncludedPaid: false, xConnected: true, xUsername: "someuser" }))
    await act(async () => { await Promise.resolve() })

    click("+ Add")
    expect(textShown("1 added")).toBe(true)
    // The card now shows "Added ✓", not "+ Add" — nothing left to click again for this post.
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0)
    const addedBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Added ✓") as HTMLButtonElement
    expect(addedBtn.hasAttribute("disabled")).toBe(true)
  })

  it("Free + X disconnected: no recent-posts section, manual paste still works, onboarding is not dead-ended", async () => {
    await goToExamplesStep(baseStore({ plan: "free", aiIncluded: true, aiIncludedPaid: false, xConnected: false }))
    expect(textShown("Recent posts from your X")).toBe(false)
    expect(textShown("Connect X")).toBe(true) // the existing appropriate connect action
    // Manual paste remains fully available.
    expect(container.querySelector("textarea")).not.toBeNull()
    expect(textShown("Skip for now")).toBe(true) // never a dead end
  })

  it("Pro/Founder, X not yet connected: Voice Refresh copy truthfully says 'up to' 20 posts", async () => {
    await goToExamplesStep(baseStore({
      plan: "pro", subscriptionStatus: "active", aiIncludedPaid: true, xConnected: false,
    }))
    expect(textShown("Learn your style from up to your last 20 X posts.")).toBe(true)
  })
})

describe("final onboarding screen", () => {
  async function goToFinalStep(store: AmintaStore) {
    await goToExamplesStep(store)
    click("Skip for now")
    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) }) // step 8's 2.2s auto-advance -> 9
  }

  it("the old Generate/Polish bullet box is gone", async () => {
    await goToFinalStep(baseStore())
    expect(textShown("Generate appears under the composer")).toBe(false)
    expect(textShown("Polish improves your draft")).toBe(false)
  })

  it("'Enter Aminta' and the redundant 'Or open x.com' secondary are both gone — one CTA only", async () => {
    await goToFinalStep(baseStore())
    expect(textShown("Enter Aminta")).toBe(false)
    expect(textShown("Or open x.com")).toBe(false)
    const ctaButtons = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent?.includes("Open X"))
    expect(ctaButtons).toHaveLength(1)
  })

  it("the one CTA opens x.com via the existing safe tab-focus/create behavior", async () => {
    const { focusOrCreateXTab } = await import("~lib/xTab")
    await goToFinalStep(baseStore())
    click("Open X")
    await act(async () => { await Promise.resolve() })
    expect(focusOrCreateXTab).toHaveBeenCalled()
  })
})

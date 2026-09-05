// @vitest-environment jsdom
//
// Train's "About you" section — the post-onboarding home for Personal
// Context. Covers the three things that actually matter here: it edits the
// SAME canonical voice.personalContext field onboarding writes (never a
// second copy), it round-trips an existing value instead of wiping it, and
// nothing about viewing/editing/saving it touches credits or fires a
// generation.
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import VoiceProfileForm from "~components/VoiceProfileForm"
import { ACCOUNT_SCOPED_KEYS, type AmintaStore, type VoiceProfile } from "~lib/storage"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Voice Refresh / style extraction are separate systems with their own
// tests — stubbed so this file only exercises the About-you field.
vi.mock("~lib/voiceRefresh", () => ({
  fetchConnectionState: vi.fn().mockResolvedValue({ connected: false, entitled: false, eligible: false, nextEligibleAt: null, lastRefreshAt: null, username: null, displayName: null, avatarUrl: null }),
  startXConnect: vi.fn(),
  runVoiceRefresh: vi.fn(),
  disconnectX: vi.fn(),
  fetchRecentXPosts: vi.fn().mockResolvedValue([]),
}))
vi.mock("~lib/styleProfile", () => ({ getOrBuildStyleProfile: vi.fn().mockResolvedValue(null) }))
vi.mock("~lib/evolution", () => ({
  getStageTint: () => "#74f7b5",
  getForm: () => ({ level: 1, name: "Dormant", color: "#74f7b5", rarity: "COMMON", blurb: "", revealed: true, skin: { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" } }),
  getLevel: () => 1,
  FORMS: [{ level: 1, name: "Dormant", color: "#74f7b5", rarity: "COMMON", blurb: "", revealed: true, skin: { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" } }],
}))

function baseStore(over: Partial<AmintaStore> = {}): AmintaStore {
  return { xp: 0, plan: "free", aiIncluded: true, aiIncludedPaid: false, styleProfile: null, tweetDNA: [], ...over } as unknown as AmintaStore
}

function baseVoice(over: Partial<VoiceProfile> = {}): VoiceProfile {
  return { niche: "AI", tone: "Direct", examples: "", voiceStyle: "Direct", voiceInspiration: "", customRules: "", ...over }
}

let container: HTMLDivElement
let root: Root
let saved: VoiceProfile[] = []

function render(initial: VoiceProfile | null, store = baseStore()) {
  saved = []
  act(() => {
    root.render(
      <VoiceProfileForm store={store} initial={initial} onSave={(v) => { saved.push(v) }} />
    )
  })
}

/** The About-you textarea, found by its accessible label. */
function aboutField(): HTMLTextAreaElement {
  const el = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="About you"]')
  if (!el) throw new Error("About you field not rendered")
  return el
}

function typeInto(textarea: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function click(text: string) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text))
  if (!btn) throw new Error(`No button containing "${text}"`)
  act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("chrome", {
    runtime: { id: "test-extension-id" },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("Train — About you (Personal Context)", () => {
  it("renders the section with the shared field, mirroring onboarding", () => {
    render(baseVoice())
    expect(container.textContent).toContain("About you")
    expect(aboutField()).toBeTruthy()
    expect(container.textContent).toContain("Help me answer")
  })

  it("shows the already-saved value so it can be viewed and edited, not re-entered", () => {
    render(baseVoice({ personalContext: "I run a design studio and post about client work." }))
    expect(aboutField().value).toBe("I run a design studio and post about client work.")
  })

  it("saving writes to the SAME canonical voice.personalContext field onboarding uses", async () => {
    render(baseVoice())
    typeInto(aboutField(), "I'm a researcher working on protein folding models.")
    await act(async () => { click("Save"); await Promise.resolve() })
    expect(saved).toHaveLength(1)
    expect(saved[0].personalContext).toBe("I'm a researcher working on protein folding models.")
  })

  it("editing existing text replaces it, and clearing it saves an empty value (removal works)", async () => {
    render(baseVoice({ personalContext: "old background" }))
    typeInto(aboutField(), "")
    await act(async () => { click("Save"); await Promise.resolve() })
    expect(saved[0].personalContext).toBe("")
  })

  it("adding more information preserves the rest of the voice profile untouched", async () => {
    render(baseVoice({ niche: "AI, Startups", customRules: "no hashtags", personalContext: "I build tools." }))
    typeInto(aboutField(), "I build tools. I also run a community.")
    await act(async () => { click("Save"); await Promise.resolve() })
    expect(saved[0]).toMatchObject({
      niche: "AI, Startups",
      customRules: "no hashtags",
      personalContext: "I build tools. I also run a community.",
    })
  })

  it("a legacy profile with no personalContext key renders an empty field, never 'undefined'", () => {
    const legacy = baseVoice()
    delete (legacy as Partial<VoiceProfile>).personalContext
    render(legacy)
    expect(aboutField().value).toBe("")
  })

  it("editing it costs nothing — no generation call and no credit field is ever written", async () => {
    const { getOrBuildStyleProfile } = await import("~lib/styleProfile")
    render(baseVoice())
    typeInto(aboutField(), "background text")
    click("Help me answer")
    await act(async () => { click("Save"); await Promise.resolve() })

    // No model call of any kind was made for the field, the helper prompt,
    // or the save.
    expect(getOrBuildStyleProfile).not.toHaveBeenCalled()
    // onSave only ever carries voice fields — never a credits/plan field.
    const keys = Object.keys(saved[0])
    expect(keys).not.toContain("creditsBalance")
    expect(keys).not.toContain("creditsAllowance")
    expect(keys).not.toContain("plan")
  })

  it("the helper prompt is local text — opening it makes no network/model call", () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    render(baseVoice())
    click("Help me answer")
    expect(container.textContent).toContain("Ask me questions one at a time")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("microphone inside the real field component", () => {
  class FakeRecognition {
    static last: FakeRecognition | null = null
    continuous = false; interimResults = false; lang = ""; stopped = false
    onresult: ((e: unknown) => void) | null = null
    onerror: ((e: { error?: string }) => void) | null = null
    onend: (() => void) | null = null
    constructor() { FakeRecognition.last = this }
    start() {}
    stop() { this.stopped = true; this.onend?.() }
    emit(transcript: string, isFinal: boolean) {
      this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal, 0: { transcript } } } })
    }
  }

  beforeEach(() => {
    ;(window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition
  })
  afterEach(() => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  })

  it("speaking appends to text already in the field and can then be edited by hand", async () => {
    render(baseVoice({ personalContext: "I'm a founder." }))
    click("Speak")
    act(() => FakeRecognition.last!.emit("I'm building an AI writing companion.", true))
    expect(aboutField().value).toBe("I'm a founder. I'm building an AI writing companion.")

    // Still a normal editable textarea afterwards.
    typeInto(aboutField(), "I'm a founder. I'm building an AI writing companion. Edited by hand.")
    await act(async () => { click("Save"); await Promise.resolve() })
    expect(saved[0].personalContext).toBe("I'm a founder. I'm building an AI writing companion. Edited by hand.")
  })

  it("shows a listening state and can be stopped by the user", () => {
    render(baseVoice())
    click("Speak")
    expect(container.textContent).toContain("Listening")
    click("Stop")
    expect(FakeRecognition.last!.stopped).toBe(true)
    expect(container.textContent).not.toContain("Listening")
  })

  it("transcription spends no Aminta credits — it never calls a generation path", async () => {
    const { getOrBuildStyleProfile } = await import("~lib/styleProfile")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    render(baseVoice())
    click("Speak")
    act(() => FakeRecognition.last!.emit("spoken background", true))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getOrBuildStyleProfile).not.toHaveBeenCalled()
  })
})

describe("account isolation", () => {
  it("personal context lives inside `voice`, which is account-scoped and cleared on account switch", () => {
    // voice.personalContext inherits the isolation the whole voice profile
    // already has — it is NOT a separate top-level store key that could be
    // missed by clearAccountScopedState().
    expect(ACCOUNT_SCOPED_KEYS).toContain("voice")
  })
})

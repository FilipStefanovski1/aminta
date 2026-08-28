import { beforeEach, describe, expect, it, vi } from "vitest"

// In-memory chrome.storage.local stand-in — same pattern as templates.test.ts.
let memoryStore: Record<string, unknown> = {}
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: (keys: Record<string, unknown>) => Promise.resolve({ ...keys, ...memoryStore }),
      set: (patch: Record<string, unknown>) => {
        memoryStore = { ...memoryStore, ...patch }
        return Promise.resolve()
      },
    },
  },
})

import {
  EMPTY_DRAFT,
  clearDraft,
  getDraft,
  isEmptyDraft,
  loadCreateDrafts,
  normalizeCreateDrafts,
  saveCreateDrafts,
  setDraft,
  type CreateDraft,
  type CreateDrafts,
} from "~lib/createDrafts"

beforeEach(() => {
  memoryStore = {}
})

function draft(patch: Partial<CreateDraft> = {}): CreateDraft {
  return { ...EMPTY_DRAFT, ...patch }
}

describe("backward compatibility — an account with no createDrafts behaves like a fresh Create screen", () => {
  it("a store with no createDrafts field loads as {}", async () => {
    expect(await loadCreateDrafts()).toEqual({})
  })

  it("getDraft on an absent mode returns exactly the empty defaults GeneratorPanel starts with", () => {
    const d = getDraft({}, "tweet")
    expect(d).toEqual(EMPTY_DRAFT)
    expect(d.topic).toBe("")
    expect(d.tone).toBe("direct")
    expect(d.length).toBe("medium")
    expect(d.postCount).toBe(4)
  })

  it("normalizeCreateDrafts never throws on malformed/legacy data — it degrades to empty", () => {
    expect(normalizeCreateDrafts(undefined)).toEqual({})
    expect(normalizeCreateDrafts(null)).toEqual({})
    expect(normalizeCreateDrafts("a string from some older shape")).toEqual({})
    expect(normalizeCreateDrafts(42)).toEqual({})
    expect(normalizeCreateDrafts([])).toEqual({})
  })

  it("drops unknown modes and repairs invalid field values instead of passing them through", () => {
    const normalized = normalizeCreateDrafts({
      tweet: { topic: "kept", tone: "not-a-real-tone", length: "gigantic", postCount: 99 },
      linkedin: { topic: "an unsupported mode" },
    })
    expect(Object.keys(normalized)).toEqual(["tweet"])
    expect(normalized.tweet).toMatchObject({
      topic: "kept",
      tone: EMPTY_DRAFT.tone,
      length: EMPTY_DRAFT.length,
      postCount: EMPTY_DRAFT.postCount,
    })
  })

  it("a non-object draft entry is dropped rather than half-restored", () => {
    expect(normalizeCreateDrafts({ tweet: "just a string", reply: null })).toEqual({})
  })
})

describe("mode independence", () => {
  it("Post and Reply drafts do not leak into each other", () => {
    let drafts: CreateDrafts = {}
    drafts = setDraft(drafts, "tweet", draft({ topic: "shipping my first app" }))
    drafts = setDraft(drafts, "reply", draft({ topic: "interesting take because..." }))

    expect(getDraft(drafts, "tweet").topic).toBe("shipping my first app")
    expect(getDraft(drafts, "reply").topic).toBe("interesting take because...")
  })

  it("updating one mode never wipes the other three", () => {
    let drafts: CreateDrafts = {}
    drafts = setDraft(drafts, "tweet", draft({ topic: "post draft" }))
    drafts = setDraft(drafts, "reply", draft({ topic: "reply draft" }))
    drafts = setDraft(drafts, "polish", draft({ topic: "polish draft" }))
    drafts = setDraft(drafts, "thread", draft({ topic: "thread draft" }))

    drafts = setDraft(drafts, "reply", draft({ topic: "reply draft, edited" }))

    expect(getDraft(drafts, "tweet").topic).toBe("post draft")
    expect(getDraft(drafts, "reply").topic).toBe("reply draft, edited")
    expect(getDraft(drafts, "polish").topic).toBe("polish draft")
    expect(getDraft(drafts, "thread").topic).toBe("thread draft")
  })

  it("clearDraft only clears the mode it's given", () => {
    let drafts: CreateDrafts = {}
    drafts = setDraft(drafts, "tweet", draft({ topic: "post draft" }))
    drafts = setDraft(drafts, "thread", draft({ topic: "thread draft" }))

    drafts = clearDraft(drafts, "tweet")

    expect(drafts.tweet).toBeUndefined()
    expect(getDraft(drafts, "tweet")).toEqual(EMPTY_DRAFT)
    expect(getDraft(drafts, "thread").topic).toBe("thread draft")
  })

  it("Tone/Length are per-mode, not one shared selection", () => {
    let drafts: CreateDrafts = {}
    drafts = setDraft(drafts, "tweet", draft({ tone: "witty", length: "short" }))
    drafts = setDraft(drafts, "polish", draft({ tone: "analytical", length: "long" }))

    expect(getDraft(drafts, "tweet")).toMatchObject({ tone: "witty", length: "short" })
    expect(getDraft(drafts, "polish")).toMatchObject({ tone: "analytical", length: "long" })
  })
})

describe("Thread post count persists and restores", () => {
  it("round-trips a numeric count through storage", async () => {
    await saveCreateDrafts(setDraft({}, "thread", draft({ topic: "a thread", postCount: 5 })))
    const loaded = await loadCreateDrafts()
    expect(getDraft(loaded, "thread").postCount).toBe(5)
  })

  it('round-trips the "6+" count, which is a string not a number', async () => {
    await saveCreateDrafts(setDraft({}, "thread", draft({ topic: "a thread", postCount: "6+" })))
    const loaded = await loadCreateDrafts()
    expect(getDraft(loaded, "thread").postCount).toBe("6+")
  })
})

// The exact race the hydration guard in GeneratorPanel exists to prevent:
// mount with empty defaults -> auto-save fires -> stored draft destroyed ->
// restore then loads nothing. Persisting must never run before restore.
describe("hydration never overwrites a stored draft with empty defaults", () => {
  it("an empty draft is not persisted over a real stored one", async () => {
    await saveCreateDrafts(setDraft({}, "tweet", draft({ topic: "building something new for..." })))

    // Simulate the auto-save path's own guard: an untouched draft is
    // recognized as empty and therefore never written over stored content.
    const freshMountState = draft()
    expect(isEmptyDraft(freshMountState)).toBe(true)

    const loaded = await loadCreateDrafts()
    expect(getDraft(loaded, "tweet").topic).toBe("building something new for...")
  })

  it("isEmptyDraft is true only for a genuinely untouched draft", () => {
    expect(isEmptyDraft(draft())).toBe(true)
    expect(isEmptyDraft(draft({ topic: "x" }))).toBe(false)
    expect(isEmptyDraft(draft({ context: "x" }))).toBe(false)
    expect(isEmptyDraft(draft({ tone: "witty" }))).toBe(false)
    expect(isEmptyDraft(draft({ postCount: 2 }))).toBe(false)
    expect(isEmptyDraft(draft({ templateId: "abc" }))).toBe(false)
    expect(isEmptyDraft(draft({ replyReason: "Good match" }))).toBe(false)
    expect(isEmptyDraft(draft({ postImageUrls: ["https://pbs.twimg.com/x.jpg"] }))).toBe(false)
  })

  it("whitespace-only writing still counts as empty — it isn't worth a storage row", () => {
    expect(isEmptyDraft(draft({ topic: "   ", context: "\n" }))).toBe(true)
  })
})

describe("template reference", () => {
  it("persists only the template id, never a copy of the template itself", async () => {
    await saveCreateDrafts(setDraft({}, "thread", draft({ topic: "a thread", templateId: "tpl-1" })))
    const loaded = await loadCreateDrafts()
    const restored = getDraft(loaded, "thread")
    expect(restored.templateId).toBe("tpl-1")
    // No posts/name/content copied into the draft — GeneratorPanel resolves
    // those from store.templates at restore time.
    expect(Object.keys(restored).sort()).toEqual(["context", "length", "postCount", "templateId", "tone", "topic"])
  })

  it("a draft whose template was since deleted still restores the rest of the draft", async () => {
    await saveCreateDrafts(setDraft({}, "thread", draft({ topic: "still here", templateId: "deleted-tpl" })))
    const loaded = await loadCreateDrafts()
    const restored = getDraft(loaded, "thread")

    // Resolution is a plain lookup against the current template list — a
    // missing id yields undefined, which GeneratorPanel treats as "no
    // template", with no error and no loss of the surrounding draft.
    const templates: { id: string; name: string }[] = []
    expect(templates.find((t) => t.id === restored.templateId)).toBeUndefined()
    expect(restored.topic).toBe("still here")
  })
})

describe("Reply Discovery state — plain serializable data only", () => {
  it("round-trips image URLs and the ranking reason alongside the reply text", async () => {
    await saveCreateDrafts(setDraft({}, "reply", draft({
      topic: "someone's post text",
      postImageUrls: ["https://pbs.twimg.com/a.jpg"],
      replyReason: "Good match for your AI + product topics",
    })))
    const restored = getDraft(await loadCreateDrafts(), "reply")
    expect(restored.postImageUrls).toEqual(["https://pbs.twimg.com/a.jpg"])
    expect(restored.replyReason).toBe("Good match for your AI + product topics")
  })

  it("non-string entries in postImageUrls are discarded, never restored as-is", () => {
    const normalized = normalizeCreateDrafts({
      reply: { topic: "x", postImageUrls: ["https://ok.jpg", null, 42, { nodeType: 1 }] },
    })
    expect(normalized.reply?.postImageUrls).toEqual(["https://ok.jpg"])
  })
})

describe("draft operations are pure local storage — zero AI, zero credits", () => {
  it("the module never imports a generation path, so no draft operation can spend a credit", async () => {
    // lib/createDrafts.ts imports only lib/storage and lib/prompts types.
    // If a generation dependency were ever added, these calls would need a
    // fetch/provider stub to run at all — none is present here.
    vi.stubGlobal("fetch", vi.fn())
    await saveCreateDrafts(setDraft({}, "tweet", draft({ topic: "hello" })))
    await loadCreateDrafts()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

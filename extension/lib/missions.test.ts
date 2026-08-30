// Daily goals redesign — three CONFIRMED-PUBLISH flags (post/reply/polish),
// not "generate 3x" or "teach me your voice." Training is intentionally not
// a daily goal anymore (see getMissionProgress/incrementMissionPublished).
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

import { getStore } from "~lib/storage"
import type { AmintaStore } from "~lib/storage"
import {
  getMissionProgress,
  incrementMissionPublished,
  sampleCount,
  tryCompleteDailyMissions,
} from "~lib/missions"
import { serializeExamples } from "~lib/trainingExamples"
import { todayLocal, yesterdayLocal } from "~lib/dates"

beforeEach(() => {
  memoryStore = {}
})

describe("daily goals are per-mode confirmed-publish flags", () => {
  it("starts with nothing done today", async () => {
    const store = await getStore()
    const progress = getMissionProgress(store)
    expect(progress).toEqual({ postDone: false, replyDone: false, polishDone: false })
  })

  it("a confirmed tweet publish marks only the post goal", async () => {
    await incrementMissionPublished("tweet")
    const progress = getMissionProgress(await getStore())
    expect(progress).toEqual({ postDone: true, replyDone: false, polishDone: false })
  })

  it("a confirmed reply publish marks only the reply goal", async () => {
    await incrementMissionPublished("reply")
    const progress = getMissionProgress(await getStore())
    expect(progress).toEqual({ postDone: false, replyDone: true, polishDone: false })
  })

  it("a confirmed polish publish marks only the polish goal", async () => {
    await incrementMissionPublished("polish")
    const progress = getMissionProgress(await getStore())
    expect(progress).toEqual({ postDone: false, replyDone: false, polishDone: true })
  })

  it("publishing the same mode twice in one day does not un-complete or double-count", async () => {
    await incrementMissionPublished("tweet")
    await incrementMissionPublished("tweet")
    const progress = getMissionProgress(await getStore())
    expect(progress.postDone).toBe(true)
    // Not gameable into "more" — it's a boolean, not a counter that could
    // ever imply a second tweet publish is worth extra credit.
  })

  it("goals accumulate independently across separate publishes today", async () => {
    await incrementMissionPublished("tweet")
    await incrementMissionPublished("reply")
    const progress = getMissionProgress(await getStore())
    expect(progress).toEqual({ postDone: true, replyDone: true, polishDone: false })
  })

  it("goals reset when missionDate is not today (a new calendar day)", async () => {
    await incrementMissionPublished("tweet")
    // Simulate a stale record from yesterday by rewriting missionDate directly.
    memoryStore.missionDate = yesterdayLocal()
    const progress = getMissionProgress(await getStore())
    expect(progress).toEqual({ postDone: false, replyDone: false, polishDone: false })
  })

  it("today's goals are unaffected by yesterday's completed state once the day rolls over", async () => {
    await incrementMissionPublished("tweet")
    expect(memoryStore.missionDate).toBe(todayLocal())
    // A fresh publish today after a rollover starts from a clean slate —
    // incrementMissionPublished itself resets stale missionModes when
    // missionDate isn't today.
    memoryStore.missionDate = yesterdayLocal()
    await incrementMissionPublished("polish")
    const progress = getMissionProgress(await getStore())
    expect(progress).toEqual({ postDone: false, replyDone: false, polishDone: true })
  })
})

describe("daily +150 XP requires all three goals, not training", () => {
  it("does not award with only post+reply done", async () => {
    await incrementMissionPublished("tweet")
    await incrementMissionPublished("reply")
    const ok = await tryCompleteDailyMissions(await getStore())
    expect(ok).toBe(false)
  })

  it("awards once all three (post, reply, polish) are done", async () => {
    await incrementMissionPublished("tweet")
    await incrementMissionPublished("reply")
    await incrementMissionPublished("polish")
    const ok = await tryCompleteDailyMissions(await getStore())
    expect(ok).toBe(true)
  })

  it("never requires any training/voice-sample state", async () => {
    // No voice, no examples, no tweetDNA at all — training is genuinely
    // absent from this check now, unlike the old dnaTrained>=3 condition.
    await incrementMissionPublished("tweet")
    await incrementMissionPublished("reply")
    await incrementMissionPublished("polish")
    const store = await getStore()
    expect(store.voice).toBeNull()
    expect(store.tweetDNA).toEqual([])
    const ok = await tryCompleteDailyMissions(store)
    expect(ok).toBe(true)
  })
})

describe("sampleCount — voice examples + DNA", () => {
  it("counts real examples correctly, not the fixed 1 a raw newline-split used to always produce", () => {
    // voice.examples is JSON-encoded (lib/trainingExamples.ts) and never
    // contains a literal newline, so the old `.split("\n")` implementation
    // always saw exactly one "line" no matter how many examples existed —
    // silently capping this at 1 for every account with real training data.
    const store = { voice: { examples: serializeExamples(["a", "b", "c"]) }, tweetDNA: [] } as unknown as AmintaStore
    expect(sampleCount(store)).toBe(3)
  })

  it("a single multi-paragraph example still counts as exactly 1 sample", () => {
    const store = { voice: { examples: serializeExamples(["one\n\ntwo\n\nthree"]) }, tweetDNA: [] } as unknown as AmintaStore
    expect(sampleCount(store)).toBe(1)
  })

  it("adds tweetDNA on top of manual examples", () => {
    const store = { voice: { examples: serializeExamples(["a", "b"]) }, tweetDNA: ["dna1", "dna2", "dna3"] } as unknown as AmintaStore
    expect(sampleCount(store)).toBe(5)
  })

  it("no voice profile, no DNA: 0", () => {
    const store = { voice: null, tweetDNA: [] } as unknown as AmintaStore
    expect(sampleCount(store)).toBe(0)
  })
})

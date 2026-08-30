import { describe, expect, it } from "vitest"
import { normalizeTags, rankMemesByTags, type MemeRecord } from "~lib/memeLibrary"

function meme(over: Partial<MemeRecord>): MemeRecord {
  return { id: "id", tags: [], blob: new Blob(), createdAt: 0, ...over }
}

describe("normalizeTags", () => {
  it("splits a comma string, trims, lowercases, and dedupes", () => {
    expect(normalizeTags("Funny, Funny , cats,  ")).toEqual(["funny", "cats"])
  })

  it("accepts an array input the same way", () => {
    expect(normalizeTags(["Sad", "sad", " reaction "])).toEqual(["sad", "reaction"])
  })

  it("handles undefined/empty as no tags", () => {
    expect(normalizeTags(undefined)).toEqual([])
    expect(normalizeTags("")).toEqual([])
  })
})

describe("rankMemesByTags — zero-AI local prefilter", () => {
  it("ranks a meme whose tag appears in the context text first", () => {
    const cats = meme({ id: "cats", tags: ["cats", "funny"], createdAt: 1 })
    const sad = meme({ id: "sad", tags: ["sad"], createdAt: 2 })
    const ranked = rankMemesByTags([sad, cats], "just adopted two cats today")
    expect(ranked[0].id).toBe("cats")
  })

  it("also matches on the meme's name", () => {
    const drake = meme({ id: "drake", name: "Drake meme", tags: [], createdAt: 1 })
    const other = meme({ id: "other", tags: [], createdAt: 2 })
    const ranked = rankMemesByTags([other, drake], "posting the drake meme again")
    expect(ranked[0].id).toBe("drake")
  })

  it("falls back to newest-first when nothing matches", () => {
    const older = meme({ id: "older", tags: ["x"], createdAt: 1 })
    const newer = meme({ id: "newer", tags: ["y"], createdAt: 2 })
    const ranked = rankMemesByTags([older, newer], "totally unrelated context")
    expect(ranked[0].id).toBe("newer")
  })

  it("never mutates the input array", () => {
    const list = [meme({ id: "a", createdAt: 1 }), meme({ id: "b", createdAt: 2 })]
    const copy = [...list]
    rankMemesByTags(list, "anything")
    expect(list).toEqual(copy)
  })

  it("is a pure, zero-cost operation — no network/model calls, deterministic for the same input", () => {
    const memes = [meme({ id: "a", tags: ["x"], createdAt: 1 }), meme({ id: "b", tags: ["y"], createdAt: 2 })]
    const r1 = rankMemesByTags(memes, "x context")
    const r2 = rankMemesByTags(memes, "x context")
    expect(r1.map((m) => m.id)).toEqual(r2.map((m) => m.id))
  })
})

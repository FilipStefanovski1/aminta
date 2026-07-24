import { describe, expect, it } from "vitest"

import { dedupeAndCapImages, isTweetMediaUrl, normalizeImageUrl, processTweetImageUrls } from "~lib/tweetMedia"

describe("isTweetMediaUrl", () => {
  it("accepts pbs.twimg.com post media", () => {
    expect(isTweetMediaUrl("https://pbs.twimg.com/media/ABC123?format=jpg&name=small")).toBe(true)
  })

  it("rejects avatars (profile_images path)", () => {
    expect(isTweetMediaUrl("https://pbs.twimg.com/profile_images/999/avatar.jpg")).toBe(false)
  })

  it("rejects emoji/UI hosts entirely", () => {
    expect(isTweetMediaUrl("https://abs-0.twimg.com/emoji/v2/72x72/1f600.png")).toBe(false)
  })

  it("rejects unrelated hosts", () => {
    expect(isTweetMediaUrl("https://example.com/media/photo.jpg")).toBe(false)
  })
})

describe("normalizeImageUrl", () => {
  it("forces name=large, preserving other params", () => {
    const out = normalizeImageUrl("https://pbs.twimg.com/media/ABC123?format=jpg&name=small")
    const u = new URL(out)
    expect(u.searchParams.get("name")).toBe("large")
    expect(u.searchParams.get("format")).toBe("jpg")
  })

  it("adds name=large when no query string exists", () => {
    const out = normalizeImageUrl("https://pbs.twimg.com/media/ABC123")
    expect(new URL(out).searchParams.get("name")).toBe("large")
  })

  it("returns the input unchanged if it isn't a parseable URL", () => {
    expect(normalizeImageUrl("not a url")).toBe("not a url")
  })
})

describe("dedupeAndCapImages", () => {
  it("preserves first-seen order", () => {
    expect(dedupeAndCapImages(["a", "b", "c"])).toEqual(["a", "b", "c"])
  })

  it("removes duplicate URLs, keeping the first occurrence", () => {
    expect(dedupeAndCapImages(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"])
  })

  it("caps at 4 by default", () => {
    expect(dedupeAndCapImages(["a", "b", "c", "d", "e", "f"])).toEqual(["a", "b", "c", "d"])
  })

  it("caps at a custom max", () => {
    expect(dedupeAndCapImages(["a", "b", "c"], 2)).toEqual(["a", "b"])
  })
})

describe("processTweetImageUrls — full pipeline", () => {
  it("filters avatars, normalizes quality, dedupes, and caps at 4", () => {
    const raw = [
      "https://pbs.twimg.com/profile_images/1/avatar.jpg", // avatar — excluded
      "https://pbs.twimg.com/media/IMG1?format=jpg&name=small",
      "https://pbs.twimg.com/media/IMG1?format=jpg&name=900x900", // same image, different size — dupe after normalize
      "https://pbs.twimg.com/media/IMG2?format=png&name=small",
      "https://pbs.twimg.com/media/IMG3?format=jpg&name=small",
      "https://pbs.twimg.com/media/IMG4?format=jpg&name=small",
      "https://pbs.twimg.com/media/IMG5?format=jpg&name=small", // 5th unique — beyond cap
      "https://abs-0.twimg.com/emoji/v2/72x72/1f600.png", // emoji — excluded
    ]
    const result = processTweetImageUrls(raw)

    expect(result).toHaveLength(4)
    expect(result.every((u) => u.includes("name=large"))).toBe(true)
    expect(result.some((u) => u.includes("profile_images"))).toBe(false)
    expect(result.some((u) => u.includes("emoji"))).toBe(false)
    expect(result.filter((u) => u.includes("IMG1"))).toHaveLength(1) // deduped
  })

  it("returns an empty array for a text-only post with no media", () => {
    expect(processTweetImageUrls([])).toEqual([])
  })

  it("returns an empty array when only avatars/emoji are present", () => {
    const raw = [
      "https://pbs.twimg.com/profile_images/1/avatar.jpg",
      "https://abs-0.twimg.com/emoji/v2/72x72/1f600.png",
    ]
    expect(processTweetImageUrls(raw)).toEqual([])
  })
})

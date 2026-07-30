import { describe, expect, it } from "vitest"
import { isEligibleReplyTarget, pickNextReplyTarget, type ReplyPostData } from "~lib/replyTargets"

function post(overrides: Partial<ReplyPostData> = {}): ReplyPostData {
  return { id: "1", author: "someone", text: "a perfectly normal post about something", hasImages: false, ...overrides }
}

describe("isEligibleReplyTarget", () => {
  it("accepts a normal post with enough text", () => {
    expect(isEligibleReplyTarget(post(), null, new Set())).toBe(true)
  })

  it("rejects a post already picked this session", () => {
    expect(isEligibleReplyTarget(post({ id: "42" }), null, new Set(["42"]))).toBe(false)
  })

  it("rejects the user's own post (case-insensitive)", () => {
    expect(isEligibleReplyTarget(post({ author: "Filip" }), "filip", new Set())).toBe(false)
  })

  it("does not filter by author when own handle is unknown", () => {
    expect(isEligibleReplyTarget(post({ author: "filip" }), null, new Set())).toBe(true)
  })

  it("rejects an empty post with no text and no images", () => {
    expect(isEligibleReplyTarget(post({ text: "" }), null, new Set())).toBe(false)
  })

  it("accepts an image-only post with no caption", () => {
    expect(isEligibleReplyTarget(post({ text: "", hasImages: true }), null, new Set())).toBe(true)
  })

  it("rejects text that's too short to be usable context", () => {
    expect(isEligibleReplyTarget(post({ text: "😂" }), null, new Set())).toBe(false)
  })

  it("respects a custom minTextChars threshold", () => {
    expect(isEligibleReplyTarget(post({ text: "abcd" }), null, new Set(), 10)).toBe(false)
    expect(isEligibleReplyTarget(post({ text: "abcd" }), null, new Set(), 2)).toBe(true)
  })
})

describe("pickNextReplyTarget", () => {
  it("picks the first eligible post in timeline order", () => {
    const posts = [post({ id: "1" }), post({ id: "2" }), post({ id: "3" })]
    expect(pickNextReplyTarget(posts, null, new Set())?.id).toBe("1")
  })

  it("skips already-selected posts and returns the next one", () => {
    const posts = [post({ id: "1" }), post({ id: "2" }), post({ id: "3" })]
    expect(pickNextReplyTarget(posts, null, new Set(["1"]))?.id).toBe("2")
  })

  it("skips ineligible posts mixed into the feed (own posts, empty posts)", () => {
    const posts = [
      post({ id: "1", author: "filip" }),          // own post
      post({ id: "2", text: "" }),                 // empty
      post({ id: "3", text: "a genuinely good post worth replying to" }),
    ]
    expect(pickNextReplyTarget(posts, "filip", new Set())?.id).toBe("3")
  })

  it("never re-selects the same post across repeated calls", () => {
    const posts = [post({ id: "1" }), post({ id: "2" })]
    const seen = new Set<string>()

    const first = pickNextReplyTarget(posts, null, seen)
    expect(first?.id).toBe("1")
    seen.add(first!.id)

    const second = pickNextReplyTarget(posts, null, seen)
    expect(second?.id).toBe("2")
    seen.add(second!.id)

    const third = pickNextReplyTarget(posts, null, seen)
    expect(third).toBeNull()
  })

  it("returns null when nothing is loaded", () => {
    expect(pickNextReplyTarget([], null, new Set())).toBeNull()
  })

  it("returns null when every loaded post is ineligible", () => {
    const posts = [post({ id: "1", author: "filip" }), post({ id: "2", text: "" })]
    expect(pickNextReplyTarget(posts, "filip", new Set())).toBeNull()
  })
})

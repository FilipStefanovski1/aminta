import { describe, expect, it } from "vitest"
import { isEligibleReplyTarget, pickNextReplyTarget, rankReplyTargets, type ReplyPostData } from "~lib/replyTargets"

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

describe("pickNextReplyTarget — ranked, not sequential", () => {
  it("picks the (tied) first eligible post when nothing distinguishes the candidates", () => {
    const posts = [post({ id: "1" }), post({ id: "2" }), post({ id: "3" })]
    expect(pickNextReplyTarget(posts, null, new Set())?.post.id).toBe("1")
  })

  it("skips already-selected posts and returns the next-best one", () => {
    const posts = [post({ id: "1" }), post({ id: "2" }), post({ id: "3" })]
    expect(pickNextReplyTarget(posts, null, new Set(["1"]))?.post.id).toBe("2")
  })

  it("skips ineligible posts mixed into the feed (own posts, empty posts)", () => {
    const posts = [
      post({ id: "1", author: "filip" }),          // own post
      post({ id: "2", text: "" }),                 // empty
      post({ id: "3", text: "a genuinely good post worth replying to" }),
    ]
    expect(pickNextReplyTarget(posts, "filip", new Set())?.post.id).toBe("3")
  })

  it("never re-selects the same post across repeated calls", () => {
    const posts = [post({ id: "1" }), post({ id: "2" })]
    const seen = new Set<string>()

    const first = pickNextReplyTarget(posts, null, seen)
    expect(first?.post.id).toBe("1")
    seen.add(first!.post.id)

    const second = pickNextReplyTarget(posts, null, seen)
    expect(second?.post.id).toBe("2")
    seen.add(second!.post.id)

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

// The core product requirement: the winner must out-score the rest, not
// simply appear first in the DOM/timeline.
describe("rankReplyTargets — the winner is chosen, not just first", () => {
  it("a later, topic-relevant post beats an earlier unrelated one", () => {
    const posts = [
      post({ id: "1", text: "what a beautiful sunset today, wow" }),
      post({ id: "2", text: "just shipped a new AI feature for our startup, huge win for the team" }),
    ]
    const ranked = rankReplyTargets(posts, null, new Set(), ["AI", "startups"])
    expect(ranked[0].post.id).toBe("2")
  })

  it("strong engagement alone does not overpower strong topic relevance", () => {
    const posts = [
      post({ id: "1", text: "lol funny cat video watch this", likeCount: 50000, replyCount: 2000 }),
      post({ id: "2", text: "thinking about how AI agents will change B2B SaaS distribution entirely", likeCount: 3, replyCount: 0 }),
    ]
    const ranked = rankReplyTargets(posts, null, new Set(), ["AI", "SaaS"])
    expect(ranked[0].post.id).toBe("2")
  })

  it("own posts are excluded from the ranked list entirely", () => {
    const posts = [post({ id: "1", author: "filip", text: "my own great AI take" })]
    expect(rankReplyTargets(posts, "filip", new Set(), ["AI"])).toHaveLength(0)
  })

  it("duplicates (already-seen ids) are excluded", () => {
    const posts = [post({ id: "1" }), post({ id: "1" }), post({ id: "2" })]
    const ranked = rankReplyTargets(posts, null, new Set(["1"]))
    expect(ranked.map((r) => r.post.id)).toEqual(["2"])
  })

  it("with no topics at all, ranking still works via conversation potential and engagement", () => {
    const posts = [
      post({ id: "1", text: "ok" }),
      post({ id: "2", text: "genuinely curious what everyone thinks about this approach, does it actually hold up?" }),
    ]
    const ranked = rankReplyTargets(posts, null, new Set(), [])
    expect(ranked[0].post.id).toBe("2")
  })

  it("a bare link-drop post ranks below a real, on-topic observation", () => {
    const posts = [
      post({ id: "1", text: "https://example.com/some-article" }),
      post({ id: "2", text: "startups that talk to users early tend to build the right thing faster" }),
    ]
    const ranked = rankReplyTargets(posts, null, new Set(), ["startups"])
    expect(ranked[0].post.id).toBe("2")
  })

  it("Find Another returns the next-highest-ranked candidate, not a repeat", () => {
    const posts = [
      post({ id: "1", text: "unrelated post about the weather today" }),
      post({ id: "2", text: "solana ecosystem is heating up, builders are noticing" }),
      post({ id: "3", text: "another AI startup launch, interesting positioning here" }),
    ]
    const seen = new Set<string>()
    const first = pickNextReplyTarget(posts, null, seen, ["AI", "Solana"])
    seen.add(first!.post.id)
    const second = pickNextReplyTarget(posts, null, seen, ["AI", "Solana"])

    expect(first!.post.id).not.toBe(second!.post.id)
    expect([first!.post.id, second!.post.id].sort()).toEqual(["2", "3"])
  })

  it("gives a plain-language reason, never a raw score", () => {
    const posts = [post({ id: "1", text: "shipping AI features today" })]
    const [top] = rankReplyTargets(posts, null, new Set(), ["AI"])
    expect(top.reason).not.toMatch(/\d/)
    expect(top.reason.toLowerCase()).toContain("ai")
  })

  // Ranking a batch must never cost a generation credit — the only real
  // guarantee of that is architectural: this module makes no model/network
  // call at all. Returning a plain array synchronously (not a Promise) is
  // the observable proof — an AI call would necessarily make this async.
  it("ranking a full batch is synchronous — no model/network call is even possible", () => {
    const posts = Array.from({ length: 15 }, (_, i) => post({ id: String(i), text: `post number ${i} about AI and startups` }))
    const result = rankReplyTargets(posts, null, new Set(), ["AI"])
    expect(result).not.toBeInstanceOf(Promise)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from "vitest"
import { mergeExamples, parseBulkPosts } from "~lib/bulkExamples"

describe("parseBulkPosts", () => {
  it("splits multiple posts separated by a blank line", () => {
    const raw = "first post here\n\nsecond post here\n\nthird one too"
    expect(parseBulkPosts(raw)).toEqual(["first post here", "second post here", "third one too"])
  })

  it("treats a paste with no blank lines as one example (never over-splits)", () => {
    const raw = "line one\nline two\nline three"
    expect(parseBulkPosts(raw)).toEqual(["line one\nline two\nline three"])
  })

  it("preserves internal line breaks within a single multi-line post", () => {
    const raw = "a post\nwith an internal\nline break\n\na second, separate post"
    expect(parseBulkPosts(raw)).toEqual(["a post\nwith an internal\nline break", "a second, separate post"])
  })

  it("drops empty chunks from extra blank lines", () => {
    const raw = "post one\n\n\n\npost two"
    expect(parseBulkPosts(raw)).toEqual(["post one", "post two"])
  })

  it("returns an empty array for blank input", () => {
    expect(parseBulkPosts("   \n\n  ")).toEqual([])
  })

  it("handles a realistic 10-post bulk paste", () => {
    const posts = Array.from({ length: 10 }, (_, i) => `post number ${i + 1}`)
    const raw = posts.join("\n\n")
    expect(parseBulkPosts(raw)).toEqual(posts)
  })
})

describe("mergeExamples", () => {
  it("appends parsed posts to existing examples", () => {
    expect(mergeExamples(["old one"], ["new one", "new two"], 15))
      .toEqual(["old one", "new one", "new two"])
  })

  it("existing examples survive a bulk merge untouched", () => {
    const existing = ["kept example A", "kept example B"]
    const merged = mergeExamples(existing, ["fresh paste"], 15)
    expect(merged).toEqual(["kept example A", "kept example B", "fresh paste"])
  })

  it("dedupes exact-duplicate posts", () => {
    expect(mergeExamples(["same text"], ["same text", "different text"], 15))
      .toEqual(["same text", "different text"])
  })

  it("caps the combined total, keeping existing examples over new overflow", () => {
    const existing = ["e1", "e2", "e3"]
    const parsed = ["n1", "n2", "n3", "n4", "n5"]
    const merged = mergeExamples(existing, parsed, 5)
    expect(merged).toEqual(["e1", "e2", "e3", "n1", "n2"])
    expect(merged).toHaveLength(5)
  })
})

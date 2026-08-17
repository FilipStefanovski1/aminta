// Corpus construction rules. Pure input -> output, so every rule that
// decides what teaches "how the user writes" is pinned here.
import { describe, it, expect } from "vitest"
import {
  buildCorpus, dedupeKey, hasMeaningfulOwnCommentary, isViableCorpus,
  needsMorePosts, proseOnly, shouldFetchSecondPage, MIN_CORPUS, SUFFICIENT_CORPUS, TARGET_CORPUS,
  type RawXPost,
} from "./filter"

const post = (id: string, text: string, extra: Partial<RawXPost> = {}): RawXPost =>
  ({ id, text, ...extra })

/** Long enough to clear the 40-char floor. */
const long = (s: string) => s.padEnd(60, " and more words here")

describe("exclusion rules", () => {
  it("drops reposts", () => {
    const r = buildCorpus([post("1", long("RT something"), { referencedTypes: ["retweeted"] })])
    expect(r.corpus).toHaveLength(0)
    expect(r.stats.retweets).toBe(1)
  })

  it("drops replies", () => {
    const r = buildCorpus([post("1", long("sure thing"), { referencedTypes: ["replied_to"] })])
    expect(r.corpus).toHaveLength(0)
    expect(r.stats.replies).toBe(1)
  })

  it("drops empty and link-only posts", () => {
    const r = buildCorpus([post("1", "https://example.com/a"), post("2", "   ")])
    expect(r.corpus).toHaveLength(0)
    expect(r.stats.linkOnly).toBe(2)
  })

  it("drops posts too short to carry style signal", () => {
    const r = buildCorpus([post("1", "gm"), post("2", "+1")])
    expect(r.corpus).toHaveLength(0)
    expect(r.stats.tooShort).toBe(2)
  })

  it("drops exact and near duplicates", () => {
    const text = long("shipping every single day")
    const r = buildCorpus([post("1", text), post("2", text), post("3", text.toUpperCase() + "!!!")])
    expect(r.corpus).toHaveLength(1)
    expect(r.stats.duplicates).toBe(2)
  })

  it("strips URLs and mentions from the stored text", () => {
    const r = buildCorpus([post("1", `@someone ${long("real thoughts about building")} https://x.com/a`)])
    expect(r.corpus[0].text).not.toContain("http")
    expect(r.corpus[0].text).not.toContain("@someone")
  })
})

describe("quote posts — the user's voice, not the quoted author's", () => {
  it("keeps a quote post with substantial own commentary", () => {
    const p = post("1", long("this is exactly the point people keep missing"), {
      referencedTypes: ["quoted"], quotedText: "short",
    })
    expect(hasMeaningfulOwnCommentary(p)).toBe(true)
    expect(buildCorpus([p]).corpus).toHaveLength(1)
  })

  it("drops a quote post that is mostly the quoted author", () => {
    const p = post("1", long("this"), {
      referencedTypes: ["quoted"],
      quotedText: "a very long passage written by somebody else entirely ".repeat(12),
    })
    const r = buildCorpus([p])
    expect(r.corpus).toHaveLength(0)
    expect(r.stats.quoteDominant).toBe(1)
  })

  it("treats a quote with no quoted text available as the user's own", () => {
    const p = post("1", long("my own take on this"), { referencedTypes: ["quoted"], quotedText: null })
    expect(hasMeaningfulOwnCommentary(p)).toBe(true)
  })
})

describe("corpus sizing", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => post(String(i), long(`distinct post number ${i}`)))

  it("caps at the 20-post target", () => {
    expect(buildCorpus(many(40)).corpus).toHaveLength(TARGET_CORPUS)
  })

  it("handles fewer than 20 useful posts without failing", () => {
    const r = buildCorpus(many(12))
    expect(r.corpus).toHaveLength(12)
    expect(isViableCorpus(r.corpus.length)).toBe(true)
  })

  it("treats a corpus below the minimum as not viable", () => {
    expect(isViableCorpus(MIN_CORPUS - 1)).toBe(false)
    expect(isViableCorpus(MIN_CORPUS)).toBe(true)
  })

  it("does not request a second paid page once the corpus is already strong", () => {
    expect(needsMorePosts(SUFFICIENT_CORPUS)).toBe(false)
    expect(needsMorePosts(SUFFICIENT_CORPUS - 1)).toBe(true)
  })

  it("is deterministic — same input, same corpus", () => {
    const input = many(30)
    expect(buildCorpus(input).corpus).toEqual(buildCorpus(input).corpus)
  })
})

describe("helpers", () => {
  it("proseOnly removes links and mentions", () => {
    expect(proseOnly("hey @bob look https://a.co now")).toBe("hey look now")
  })

  it("dedupeKey ignores case and punctuation", () => {
    expect(dedupeKey("Ship It!!!")).toBe(dedupeKey("ship it"))
  })
})

describe("stats stay non-sensitive", () => {
  it("reports counts only, never text", () => {
    const r = buildCorpus([post("1", long("a real post")), post("2", "gm")])
    expect(Object.values(r.stats).every((v) => typeof v === "number")).toBe(true)
  })
})

describe("second-page strategy — one paid request when the corpus is already good", () => {
  const MAX = 50
  const page = (n: number, useful: number) =>
    Array.from({ length: n }, (_, i) =>
      i < useful ? post(String(i), long(`useful distinct post ${i}`)) : post(`s${i}`, "gm"))

  it("25 fetched -> 18 useful -> exactly ONE X request", () => {
    const first = buildCorpus(page(25, 18), TARGET_CORPUS)
    expect(first.corpus).toHaveLength(18)
    expect(shouldFetchSecondPage(first.corpus.length, true, 25, MAX)).toBe(false)
  })

  it("25 fetched -> 12 useful -> a second request", () => {
    const first = buildCorpus(page(25, 12), TARGET_CORPUS)
    expect(first.corpus).toHaveLength(12)
    expect(shouldFetchSecondPage(first.corpus.length, true, 25, MAX)).toBe(true)
  })

  it("does not fetch again merely to close an 18 -> 20 gap", () => {
    // The explicit rule: short of target is fine, weak is not.
    expect(shouldFetchSecondPage(19, true, 25, MAX)).toBe(false)
    expect(shouldFetchSecondPage(15, true, 25, MAX)).toBe(false)
    expect(shouldFetchSecondPage(14, true, 25, MAX)).toBe(true)
  })

  it("never fetches again without a cursor", () => {
    expect(shouldFetchSecondPage(3, false, 25, MAX)).toBe(false)
  })

  it("respects the hard 50-post fetch cap", () => {
    expect(shouldFetchSecondPage(3, true, 50, MAX)).toBe(false)
    expect(shouldFetchSecondPage(3, true, 49, MAX)).toBe(true)
  })

  it("50 fetched -> 20+ useful -> only the top 20 are used", () => {
    const r = buildCorpus(page(50, 30), TARGET_CORPUS)
    expect(r.corpus).toHaveLength(20)
    expect(r.stats.used).toBe(20)
  })

  it("50 fetched -> 7 useful -> not viable, so the caller refunds", () => {
    const r = buildCorpus(page(50, 7), TARGET_CORPUS)
    expect(r.corpus).toHaveLength(7)
    expect(isViableCorpus(r.corpus.length)).toBe(false)
  })

  it("exactly 8 useful is viable — the documented minimum", () => {
    const r = buildCorpus(page(25, 8), TARGET_CORPUS)
    expect(isViableCorpus(r.corpus.length)).toBe(true)
  })
})

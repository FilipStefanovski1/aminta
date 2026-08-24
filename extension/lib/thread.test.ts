import { describe, expect, it } from "vitest"
import { enforcePostCount, parseThreadResponse } from "~lib/prompts"

const GOOD = JSON.stringify({
  threads: [
    { angle: "Personal story", posts: ["hook 1", "post 2", "post 3"] },
    { angle: "Contrarian take", posts: ["hook 2", "post 2b"] },
    { angle: "Step-by-step", posts: ["hook 3", "post 2c", "post 3c", "post 4c"] },
  ],
})

describe("parseThreadResponse", () => {
  it("parses 3 well-formed threads", () => {
    const threads = parseThreadResponse(GOOD)
    expect(threads).toHaveLength(3)
    expect(threads[0].angle).toBe("Personal story")
    expect(threads[0].posts).toEqual(["hook 1", "post 2", "post 3"])
  })

  it("strips markdown fences", () => {
    const threads = parseThreadResponse("```json\n" + GOOD + "\n```")
    expect(threads).toHaveLength(3)
  })

  it("returns [] on malformed JSON, never throws", () => {
    expect(() => parseThreadResponse("not json at all")).not.toThrow()
    expect(parseThreadResponse("not json at all")).toEqual([])
  })

  it("returns [] when threads key is missing", () => {
    expect(parseThreadResponse(JSON.stringify({ foo: "bar" }))).toEqual([])
  })

  it("drops a thread with fewer than 2 posts", () => {
    const body = JSON.stringify({ threads: [{ angle: "a", posts: ["only one"] }] })
    expect(parseThreadResponse(body)).toEqual([])
  })

  it("drops empty/whitespace-only post entries", () => {
    const body = JSON.stringify({ threads: [{ angle: "a", posts: ["real post", "  ", "another real one"] }] })
    const threads = parseThreadResponse(body)
    expect(threads[0].posts).toEqual(["real post", "another real one"])
  })

  it("falls back to a default angle label when missing", () => {
    const body = JSON.stringify({ threads: [{ posts: ["p1", "p2"] }] })
    expect(parseThreadResponse(body)[0].angle).toBe("Thread")
  })
})

// Regression coverage for the live-QA failure on "solana summit serbia":
// the error read "Couldn't generate distinct threads," but there is no
// distinctness check anywhere in this pipeline — the actual bug was a
// fixed 400-token output budget silently truncating the model's JSON mid-
// response once Thread Creator's posts were asked to be Medium-depth
// (developed), not a one-line fragment. A truncated response used to fail
// JSON.parse and discard the ENTIRE generation, even when 1-2 complete,
// valid threads existed before the cutoff. This is graceful degradation:
// recover whatever's complete instead of throwing away good output.
describe("parseThreadResponse — graceful degradation on truncated/partial JSON", () => {
  const THREAD_A = { angle: "Personal anticipation", posts: ["Heading to the summit next week.", "First time going to one of these in person."] }
  const THREAD_B = { angle: "Ecosystem observation", posts: ["Something's shifting with builders in this region.", "Worth watching before it's obvious to everyone else."] }
  const THREAD_C = { angle: "Founder perspective", posts: ["The best part of events like this isn't the talks.", "It's who you end up grabbing coffee with after."] }

  it("recovers 2 complete threads when the 3rd is cut off mid-object (a real truncation shape)", () => {
    const full = JSON.stringify({ threads: [THREAD_A, THREAD_B, THREAD_C] })
    // Simulate a token-budget cutoff: chop the string partway through the
    // third thread's posts array, mid-string-literal — exactly what an
    // output-token limit produces, not a hand-crafted "nice" truncation.
    const cutIndex = full.indexOf('"Founder perspective"') + 40
    const truncated = full.slice(0, cutIndex)

    const result = parseThreadResponse(truncated)
    expect(result).toHaveLength(2)
    expect(result[0].angle).toBe("Personal anticipation")
    expect(result[1].angle).toBe("Ecosystem observation")
  })

  it("recovers 1 complete thread when everything after it is truncated", () => {
    const full = JSON.stringify({ threads: [THREAD_A, THREAD_B, THREAD_C] })
    const cutIndex = full.indexOf('"Ecosystem observation"') + 10
    const truncated = full.slice(0, cutIndex)

    const result = parseThreadResponse(truncated)
    expect(result).toHaveLength(1)
    expect(result[0].angle).toBe("Personal anticipation")
  })

  it("returns [] (not a crash) when even the first thread is truncated", () => {
    const full = JSON.stringify({ threads: [THREAD_A, THREAD_B] })
    const cutIndex = full.indexOf('"posts"') + 5
    const truncated = full.slice(0, cutIndex)
    expect(() => parseThreadResponse(truncated)).not.toThrow()
    expect(parseThreadResponse(truncated)).toEqual([])
  })

  it("a brace inside quoted post text does not confuse the recovery scanner", () => {
    const tricky = { angle: "Observation", posts: ['Someone said "this feels like {the real thing}" and honestly, same.', "Second post, still on topic."] }
    const full = JSON.stringify({ threads: [tricky, THREAD_B] })
    const result = parseThreadResponse(full)
    expect(result).toHaveLength(2)
    expect(result[0].posts[0]).toContain("{the real thing}")
  })

  it("an unrecoverable full malformation still returns [] rather than throwing", () => {
    expect(parseThreadResponse("not json, not even close")).toEqual([])
    expect(parseThreadResponse("")).toEqual([])
  })
})

// The validator (parseThreadResponse) must never reject threads for
// sharing the same topic/vocabulary — distinctness is a PROMPT-TIME
// instruction to the model (angle diversity), never a post-hoc filter that
// can throw away already-generated, on-topic threads.
describe("same-topic, different-angle threads all survive validation", () => {
  it("3 threads about the identical topic, differing only in angle/opening premise, all pass", () => {
    const body = JSON.stringify({
      threads: [
        { angle: "Personal anticipation", posts: ["I'm heading to Solana Summit next week.", "Haven't been to one of these before, curious how it feels."] },
        { angle: "Ecosystem observation", posts: ["Something interesting is happening with builders in this region.", "Worth paying attention to."] },
        { angle: "Founder/networking perspective", posts: ["The best part of events like this isn't the talks.", "It's who you end up talking to afterward."] },
      ],
    })
    const result = parseThreadResponse(body)
    expect(result).toHaveLength(3)
    // Heavy vocabulary overlap ("summit", "Solana", "builders") across all
    // three is expected and must not trigger rejection — there is nothing
    // in this function that compares threads against each other at all.
  })
})

// Enforces buildThreadMessages' POST COUNT prompt instruction (see
// lib/prompts.ts) by REJECTING any option whose count doesn't match —
// never trims or pads a response into shape. Graceful degradation happens
// by dropping bad options, not by silently coercing them.
describe("enforcePostCount", () => {
  const make = (...postCounts: number[]) =>
    postCounts.map((n, i) => ({ angle: `Angle ${i + 1}`, posts: Array.from({ length: n }, (_, j) => `post ${j + 1}`) }))

  it("2 selected: an already-2-post option is kept", () => {
    const result = enforcePostCount(make(2), 2)
    expect(result).toHaveLength(1)
    expect(result[0].posts).toHaveLength(2)
  })

  it("3 selected: a 4-post option is rejected, not trimmed down to 3", () => {
    const result = enforcePostCount(make(4), 3)
    expect(result).toHaveLength(0)
  })

  it("5 selected: a 2-post option is rejected, never silently accepted as-is", () => {
    const result = enforcePostCount(make(2), 5)
    expect(result).toHaveLength(0)
  })

  it("wrong-sized options are rejected while valid siblings in the same batch survive", () => {
    const result = enforcePostCount(make(3, 4, 3), 3)
    expect(result).toHaveLength(2)
    expect(result.every((t) => t.posts.length === 3)).toBe(true)
  })

  it('"6+": accepts anything within 6-8', () => {
    const result = enforcePostCount(make(6, 7, 8), "6+")
    expect(result.map((t) => t.posts.length)).toEqual([6, 7, 8])
  })

  it('"6+": rejects below 6 and above 8', () => {
    const result = enforcePostCount(make(5, 9, 10), "6+")
    expect(result).toHaveLength(0)
  })

  it("all surviving options in the same batch match the exact requested count", () => {
    const result = enforcePostCount(make(3, 4, 5), 3)
    expect(result.map((t) => t.posts.length)).toEqual([3])
  })
})

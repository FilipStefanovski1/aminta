import { describe, expect, it } from "vitest"
import { parseThreadResponse } from "~lib/prompts"

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

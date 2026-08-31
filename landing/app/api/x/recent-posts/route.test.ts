import { describe, expect, it } from "vitest"
import { XApiError } from "@/lib/x/client"
import type { RawXPost } from "@/lib/x/filter"
import { mapXFetchError, selectPreviewPosts } from "./route"

function post(id: string, text: string, over: Partial<RawXPost> = {}): RawXPost {
  return { id, text, referencedTypes: [], quotedText: null, ...over }
}

describe("selectPreviewPosts — preserves real formatting, unlike buildCorpus's own prose-only text", () => {
  it("keeps original line breaks intact — never buildCorpus's whitespace-collapsed version", () => {
    const raw = "shipped this at 2am\n\nbecause apparently sleep is optional"
    const [result] = selectPreviewPosts([post("1", raw)], 3)
    expect(result.text).toBe(raw) // NOT collapsed to a single line
  })

  it("still applies the same eligibility rules as Voice Refresh (no replies/retweets/too-short)", () => {
    const posts = [
      post("1", "a real substantial post with real content in it, easily long enough"),
      post("2", "gm", {}), // too short
      post("3", "a reply", { referencedTypes: ["replied_to"] }),
      post("4", "a retweet", { referencedTypes: ["retweeted"] }),
    ]
    const result = selectPreviewPosts(posts, 3)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("1")
  })

  it("never returns more than the requested limit", () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      post(String(i), `a real substantial post number ${i} with plenty of real content in it`)
    )
    expect(selectPreviewPosts(posts, 3)).toHaveLength(3)
  })
})

describe("mapXFetchError", () => {
  it("maps a not-connected X account to a 400 with a clear message", () => {
    const result = mapXFetchError(new XApiError(400, "x_not_connected"))
    expect(result).toEqual({ error: "Connect your X account first.", code: "X_NOT_CONNECTED", status: 400 })
  })

  it("maps an expired X authorization to a 409, not 401", () => {
    // Deliberately not 401 — same reasoning as Voice Refresh's own route:
    // a 401 from the extension's authedFetch triggers an Aminta session
    // refresh, which would swallow this and misreport it as "sign in
    // again" when it's the X authorization that expired, not the Aminta one.
    const result = mapXFetchError(new XApiError(401, "x_reauth_required"))
    expect(result).toEqual({ error: "Your X authorization expired. Please reconnect.", code: "X_REAUTH_REQUIRED", status: 409 })
  })

  it("maps an X rate limit to 429", () => {
    const result = mapXFetchError(new XApiError(429, "x_rate_limited"))
    expect(result).toEqual({ error: "X is rate limiting requests. Try again shortly.", code: "X_RATE_LIMITED", status: 429 })
  })

  it("falls back to a generic unavailable error for anything else", () => {
    expect(mapXFetchError(new XApiError(500, "x_error_500"))).toEqual({
      error: "Couldn't reach X right now.", code: "X_UNAVAILABLE", status: 502,
    })
    expect(mapXFetchError(new Error("boom"))).toEqual({
      error: "Couldn't reach X right now.", code: "X_UNAVAILABLE", status: 502,
    })
    expect(mapXFetchError("not even an error")).toEqual({
      error: "Couldn't reach X right now.", code: "X_UNAVAILABLE", status: 502,
    })
  })
})

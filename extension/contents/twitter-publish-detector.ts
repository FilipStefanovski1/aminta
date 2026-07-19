// Confirms an actual successful X post (not insert, not draft, not cancel)
// by observing X's own network calls in the page's real JS context.
//
// Runs in the MAIN world (the page's own realm, not the isolated content
// script sandbox) purely so it can see and wrap window.fetch/XMLHttpRequest
// the way X's own client code calls them. It requires no extension
// permissions beyond the host permissions already granted for x.com/
// twitter.com — see extension/CLAUDE.md.
//
// MAIN-world scripts have no chrome.* API access, so this only ever
// window.postMessage()s a same-origin, well-known-shaped event. It is
// twitter-bridge.ts (ISOLATED world, same page) that validates and relays
// that event to the extension via chrome.runtime.sendMessage.

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*", "https://twitter.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

declare global {
  interface Window {
    __aminta_publish_detector__?: boolean
  }
}

// Guard against double installation (e.g. the content script somehow running
// twice on the same page) — without this, every real publish would produce
// two AMINTA_TWEET_PUBLISHED events instead of one.
if (!window.__aminta_publish_detector__) {
  window.__aminta_publish_detector__ = true

  // X creates a post via one of these GraphQL operations depending on
  // length/media. Matching on the operation name in the path (rather than
  // the full URL, which includes a version-specific query ID) is what keeps
  // this working across X's routine API rollouts.
  function isPostCreationUrl(url: string): boolean {
    return url.includes("/CreateTweet") || url.includes("/CreateNoteTweet")
  }

  function hasNonEmptyErrors(payload: unknown): boolean {
    return !!payload && typeof payload === "object" &&
      Array.isArray((payload as { errors?: unknown[] }).errors) &&
      ((payload as { errors: unknown[] }).errors.length > 0)
  }

  // Bounded, key-name-based search instead of one hard-coded nested path —
  // X's GraphQL response shape shifts between app versions; this only needs
  // to recognize "this looks like a created tweet" wherever it lands.
  const CREATION_KEY_HINTS = ["tweet_results", "create_tweet", "notetweet_result", "rest_id"]

  function hasCreationIndicator(node: unknown, depth = 0): boolean {
    if (depth > 6 || node === null || typeof node !== "object") return false
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const keyLower = key.toLowerCase()
      if (CREATION_KEY_HINTS.some((hint) => keyLower.includes(hint))) return true
      if (hasCreationIndicator(value, depth + 1)) return true
    }
    return false
  }

  // Returns true/false when the body could be parsed and evaluated, or null
  // when it couldn't be parsed at all — callers fall back to HTTP status
  // alone in that case, per the best-effort contract for this detector.
  function evaluatePublishPayload(rawText: string): boolean | null {
    let json: unknown
    try {
      json = JSON.parse(rawText)
    } catch {
      return null
    }
    if (hasNonEmptyErrors(json)) return false
    return hasCreationIndicator(json)
  }

  function announcePublished() {
    window.postMessage(
      { source: "aminta-publish-detector", type: "AMINTA_TWEET_PUBLISHED", ts: Date.now() },
      window.location.origin
    )
  }

  function evaluateSuccess(ok: boolean, rawText: string): boolean {
    const verdict = evaluatePublishPayload(rawText)
    return verdict === null ? ok : (ok && verdict)
  }

  // ── fetch ──
  const originalFetch = window.fetch.bind(window)

  function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input
    if (input instanceof URL) return input.toString()
    return input.url
  }

  function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
    if (init?.method) return init.method.toUpperCase()
    if (typeof input === "object" && input !== null && "method" in input) {
      return (input as Request).method.toUpperCase()
    }
    return "GET"
  }

  window.fetch = async function amintaFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await originalFetch(input, init)

    try {
      if (requestMethod(input, init) === "POST" && isPostCreationUrl(requestUrl(input))) {
        // Read a clone, never the original — the real caller (X's own code)
        // must receive the untouched response either way.
        response
          .clone()
          .text()
          .then((text) => { if (evaluateSuccess(response.ok, text)) announcePublished() })
          .catch(() => { if (response.ok) announcePublished() })
      }
    } catch {
      // Detection must never take down the real request.
    }

    return response
  }

  // ── XMLHttpRequest ──
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  interface TaggedXHR extends XMLHttpRequest {
    __aminta?: { method: string; url: string }
  }

  XMLHttpRequest.prototype.open = function (
    this: TaggedXHR,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    this.__aminta = { method: method.toUpperCase(), url: typeof url === "string" ? url : url.toString() }
    // eslint-disable-next-line prefer-rest-params
    return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>)
  }

  XMLHttpRequest.prototype.send = function (this: TaggedXHR, ...args: unknown[]) {
    const meta = this.__aminta
    if (meta && meta.method === "POST" && isPostCreationUrl(meta.url)) {
      this.addEventListener(
        "loadend",
        () => {
          try {
            const ok = this.status >= 200 && this.status < 300
            if (evaluateSuccess(ok, this.responseText ?? "")) announcePublished()
          } catch {
            // ignore — best-effort detection only
          }
        },
        { once: true }
      )
    }
    // eslint-disable-next-line prefer-rest-params
    return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>)
  }
}

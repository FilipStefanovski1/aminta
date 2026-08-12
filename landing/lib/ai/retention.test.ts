import { describe, it, expect } from "vitest"
import {
  CONTENT_TTL_MS,
  USAGE_LOG_RETENTION_DAYS,
  contentCutoff,
  usageLogCutoff,
  isContentExpired,
  resolveReplayState,
  type ReplayCandidate,
} from "./retention"

const NOW = Date.parse("2026-08-12T12:00:00.000Z")
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const MINUTE = 60 * 1000
const DAY = 24 * 60 * 60 * 1000

describe("retention windows", () => {
  it("keeps generated content far shorter than the usage record", () => {
    expect(CONTENT_TTL_MS).toBe(15 * MINUTE)
    expect(USAGE_LOG_RETENTION_DAYS).toBe(90)
    expect(CONTENT_TTL_MS).toBeLessThan(USAGE_LOG_RETENTION_DAYS * DAY)
  })

  it("covers the concurrency-lease window a duplicate request could arrive in", () => {
    // rateLimit.ts's claimConcurrencySlot uses a 70s lease as the "this
    // request may still be running" bound; the content TTL must exceed it.
    expect(CONTENT_TTL_MS).toBeGreaterThan(70_000)
  })

  it("derives cutoffs from now", () => {
    expect(contentCutoff(NOW).toISOString()).toBe(ago(CONTENT_TTL_MS))
    expect(usageLogCutoff(NOW).toISOString()).toBe(ago(USAGE_LOG_RETENTION_DAYS * DAY))
  })
})

describe("isContentExpired", () => {
  it("is false inside the window", () => {
    expect(isContentExpired(ago(1 * MINUTE), NOW)).toBe(false)
    expect(isContentExpired(ago(14 * MINUTE), NOW)).toBe(false)
  })

  it("is true past the window", () => {
    expect(isContentExpired(ago(16 * MINUTE), NOW)).toBe(true)
    expect(isContentExpired(ago(2 * DAY), NOW)).toBe(true)
  })

  it("treats unknown or unparseable ages as expired rather than serving them", () => {
    expect(isContentExpired(null, NOW)).toBe(true)
    expect(isContentExpired("not-a-date", NOW)).toBe(true)
  })
})

describe("resolveReplayState", () => {
  const success = (overrides: Partial<ReplayCandidate> = {}): ReplayCandidate => ({
    status: "success",
    result_text: "generated text",
    created_at: ago(1 * MINUTE),
    ...overrides,
  })

  it("replays a stored result inside the retention window", () => {
    expect(resolveReplayState(success(), NOW)).toBe("success")
  })

  it("still replays just before the TTL boundary", () => {
    expect(resolveReplayState(success({ created_at: ago(CONTENT_TTL_MS - 1000) }), NOW)).toBe("success")
  })

  // The core privacy behaviour: past the TTL the text is not served even if
  // the scrub sweep hasn't physically nulled the column yet.
  it("refuses to replay content past the TTL even when the column is still populated", () => {
    expect(resolveReplayState(success({ created_at: ago(CONTENT_TTL_MS + 1000) }), NOW)).toBe("expired")
    expect(resolveReplayState(success({ created_at: ago(30 * DAY) }), NOW)).toBe("expired")
  })

  it("reports a scrubbed row as expired, never as success and never as in_progress", () => {
    const scrubbed = success({ result_text: null, created_at: ago(30 * DAY) })
    const state = resolveReplayState(scrubbed, NOW)
    expect(state).toBe("expired")
    expect(state).not.toBe("success")
    expect(state).not.toBe("in_progress")
  })

  it("treats an empty string result as expired, not as a valid empty success", () => {
    expect(resolveReplayState(success({ result_text: "" }), NOW)).toBe("expired")
  })

  it("keeps failed generations reporting as errors", () => {
    expect(resolveReplayState({ status: "error", result_text: null, created_at: ago(1 * MINUTE) }, NOW)).toBe("error")
    // Age is irrelevant for errors — there is no content to expire.
    expect(resolveReplayState({ status: "error", result_text: null, created_at: ago(30 * DAY) }, NOW)).toBe("error")
  })

  it("keeps an in-flight request reporting as in_progress", () => {
    expect(resolveReplayState({ status: "pending", result_text: null, created_at: ago(5 * 1000) }, NOW)).toBe("in_progress")
  })

  it("never returns success without text to return", () => {
    const candidates: ReplayCandidate[] = [
      { status: "success", result_text: null, created_at: ago(1 * MINUTE) },
      { status: "success", result_text: "", created_at: ago(1 * MINUTE) },
      { status: "success", result_text: "text", created_at: ago(20 * MINUTE) },
      { status: "pending", result_text: null, created_at: ago(1 * MINUTE) },
      { status: "error", result_text: null, created_at: ago(1 * MINUTE) },
    ]
    for (const row of candidates) {
      if (resolveReplayState(row, NOW) === "success") {
        expect(row.result_text).toBeTruthy()
      }
    }
  })
})

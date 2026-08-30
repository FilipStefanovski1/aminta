import { createHmac } from "crypto"
import { describe, expect, it } from "vitest"
import {
  verifyAgentaosSignature,
  parseAgentaosEvent,
  extractValidatedUserId,
  extractPlan,
  extractEmail,
} from "./webhooks"

const SECRET = "whsec_test_secret"

function sign(body: string, secret: string, tSeconds: number): string {
  const digest = createHmac("sha256", secret).update(`${tSeconds}.${body}`).digest("hex")
  return `t=${tSeconds},v1=${digest}`
}

describe("verifyAgentaosSignature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: {} })
  const now = Date.parse("2026-08-30T12:00:00Z")

  it("accepts a valid, fresh signature", () => {
    const header = sign(body, SECRET, Math.floor(now / 1000))
    expect(verifyAgentaosSignature(body, header, SECRET, now)).toEqual({ ok: true })
  })

  it("rejects a missing header", () => {
    expect(verifyAgentaosSignature(body, null, SECRET, now)).toEqual({ ok: false, reason: "missing_header" })
  })

  it("rejects a malformed header", () => {
    expect(verifyAgentaosSignature(body, "not-a-real-header", SECRET, now)).toEqual({ ok: false, reason: "malformed_header" })
  })

  it("rejects a signature older than 5 minutes (replay protection)", () => {
    const staleSeconds = Math.floor(now / 1000) - 6 * 60
    const header = sign(body, SECRET, staleSeconds)
    expect(verifyAgentaosSignature(body, header, SECRET, now)).toEqual({ ok: false, reason: "expired" })
  })

  it("rejects a wrong secret", () => {
    const header = sign(body, "whsec_wrong", Math.floor(now / 1000))
    expect(verifyAgentaosSignature(body, header, SECRET, now)).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("rejects a tampered body (signature no longer matches)", () => {
    const header = sign(body, SECRET, Math.floor(now / 1000))
    const tamperedBody = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { metadata: { userId: "attacker" } } })
    expect(verifyAgentaosSignature(tamperedBody, header, SECRET, now)).toEqual({ ok: false, reason: "bad_signature" })
  })
})

describe("parseAgentaosEvent", () => {
  it("parses a well-formed envelope", () => {
    const event = parseAgentaosEvent(JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { foo: "bar" } }))
    expect(event).toEqual({ id: "evt_1", type: "checkout.session.completed", data: { foo: "bar" } })
  })

  it("returns null for invalid JSON", () => {
    expect(parseAgentaosEvent("{not json")).toBeNull()
  })

  it("returns null when id or type is missing", () => {
    expect(parseAgentaosEvent(JSON.stringify({ type: "checkout.session.completed", data: {} }))).toBeNull()
    expect(parseAgentaosEvent(JSON.stringify({ id: "evt_1", data: {} }))).toBeNull()
  })
})

describe("extractValidatedUserId — malformed metadata cannot spoof an entitlement owner", () => {
  it("accepts a well-formed UUID", () => {
    expect(extractValidatedUserId({ userId: "2e68a0ec-f5c1-4cb2-87da-a56012e0037e" })).toBe("2e68a0ec-f5c1-4cb2-87da-a56012e0037e")
  })

  it("rejects a non-UUID string (e.g. an attacker-supplied arbitrary value)", () => {
    expect(extractValidatedUserId({ userId: "not-a-uuid" })).toBeNull()
    expect(extractValidatedUserId({ userId: "'; DROP TABLE users; --" })).toBeNull()
  })

  it("rejects missing/null/non-string metadata", () => {
    expect(extractValidatedUserId(null)).toBeNull()
    expect(extractValidatedUserId(undefined)).toBeNull()
    expect(extractValidatedUserId({})).toBeNull()
    expect(extractValidatedUserId({ userId: 12345 })).toBeNull()
  })
})

describe("extractPlan", () => {
  it("accepts only pro or founder", () => {
    expect(extractPlan({ plan: "pro" })).toBe("pro")
    expect(extractPlan({ plan: "founder" })).toBe("founder")
  })

  it("rejects any other value, including an attempt to claim a fabricated plan", () => {
    expect(extractPlan({ plan: "lifetime" })).toBeNull()
    expect(extractPlan({ plan: "admin" })).toBeNull()
    expect(extractPlan({})).toBeNull()
  })
})

describe("extractEmail", () => {
  it("lowercases and trims a well-formed email", () => {
    expect(extractEmail({ email: "  Someone@Example.com  " })).toBe("someone@example.com")
  })

  it("rejects a non-email string", () => {
    expect(extractEmail({ email: "not-an-email" })).toBeNull()
    expect(extractEmail({})).toBeNull()
  })
})

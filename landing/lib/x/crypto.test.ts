// Token encryption. These tokens are the credential that reads a user's X
// account, so the guarantees worth pinning are: it round-trips, it does not
// leak plaintext, and tampering is detected rather than silently accepted.
import { describe, it, expect, beforeAll } from "vitest"
import { randomBytes } from "node:crypto"
import { decryptToken, encryptToken, generateKeyBase64 } from "./crypto"

beforeAll(() => {
  process.env.X_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64")
})

const TOKEN = "fake-token-value-for-tests-only"

describe("round trip", () => {
  it("decrypts back to the original", () => {
    expect(decryptToken(encryptToken(TOKEN))).toBe(TOKEN)
  })

  it("never stores the plaintext", () => {
    expect(encryptToken(TOKEN)).not.toContain(TOKEN)
  })

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptToken(TOKEN)).not.toBe(encryptToken(TOKEN))
  })

  it("handles long tokens", () => {
    const long = "x".repeat(4000)
    expect(decryptToken(encryptToken(long))).toBe(long)
  })
})

describe("tampering is rejected, not silently accepted", () => {
  it("throws when the ciphertext is altered", () => {
    const enc = encryptToken(TOKEN)
    const [iv, tag, data] = enc.split(".")
    const flipped = data.slice(0, -2) + (data.slice(-2) === "AA" ? "BB" : "AA")
    expect(() => decryptToken([iv, tag, flipped].join("."))).toThrow()
  })

  it("throws when the auth tag is altered", () => {
    const [iv, tag, data] = encryptToken(TOKEN).split(".")
    const flipped = tag.slice(0, -2) + (tag.slice(-2) === "AA" ? "BB" : "AA")
    expect(() => decryptToken([iv, flipped, data].join("."))).toThrow()
  })

  it("throws on a malformed payload", () => {
    expect(() => decryptToken("nonsense")).toThrow(/malformed/)
  })

  it("cannot be decrypted with a different key", () => {
    const enc = encryptToken(TOKEN)
    const original = process.env.X_TOKEN_ENCRYPTION_KEY
    process.env.X_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64")
    expect(() => decryptToken(enc)).toThrow()
    process.env.X_TOKEN_ENCRYPTION_KEY = original
  })
})

describe("key validation fails loudly", () => {
  it("throws when the key is missing", () => {
    const original = process.env.X_TOKEN_ENCRYPTION_KEY
    delete process.env.X_TOKEN_ENCRYPTION_KEY
    expect(() => encryptToken(TOKEN)).toThrow(/not set/)
    process.env.X_TOKEN_ENCRYPTION_KEY = original
  })

  it("throws when the key is the wrong length", () => {
    const original = process.env.X_TOKEN_ENCRYPTION_KEY
    process.env.X_TOKEN_ENCRYPTION_KEY = Buffer.from("too short").toString("base64")
    expect(() => encryptToken(TOKEN)).toThrow(/32 bytes/)
    process.env.X_TOKEN_ENCRYPTION_KEY = original
  })

  it("generateKeyBase64 produces a usable 32-byte key", () => {
    expect(Buffer.from(generateKeyBase64(), "base64")).toHaveLength(32)
  })
})

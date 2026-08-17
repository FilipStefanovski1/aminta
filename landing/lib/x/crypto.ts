// AES-256-GCM for X OAuth tokens at rest.
//
// Deliberately done here rather than with pgcrypto: pgcrypto takes the key as
// a SQL parameter, so the key would travel through the same database that
// holds the ciphertext and could surface in query logs, pg_stat_statements,
// or an error trace. Encrypting in the Node layer keeps the key in a Vercel
// env var, so a database dump yields ciphertext and nothing usable.
//
// GCM rather than CBC because it authenticates: a tampered ciphertext fails
// to decrypt instead of silently producing garbage that we might then send
// to X as a bearer token.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12 // 96-bit nonce, the size GCM is specified for
const KEY_BYTES = 32

/**
 * Reads and validates the key. Throws rather than falling back to a default
 * so a misconfigured deploy fails loudly at first use instead of silently
 * writing tokens under a predictable key.
 */
function key(): Buffer {
  const raw = process.env.X_TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error("X_TOKEN_ENCRYPTION_KEY is not set")
  const buf = Buffer.from(raw, "base64")
  if (buf.length !== KEY_BYTES) {
    throw new Error(`X_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${buf.length}`)
  }
  return buf
}

/** Stored form: iv.authTag.ciphertext, all base64url, dot-separated. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".")
}

export function decryptToken(stored: string): string {
  const parts = stored.split(".")
  if (parts.length !== 3) throw new Error("malformed encrypted token")
  const [ivB64, tagB64, dataB64] = parts
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, "base64url"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8")
}

/** One-off helper for generating a key to paste into Vercel. */
export function generateKeyBase64(): string {
  return randomBytes(KEY_BYTES).toString("base64")
}

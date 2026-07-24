// Request-level security helpers for app/api/generate — image validation,
// style-profile corpus limits, and IP hashing. Split out from route.ts so
// each guard is independently testable/auditable.
import { createHmac } from "node:crypto"

// ─── Images ─────────────────────────────────────────────────────────────
// The extension always re-encodes images through a <canvas> before sending
// (extension/lib/images.ts's fetchImageAsDataUrl, GeneratorPanel.tsx's
// resizeImage) — the client never sends a raw remote URL or an arbitrary
// file. That client behavior is not a security boundary though: this
// endpoint re-validates every image from scratch, strictly, because the
// request body is attacker-controlled regardless of what a well-behaved
// extension build would send.
export const MAX_IMAGES = 4
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB decoded, per image

// Base64 is ~4/3 the size of the decoded bytes — this bounds the STRING
// length we're willing to regex/measure before ever computing a real byte
// count, so a pathologically large `images[]` entry can't burn CPU on
// regex/length work before being rejected.
const MAX_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

// Strict data-URL shape: exact mime allowlist (no image/svg+xml — SVG can
// carry script/XSS and Gemini has no legitimate use for it here), base64
// payload only (no external/remote URLs of any kind — rejects
// https://..., javascript:, etc. by construction since they don't match).
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/

export type ImageValidation = { ok: true; bytes: number } | { ok: false; reason: string }

export function validateImageDataUrl(value: unknown): ImageValidation {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, reason: "Invalid image." }
  }
  if (value.length > MAX_BASE64_CHARS + 40) {
    return { ok: false, reason: "An image is too large (max 5MB per image)." }
  }
  const match = DATA_URL_RE.exec(value)
  if (!match) {
    return { ok: false, reason: "Unsupported image format. Only JPEG, PNG, and WebP are supported." }
  }
  const [, mime, b64] = match
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    return { ok: false, reason: "Unsupported image format. Only JPEG, PNG, and WebP are supported." }
  }
  const bytes = Math.floor((b64.length * 3) / 4)
  if (bytes > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "An image is too large (max 5MB per image)." }
  }
  return { ok: true, bytes }
}

export function validateImages(images: unknown): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(images)) return { ok: false, reason: "Invalid images payload." }
  if (images.length > MAX_IMAGES) return { ok: false, reason: `Too many images (max ${MAX_IMAGES}).` }
  for (const img of images) {
    const result = validateImageDataUrl(img)
    if (!result.ok) return result
  }
  return { ok: true }
}

// ─── Style-profile corpus ───────────────────────────────────────────────
// The extension doesn't cap corpus size client-side (buildCorpus() in
// extension/lib/styleProfile.ts just concatenates voice examples + tweet
// DNA) — normal input-length validation on the /generate request doesn't
// apply here at all since style_profile mode sends a `corpus[]`, not
// `input`. These are the independent server-side caps for that field.
export const MAX_CORPUS_ENTRIES = 60
export const MAX_CHARS_PER_CORPUS_ENTRY = 2_000
export const MAX_TOTAL_CORPUS_CHARS = 20_000

export function validateCorpus(
  corpus: unknown
): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(corpus) || corpus.length === 0) {
    return { ok: false, reason: "Missing corpus for style_profile." }
  }
  if (corpus.length > MAX_CORPUS_ENTRIES) {
    return { ok: false, reason: `Too many writing samples (max ${MAX_CORPUS_ENTRIES}).` }
  }
  let total = 0
  for (const entry of corpus) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { text?: unknown }).text !== "string" ||
      typeof (entry as { source?: unknown }).source !== "string"
    ) {
      return { ok: false, reason: "Malformed writing sample." }
    }
    const text = (entry as { text: string }).text
    if (text.length > MAX_CHARS_PER_CORPUS_ENTRY) {
      return { ok: false, reason: `A writing sample is too long (max ${MAX_CHARS_PER_CORPUS_ENTRY} characters).` }
    }
    total += text.length
  }
  if (total > MAX_TOTAL_CORPUS_CHARS) {
    return { ok: false, reason: `Writing samples are too large in total (max ${MAX_TOTAL_CORPUS_CHARS} characters).` }
  }
  return { ok: true }
}

// ─── Request body size ──────────────────────────────────────────────────
// Defense in depth ahead of request.json() — Content-Length is
// client-supplied and not authoritative, but a request that lies about it
// either fails to parse or gets caught by the per-image/per-field checks
// above anyway. This just avoids buffering a JSON.parse of something
// enormous when the client is honest about it being enormous.
export const MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024 // 4 images * 5MB + JSON/base64 overhead + headroom

// ─── IP hashing ──────────────────────────────────────────────────────────
// Vercel's edge appends the real connecting IP as the LAST hop in
// x-forwarded-for — a client can freely set its own x-forwarded-for header,
// but Vercel's proxy appends its own observed IP after whatever the client
// sent, so trusting the first entry means trusting attacker-controlled
// input. x-real-ip, when present, is set directly by Vercel's edge and is
// preferred. Neither raw value is ever stored or used as a rate-limit key —
// both are HMAC-SHA256'd with a server-only salt first, so ai_usage_log
// never holds a reversible IP address (a real privacy/retention concern for
// an audit log that otherwise lives indefinitely).
function extractClientIp(headers: { get(name: string): string | null }): string | null {
  const realIp = headers.get("x-real-ip")
  if (realIp) return realIp.trim()

  const forwarded = headers.get("x-forwarded-for")
  if (!forwarded) return null
  const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : null
}

export function hashedClientIp(headers: { get(name: string): string | null }): string | null {
  const ip = extractClientIp(headers)
  if (!ip) return null
  const salt = process.env.IP_HASH_SALT
  if (!salt) {
    // Misconfiguration guard: never fall back to storing/using a raw IP.
    // Rate limiting degrades to "no per-IP bucket" rather than leaking PII.
    return null
  }
  return createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32)
}

// ─── Origin / Sec-Fetch-Site defense-in-depth ───────────────────────────
// Auth (a valid Supabase bearer token) plus the independent server-side
// entitlement check are the real security boundary here — this is a
// secondary check, best-effort for a Chrome extension caller. MV3 extension
// fetches send `Origin: chrome-extension://<id>`; NEXT_PUBLIC_AMINTA_EXTENSION_IDS
// (comma-separated) is the allowlist already declared in .env.example. If
// it's unset, this check is skipped entirely (fail open) rather than
// risking an outage from a misconfigured/rotated extension id — it's
// defense in depth, not the primary gate.
export function isAllowedOrigin(headers: { get(name: string): string | null }): boolean {
  const allowlist = (process.env.NEXT_PUBLIC_AMINTA_EXTENSION_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (allowlist.length === 0) return true

  const origin = headers.get("origin")
  if (!origin) return true // no Origin header at all — not every legitimate MV3 fetch sends one

  if (!origin.startsWith("chrome-extension://")) return false
  const id = origin.slice("chrome-extension://".length)
  return allowlist.includes(id)
}

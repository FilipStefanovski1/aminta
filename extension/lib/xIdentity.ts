// The single normalized "connected X account" — powers both the
// product-facing identity shown in Settings AND the browser X-account
// mismatch guard in contents/twitter-bridge.ts. One definition, not two.
//
// Source of truth: store.xConnected/xUsername/xDisplayName/xAvatarUrl,
// populated by lib/voiceRefresh.ts from the real, already-shipped "Connect
// X" OAuth flow (backend: app/api/x/connection). That endpoint deliberately
// never returns the X user id to the extension ("every one of them is a
// credential or an identifier we promised to keep server-side" — see
// landing/app/api/x/connection/route.ts) — so in practice this always
// degrades to normalized-username comparison, which is the documented
// fallback path, not a shortcut around it.
import type { AmintaStore } from "~lib/storage"

export interface XIdentity {
  userId?: string
  username?: string
}

export interface ProductIdentity {
  displayName: string
  /** "@handle", or null when there's no connected X identity to show one for. */
  handle: string | null
  avatarUrl: string | null
  usingXIdentity: boolean
}

/** lowercase, strips a leading "@", trims whitespace. Never compares display names. */
export function normalizeXUsername(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = raw.trim().replace(/^@/, "").toLowerCase()
  return t || null
}

/** The one connected X identity — null when Aminta has no X connection at all. */
export function getConnectedXIdentity(
  store: Pick<AmintaStore, "xConnected" | "xUsername">
): XIdentity | null {
  if (!store.xConnected || !store.xUsername) return null
  return { username: store.xUsername }
}

/** Stable ID wins when both sides have one; otherwise normalized username. */
export function xIdentitiesMatch(a: XIdentity | null, b: XIdentity | null): boolean {
  if (!a || !b) return false
  if (a.userId && b.userId) return a.userId === b.userId
  const an = normalizeXUsername(a.username)
  const bn = normalizeXUsername(b.username)
  return !!an && !!bn && an === bn
}

/**
 * Product-facing identity for account surfaces (Settings, etc). X identity
 * wins whenever Aminta is actually connected to one; email is only ever the
 * fallback for accounts with no X connection — never fabricated from it.
 */
export function getProductIdentity(
  store: Pick<AmintaStore, "xConnected" | "xUsername" | "xDisplayName" | "xAvatarUrl">,
  email: string | null
): ProductIdentity {
  if (store.xConnected && store.xUsername) {
    return {
      displayName: store.xDisplayName || store.xUsername,
      handle: `@${store.xUsername}`,
      avatarUrl: store.xAvatarUrl || null,
      usingXIdentity: true,
    }
  }
  return {
    displayName: email || "Your account",
    handle: null,
    avatarUrl: null,
    usingXIdentity: false,
  }
}

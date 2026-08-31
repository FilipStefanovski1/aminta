// Canonical handler for the Supabase auth user changing on this device.
//
// This is the single choke point that prevents cross-account XP/state
// contamination: any code path that observes auth_user_id changing in
// chrome.storage.local (background.ts's onChanged listener, sidepanel's own
// onChanged listener, sidepanel's mount effect, LoginScreen's onSignedIn)
// must route through here instead of calling pullFromCloud() directly.

import { clearAccountScopedState, getStore } from "./storage"
import { pullFromCloud, bumpSyncEpoch } from "./sync"

const isDev = (() => {
  try { return !("update_url" in chrome.runtime.getManifest()) } catch { return false }
})()

// Persisted (not in-memory) record of which authenticated user the
// account-scoped fields currently in chrome.storage.local actually belong
// to. This is the piece that used to be missing: every previous safeguard
// here depended on some JS context having *observed* the actual login/
// switch/logout event live (a storage.onChanged diff, or an in-memory
// prevUserIdRef). Both of those are lost across a sidepanel remount or an
// MV3 service worker restart — a cold start had nothing to compare against
// and simply trusted whatever xp/level/etc. happened to already be sitting
// in storage, which is exactly how account B could render account A's
// still-cached Level 4 with no live event ever having fired in that
// context. This key survives all of that, so ownership is verified on
// EVERY hydration path, not just ones lucky enough to see a live diff.
const STATE_OWNER_KEY = "state_owner_user_id"

async function readStateOwner(): Promise<string | null> {
  const data = await chrome.storage.local.get(STATE_OWNER_KEY)
  return (data[STATE_OWNER_KEY] as string | undefined) || null
}

async function writeStateOwner(userId: string | null): Promise<void> {
  if (userId) await chrome.storage.local.set({ [STATE_OWNER_KEY]: userId })
  else await chrome.storage.local.remove(STATE_OWNER_KEY)
}

/**
 * True once the account-scoped state currently in chrome.storage.local is
 * verified to belong to `userId`. Callers that render progression (XP,
 * level, streak, missions, voice, …) should treat `false` as "not safe to
 * render yet" — show a neutral/loading state instead, per the same
 * ownership-before-render rule handleAuthUserChanged itself follows.
 */
export async function storeIsOwnedBy(userId: string): Promise<boolean> {
  return (await readStateOwner()) === userId
}

export async function handleAuthUserChanged(
  previousUserId: string | null,
  nextUserId: string | null
): Promise<void> {
  // The caller's previousUserId is only ever an in-memory guess — reset to
  // null on every fresh mount or service-worker restart — so it is never
  // trusted alone for the decision that actually matters here. The
  // persisted owner marker is authoritative when present; the in-memory
  // value is only a fallback for the genuinely first-ever call in a brand
  // new JS context where nothing has been persisted yet either (which only
  // happens on this device's very first sign-in, when there's nothing to
  // protect against regardless).
  const persistedOwner = await readStateOwner()
  const effectivePrevious = persistedOwner ?? previousUserId

  // Only clear (and only invalidate in-flight requests) when we have
  // positive evidence the account actually changed: either a known previous
  // user logged out (effectivePrevious set, nextUserId empty) or a known
  // previous user was replaced by a different known user.
  const switchedAccount = !!effectivePrevious && !!nextUserId && effectivePrevious !== nextUserId
  const loggedOut = !!effectivePrevious && !nextUserId
  const shouldClear = switchedAccount || loggedOut

  if (isDev && (shouldClear || nextUserId)) {
    console.log("[Aminta account] auth user changed —",
      "persisted owner:", persistedOwner,
      "| previous (in-memory):", previousUserId,
      "| next:", nextUserId,
      "| action:", loggedOut ? "logout" : switchedAccount ? "switch" : "login/refresh")
  }

  if (shouldClear) {
    // Invalidate any push/pull already in flight in this JS context — e.g. a
    // startup pull for the *previous* account that hasn't resolved yet. Only
    // do this when we're sure a switch/logout actually happened: bumping
    // unconditionally on every call (including ordinary logins and token
    // refreshes, which also flow through this function) would invalidate a
    // same-account pull that's legitimately in flight for completely
    // unrelated reasons — e.g. a 401 mid-pull triggers refreshAuthSession(),
    // which rewrites auth_user_id to the SAME value and re-enters this
    // function; bumping there would silently discard the original pull's own
    // response even though nothing about the account changed. That's exactly
    // how a real account's XP/level can appear stuck at 0 in the extension
    // while the web dashboard shows the correct total for the same user.
    bumpSyncEpoch()

    // Preserve device settings (apiKey/model live outside ACCOUNT_SCOPED_KEYS)
    // while wiping every account-scoped field back to its Lv.1 / 0 XP
    // default. This must happen before any cloud pull so a stale local cache
    // can never be merged into the new/no account.
    await clearAccountScopedState()
  }

  // Recorded BEFORE the cloud pull, same reasoning as clearing before
  // pulling: if the pull throws, is interrupted by a service-worker
  // restart, or this JS context dies mid-flight, the NEXT hydration (cold
  // or live) must still see nextUserId as the owner — falling back to a
  // stale/absent marker here would make that next call wrongly skip the
  // clear it actually needs.
  await writeStateOwner(nextUserId)

  let cloudLoaded = false
  let cloudXp: number | undefined
  if (nextUserId) {
    // Auth credentials are already in storage by the time this runs (that
    // write is what triggered the change). If we cleared above, local state
    // is now zeroed, so pullFromCloud's merge (Math.max against 0) is
    // equivalent to a plain load — no risk of resurrecting the previous
    // account's numbers. If we didn't clear (same user / redundant call —
    // see the header comment on multiple listeners converging here), this
    // is the normal same-account multi-device merge.
    const result = await pullFromCloud()
    cloudLoaded = true
    cloudXp = result ? result.cloudXp : undefined
  }
  // If there's no cloud row for this user, pullFromCloud's merge leaves the
  // just-cleared defaults (Lv.1 / 0 XP) in place — nothing further to do.

  if (isDev && (shouldClear || nextUserId)) {
    const after = await getStore()
    console.log("[Aminta account] state reset complete —",
      "account state cleared:", shouldClear,
      "| cloud state loaded:", cloudLoaded,
      "| final local xp:", after.xp,
      "| final cloud xp:", cloudXp ?? "n/a (no session or fetch failed)")
  }
}

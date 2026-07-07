// Canonical handler for the Supabase auth user changing on this device.
//
// This is the single choke point that prevents cross-account XP/state
// contamination: any code path that observes auth_user_id changing in
// chrome.storage.local (background.ts's onChanged listener, sidepanel's
// own onChanged listener) must route through here instead of calling
// pullFromCloud() directly.

import { clearAccountScopedState, getStore } from "./storage"
import { pullFromCloud, bumpSyncEpoch } from "./sync"

const isDev = !("update_url" in chrome.runtime.getManifest())

export async function handleAuthUserChanged(
  previousUserId: string | null,
  nextUserId: string | null
): Promise<void> {
  // Only clear (and only invalidate in-flight requests) when we have
  // positive evidence the account actually changed: either a known previous
  // user logged out (previousUserId set, nextUserId empty) or a known
  // previous user was replaced by a different known user. When previousUserId
  // is unknown (e.g. the sidepanel was just opened and hasn't seen a prior
  // session in memory) this is an ordinary login/refresh, not a switch — the
  // *actual* switch/logout, if one happened, was already observed and
  // cleared by background.ts's onChanged listener, which always has the real
  // previous value from chrome.storage itself, independent of whether any UI
  // was open to see it.
  const switchedAccount = !!previousUserId && !!nextUserId && previousUserId !== nextUserId
  const loggedOut = !!previousUserId && !nextUserId
  const shouldClear = switchedAccount || loggedOut

  if (isDev && (shouldClear || nextUserId)) {
    console.log("[Aminta account] auth user changed —",
      "previous:", previousUserId,
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

    // 1 & 2. Preserve device settings (apiKey/model live outside
    // ACCOUNT_SCOPED_KEYS) while wiping every account-scoped field back to
    // its Lv.1 / 0 XP default. This must happen before any cloud pull so a
    // stale local cache can never be merged into the new/no account.
    await clearAccountScopedState()
  }

  let cloudLoaded = false
  let cloudXp: number | undefined
  if (nextUserId) {
    // 3 & 4. Auth credentials are already in storage by the time this runs
    // (that write is what triggered the change). If we cleared above, local
    // state is now zeroed, so pullFromCloud's merge (Math.max against 0) is
    // equivalent to a plain load — no risk of resurrecting the previous
    // account's numbers. If we didn't clear (same user / ambiguous case),
    // this is the normal same-account multi-device merge.
    const result = await pullFromCloud()
    cloudLoaded = true
    cloudXp = result ? result.cloudXp : undefined
  }
  // 5. If there's no cloud row for this user, pullFromCloud's merge leaves
  // the just-cleared defaults (Lv.1 / 0 XP) in place — nothing further to do.

  if (isDev && (shouldClear || nextUserId)) {
    const after = await getStore()
    console.log("[Aminta account] state reset complete —",
      "account state cleared:", shouldClear,
      "| cloud state loaded:", cloudLoaded,
      "| final local xp:", after.xp,
      "| final cloud xp:", cloudXp ?? "n/a (no session or fetch failed)")
  }
}

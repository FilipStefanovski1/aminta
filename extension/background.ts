import { handleAuthUserChanged } from "./lib/accountScope"
import { incrementMissionPublished, recordStreak } from "./lib/missions"
import { resolvePendingXP } from "./lib/xp"

export {}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Aminta sidePanel error:", error))

// Log every storage change that touches auth keys, and — the canonical
// trigger for cross-account contamination prevention — detect whenever
// auth_user_id itself changes (sign-in, sign-out, or switching accounts on
// the same device) and route it through handleAuthUserChanged, which clears
// account-scoped local state before any cloud state for the new user is
// loaded. This listener is the authoritative source: chrome.storage's
// oldValue/newValue are reliable even if the sidepanel isn't open when the
// switch happens.
chrome.storage.local.onChanged.addListener((changes) => {
  const authKeys = ["auth_access_token", "auth_refresh_token", "auth_user_id", "auth_user_email"]
  const authChanged = authKeys.some(k => k in changes)
  if (!authChanged) return
  console.log("[Aminta bg] storage.onChanged auth keys —",
    "auth_user_id:", changes.auth_user_id?.newValue ?? "(unchanged)",
    "| auth_user_email:", changes.auth_user_email?.newValue ?? "(unchanged)",
    "| auth_access_token set:", !!changes.auth_access_token?.newValue)

  if ("auth_user_id" in changes) {
    const previousUserId = (changes.auth_user_id.oldValue as string | undefined) ?? null
    const nextUserId = (changes.auth_user_id.newValue as string | undefined) ?? null
    handleAuthUserChanged(previousUserId, nextUserId).catch((err) =>
      console.error("[Aminta bg] handleAuthUserChanged failed:", err)
    )
  }
})

// Internal message from the aminta-auth-bridge content script.
// Fires after the content script has already written the tokens to storage.
// We just need to close the tab and notify the sidepanel.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "AMINTA_AUTH_FROM_BRIDGE") return false

  console.log("[Aminta bg] HOP6 received AMINTA_AUTH_FROM_BRIDGE")

  chrome.storage.local
    .get(["auth_user_id", "auth_user_email", "auth_access_token"])
    .then(({ auth_user_id, auth_user_email, auth_access_token }) => {
      console.log("[Aminta bg] HOP6 storage readback —",
        "auth_user_id:", auth_user_id,
        "| auth_user_email:", auth_user_email,
        "| auth_access_token exists:", !!auth_access_token)

      if (sender.tab?.id) chrome.tabs.remove(sender.tab.id)
      chrome.runtime.sendMessage({ type: "AMINTA_AUTH_SUCCESS" }).catch(() => {})
      sendResponse({ ok: true })
    })

  return true // keep port open for async sendResponse
})

// Confirmed-publish signal, relayed from twitter-publish-detector.ts (MAIN
// world, watches X's own network calls) via twitter-bridge.ts (ISOLATED
// world, has chrome.runtime access). Resolves whichever insert was queued
// most recently (see lib/xp.ts) into real XP/streak/mission credit — an
// organic post with nothing queued resolves to null and awards nothing.
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg?.type !== "AMINTA_POST_PUBLISHED") return false

  resolvePendingXP()
    .then(async (result) => {
      if (!result) return
      await recordStreak()
      await incrementMissionPublished()
      chrome.runtime.sendMessage({ type: "AMINTA_XP_AWARDED", ...result }).catch(() => {})
    })
    .catch((err) => console.error("[Aminta bg] resolvePendingXP failed:", err))

  return false // fire-and-forget — no sendResponse expected
})

// Receive auth token from amintaapp.com/extension-auth after the user completes
// the full Supabase Google OAuth flow on the website. This produces the same
// auth.uid() as the website — no admin.createUser divergence.
//
// IMPORTANT: must be a sync function that returns `true` — async listeners
// return a Promise which Chrome treats as `false`, closing the port immediately
// before sendResponse is called. In MV3 the service worker may also be
// terminated before an async function's awaits complete.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "AMINTA_AUTH") return false

  const { accessToken, refreshToken, userId, email } = msg
  if (!accessToken) { sendResponse({ ok: false }); return false }

  chrome.storage.local
    .set({
      auth_access_token: accessToken,
      auth_refresh_token: refreshToken,
      auth_user_id: userId,
      auth_user_email: email,
    })
    .then(() => {
      // Dev logging — verifies the same auth.uid() is used by both sides.
      // Open the service worker DevTools and compare with Supabase Auth dashboard.
      const isDev = !("update_url" in chrome.runtime.getManifest())
      if (isDev) {
        console.log("[Aminta] auth stored — auth_user_id:", userId, "| email:", email)
      }

      // Close the login tab
      if (_sender.tab?.id) chrome.tabs.remove(_sender.tab.id)

      // Notify sidepanel (sidepanel also listens for storage change directly)
      chrome.runtime.sendMessage({ type: "AMINTA_AUTH_SUCCESS" }).catch(() => {})

      sendResponse({ ok: true })
    })
    .catch((err) => {
      console.error("[Aminta] auth storage failed:", err)
      sendResponse({ ok: false })
    })

  // Return true to keep the message port open until sendResponse is called.
  return true
})

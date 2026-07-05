export {}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Aminta sidePanel error:", error))

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

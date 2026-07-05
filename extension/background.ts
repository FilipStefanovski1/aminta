export {}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Aminta sidePanel error:", error))

// Receive auth token from amintaapp.com/extension-auth after the user completes
// the full Supabase Google OAuth flow on the website. This produces the same
// auth.uid() as the website — no admin.createUser divergence.
chrome.runtime.onMessageExternal.addListener(async (msg, _sender, sendResponse) => {
  if (msg.type !== "AMINTA_AUTH") return

  const { accessToken, refreshToken, userId, email } = msg
  if (!accessToken) return

  await chrome.storage.local.set({
    auth_access_token: accessToken,
    auth_refresh_token: refreshToken,
    auth_user_id: userId,
    auth_user_email: email,
  })

  // Dev logging — verifies the same auth.uid() is used by both extension and website.
  // Unpacked (dev) extensions have no update_url in the manifest.
  // To confirm: open the extension's service worker DevTools and compare this
  // value with the user.id shown in the Supabase Auth dashboard or website session.
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

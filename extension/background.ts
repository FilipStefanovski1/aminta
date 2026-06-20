export {}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Aminta sidePanel error:", error))

// Receive auth token from amintaapp.com after login
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

  // Close the login tab
  if (_sender.tab?.id) chrome.tabs.remove(_sender.tab.id)

  // Notify sidepanel
  chrome.runtime.sendMessage({ type: "AMINTA_AUTH_SUCCESS" }).catch(() => {})

  sendResponse({ ok: true })
})

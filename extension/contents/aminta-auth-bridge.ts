// Content script injected on every amintaapp.com page.
//
// Bridges the OAuth completion back to the extension without needing an ext_id.
// The extension-auth page (amintaapp.com/extension-auth) dispatches a
// window.postMessage with auth tokens. This script receives it, writes the
// tokens directly to chrome.storage.local, and notifies the background.
//
// This sidesteps the ext_id mismatch problem: the content script always runs
// in the context of the currently-installed extension, so chrome.runtime is
// always the right one.

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://amintaapp.com/*"],
  run_at: "document_start",
}

console.log("[Aminta bridge] content script loaded on", window.location.href)

window.addEventListener("message", async (event) => {
  // Only accept messages from our own origin.
  if (event.origin !== "https://amintaapp.com") return
  if (!event.data || event.data.type !== "AMINTA_AUTH_TOKENS") return

  console.log("[Aminta bridge] HOP4 received AMINTA_AUTH_TOKENS from", event.origin)

  const { accessToken, refreshToken, userId, email } = event.data
  if (!accessToken) return

  try {
    await chrome.storage.local.set({
      auth_access_token: accessToken,
      auth_refresh_token: refreshToken,
      auth_user_id: userId,
      auth_user_email: email,
    })

    console.log("[Aminta bridge] HOP5 storage.set called —",
      "auth_user_id:", userId,
      "| auth_user_email:", email,
      "| auth_access_token exists:", !!accessToken)

    // Read back immediately to confirm the write landed.
    const written = await chrome.storage.local.get([
      "auth_access_token", "auth_user_id", "auth_user_email",
    ])
    console.log("[Aminta bridge] HOP5 storage.get readback —",
      "auth_user_id:", written.auth_user_id,
      "| auth_user_email:", written.auth_user_email,
      "| auth_access_token exists:", !!written.auth_access_token)

    // Tell background to close this tab + log + notify sidepanel.
    chrome.runtime.sendMessage({ type: "AMINTA_AUTH_FROM_BRIDGE" }).catch(() => {})

    // ACK to the extension-auth page so it can show "Signed in!".
    window.postMessage({ type: "AMINTA_AUTH_ACK", ok: true }, "*")
  } catch (err) {
    console.error("[Aminta bridge] storage.set failed:", err)
    window.postMessage({ type: "AMINTA_AUTH_ACK", ok: false, error: String(err) }, "*")
  }
})

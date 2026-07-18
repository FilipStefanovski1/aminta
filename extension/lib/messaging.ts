// Typed bridge between the side panel and content scripts on the active tab.

import type { Platform } from "~lib/prompts"

export interface BridgeResponse {
  ok: boolean
  text?: string
  error?: string
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

function isXTab(tab: chrome.tabs.Tab | null): boolean {
  return !!tab?.url && /^https:\/\/(x|twitter)\.com\//.test(tab.url)
}

// `platform` is threaded through as a param (rather than hardcoded inline)
// purely so call sites keep passing the `Platform` value they already have —
// X is the only value it can be.
async function send(message: unknown, platform: Platform): Promise<BridgeResponse> {
  const tab = await getActiveTab()
  if (!isXTab(tab) || !tab?.id) {
    return { ok: false, error: "Open an X / Twitter tab first." }
  }
  try {
    const res = (await chrome.tabs.sendMessage(tab.id, message)) as
      | BridgeResponse
      | undefined
    return res ?? { ok: false, error: "No response from the page." }
  } catch {
    // Content script unreachable — try re-injecting it, then retry once.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ["contents/twitter-bridge.js"] })
      await new Promise(r => setTimeout(r, 300))
      const retry = (await chrome.tabs.sendMessage(tab.id!, message)) as BridgeResponse | undefined
      return retry ?? { ok: false, error: "No response from the page." }
    } catch {
      return { ok: false, error: "Refresh the X tab and try again." }
    }
  }
}

export function readActivePost(platform: Platform): Promise<BridgeResponse> {
  return send({ type: "GET_ACTIVE_TWEET" }, platform)
}

export function insertText(platform: Platform, text: string): Promise<BridgeResponse> {
  return send({ type: "INSERT_TEXT", text }, platform)
}

export function insertImage(platform: Platform, imageDataUrl: string): Promise<BridgeResponse> {
  return send({ type: "INSERT_IMAGE", imageDataUrl }, platform)
}

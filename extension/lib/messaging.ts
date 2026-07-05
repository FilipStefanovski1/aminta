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

function isLinkedInTab(tab: chrome.tabs.Tab | null): boolean {
  return !!tab?.url && /^https:\/\/www\.linkedin\.com\//.test(tab.url)
}

async function send(message: unknown, platform: Platform): Promise<BridgeResponse> {
  const tab = await getActiveTab()
  const onPlatform = platform === "x" ? isXTab(tab) : isLinkedInTab(tab)
  if (!onPlatform || !tab?.id) {
    const name = platform === "x" ? "X / Twitter" : "LinkedIn"
    return { ok: false, error: `Open a ${name} tab first.` }
  }
  try {
    const res = (await chrome.tabs.sendMessage(tab.id, message)) as
      | BridgeResponse
      | undefined
    return res ?? { ok: false, error: "No response from the page." }
  } catch {
    // Content script unreachable — try re-injecting it, then retry once.
    try {
      const file = platform === "x"
        ? "contents/twitter-bridge.js"
        : "contents/linkedin-bridge.js"
      await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: [file] })
      await new Promise(r => setTimeout(r, 300))
      const retry = (await chrome.tabs.sendMessage(tab.id!, message)) as BridgeResponse | undefined
      return retry ?? { ok: false, error: "No response from the page." }
    } catch {
      const name = platform === "x" ? "X" : "LinkedIn"
      return {
        ok: false,
        error: `Refresh the ${name} tab and try again.`,
      }
    }
  }
}

export function readActivePost(platform: Platform): Promise<BridgeResponse> {
  const type = platform === "x" ? "GET_ACTIVE_TWEET" : "GET_ACTIVE_POST"
  return send({ type }, platform)
}

export function insertText(platform: Platform, text: string): Promise<BridgeResponse> {
  return send({ type: "INSERT_TEXT", text }, platform)
}

export function insertImage(platform: Platform, imageDataUrl: string): Promise<BridgeResponse> {
  return send({ type: "INSERT_IMAGE", imageDataUrl }, platform)
}

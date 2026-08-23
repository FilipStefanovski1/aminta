// Typed bridge between the side panel and content scripts on the active tab.

import type { Platform } from "~lib/prompts"

export interface BridgeResponse {
  ok: boolean
  text?: string
  // Media images (pbs.twimg.com/media/...) attached to the same post as
  // `text`, deduped/normalized/capped at 4 by lib/tweetMedia.ts. Only
  // populated by GET_ACTIVE_TWEET — undefined for other message types.
  imageUrls?: string[]
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

// Scans the timeline currently loaded in the active X tab for the next post
// worth replying to — a genuine reply opportunity (see lib/replyTargets.ts
// for the long-term vision), not just the next post in order. Skips ads,
// own posts, empty posts, and anything already picked this session — see
// contents/twitter-bridge.ts — scrolls it into view, and returns its
// text/images the same shape as readActivePost so callers can treat the
// result identically.
export function findNextReplyTarget(platform: Platform): Promise<BridgeResponse> {
  return send({ type: "FIND_NEXT_REPLY_TARGET" }, platform)
}

export function insertText(platform: Platform, text: string): Promise<BridgeResponse> {
  return send({ type: "INSERT_TEXT", text }, platform)
}

export function insertImage(platform: Platform, imageDataUrl: string): Promise<BridgeResponse> {
  return send({ type: "INSERT_IMAGE", imageDataUrl }, platform)
}

// ─── Tab-targeted helpers (thread builder only) ────────────────────────────
// The rest of this file always re-queries "the active tab," which is wrong
// for a multi-step background flow: if the user switches browser tabs while
// a thread draft is being built, `send()` would silently start targeting
// whatever tab is active now instead of the X tab Aminta is actually
// building in. lib/threadBuilder.ts captures a tabId once at the start of a
// build and drives every step against that specific tab via these instead.
// No navigation happens anywhere in this flow — the whole thread is built
// inside X's own native multi-post composer on the page the user is
// already on, so there's no tab-load-waiting helper here anymore.

async function sendToTab(tabId: number, message: unknown): Promise<BridgeResponse> {
  try {
    const res = (await chrome.tabs.sendMessage(tabId, message)) as BridgeResponse | undefined
    return res ?? { ok: false, error: "No response from the page." }
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["contents/twitter-bridge.js"] })
      await new Promise((r) => setTimeout(r, 300))
      const retry = (await chrome.tabs.sendMessage(tabId, message)) as BridgeResponse | undefined
      return retry ?? { ok: false, error: "No response from the page." }
    } catch {
      return { ok: false, error: "Lost connection to the X tab." }
    }
  }
}

/** Opens/focuses a composer and refuses to build on top of an existing draft. */
export function prepareThreadBuild(tabId: number): Promise<BridgeResponse> {
  return sendToTab(tabId, { type: "THREAD_BUILD_PREPARE" })
}

/** Inserts `text` into composer `index`, then re-reads it to confirm the insert actually landed. */
export function insertAndVerifyThreadPost(tabId: number, index: number, text: string): Promise<BridgeResponse> {
  return sendToTab(tabId, { type: "THREAD_BUILD_INSERT_AND_VERIFY", index, text })
}

/**
 * Waits for the USER to click X's own "+" and produce composer `index` —
 * unbounded/user-paced, not a short automatic retry (the user might take a
 * while reviewing the current post first). Also watches composer
 * `previousIndex` (must still contain `previousText`) so a destructive
 * change to the already-verified draft fails fast with a specific reason
 * instead of an opaque timeout.
 */
export function waitForThreadComposerAt(
  tabId: number,
  index: number,
  previousIndex: number,
  previousText: string
): Promise<BridgeResponse> {
  return sendToTab(tabId, { type: "THREAD_BUILD_WAIT_FOR_COMPOSER", index, previousIndex, previousText })
}

/** Interrupts an in-flight waitForThreadComposerAt() call — the user pressed Stop. */
export function stopThreadBuildWait(tabId: number): Promise<BridgeResponse> {
  return sendToTab(tabId, { type: "THREAD_BUILD_STOP" })
}

export async function getActiveXTabId(): Promise<number | null> {
  const tab = await getActiveTab()
  if (!isXTab(tab) || !tab?.id) return null
  return tab.id
}

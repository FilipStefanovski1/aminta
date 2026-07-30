// Centralized "find/reuse/open an X tab" logic. Every action that needs an
// X tab open — "Create with Aminta", onboarding's "open x.com", any future
// one — goes through this file instead of calling chrome.tabs.create()
// directly, so repeated clicks (or several actions in a row) never spawn
// duplicate X tabs.

const X_TAB_URL_PATTERNS = ["https://x.com/*", "https://twitter.com/*"]

// chrome.tabs.Tab.lastAccessed is a real Chrome API field (Chrome 121+); the
// @types/chrome version this project pins doesn't declare it yet, hence the
// narrow cast below rather than augmenting the global chrome types.
type TabWithLastAccessed = chrome.tabs.Tab & { lastAccessed?: number }

async function findExistingXTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: X_TAB_URL_PATTERNS }) as TabWithLastAccessed[]
  if (!tabs.length) return null

  // chrome.tabs.Tab.active is per-WINDOW (true for the frontmost tab of
  // whichever window it's in) — with X tabs open in two or more windows,
  // more than one can report active:true simultaneously, and picking
  // whichever the query happens to return first isn't necessarily the tab
  // the user is actually looking at. Disambiguate by preferring the active
  // tab that's also in the currently-focused window.
  let focusedWindowId: number | undefined
  try {
    focusedWindowId = (await chrome.windows.getLastFocused()).id
  } catch {
    // No window info available (e.g. in a test environment) — fall through
    // to the plain active-tab heuristic below.
  }

  const activeInFocusedWindow = focusedWindowId != null
    ? tabs.find(t => t.active && t.windowId === focusedWindowId)
    : undefined

  return (
    activeInFocusedWindow ??
    tabs.find(t => t.active) ??
    [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
  )
}

async function focusTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {})
  if (tab.id != null) await chrome.tabs.update(tab.id, { active: true }).catch(() => {})
}

// Same re-inject-and-retry-once pattern lib/messaging.ts's send() uses for
// the active-tab case — mirrored here (not shared) since this resolves a
// different target tab (found by query, not "whichever tab is active").
async function sendToTabWithRetry(tabId: number, message: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message)
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["contents/twitter-bridge.js"] })
      await new Promise(r => setTimeout(r, 300))
      await chrome.tabs.sendMessage(tabId, message)
    } catch {
      // Best-effort — if the content script truly can't be reached there's
      // nothing more this helper can safely do.
    }
  }
}

// In-flight guards, keyed by action — repeated rapid clicks on the same
// button await the same in-progress operation instead of racing multiple
// tab lookups/creations against each other.
let openComposerInFlight: Promise<void> | null = null
let focusXTabInFlight: Promise<void> | null = null

// Used by "Create with Aminta" and any future compose-triggering action.
// Reuses an existing X tab and asks its content script to open (or focus)
// the post composer in place — never navigates the tab away from wherever
// the user left it, so an in-progress draft elsewhere on that page is never
// disturbed. Only opens a fresh tab (straight at /compose/post) when no X
// tab exists at all.
export function openXComposer(): Promise<void> {
  if (openComposerInFlight) return openComposerInFlight
  openComposerInFlight = (async () => {
    const existing = await findExistingXTab()
    if (existing?.id != null) {
      await focusTab(existing)
      await sendToTabWithRetry(existing.id, { type: "OPEN_COMPOSER" })
      return
    }
    await chrome.tabs.create({ url: "https://x.com/compose/post" })
  })().finally(() => { openComposerInFlight = null })
  return openComposerInFlight
}

// Used by actions that just want an X tab open/focused, no composer — e.g.
// onboarding's "Or open x.com". Reuses an existing tab instead of always
// creating a new one.
export function focusOrCreateXTab(fallbackUrl = "https://x.com"): Promise<void> {
  if (focusXTabInFlight) return focusXTabInFlight
  focusXTabInFlight = (async () => {
    const existing = await findExistingXTab()
    if (existing) { await focusTab(existing); return }
    await chrome.tabs.create({ url: fallbackUrl })
  })().finally(() => { focusXTabInFlight = null })
  return focusXTabInFlight
}

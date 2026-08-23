// Detects the currently active x.com account from the page DOM. Only
// meaningful inside the twitter-bridge content script, where `document` is
// the actual x.com page — never call this from the side panel.
import type { XIdentity } from "~lib/xIdentity"

// Same left-nav profile-link technique contents/twitter-bridge.ts already
// uses for its own-post reply filter (getOwnHandle) — the one place X
// reliably exposes "who's currently signed in" via a DOM hook, rather than
// scraping arbitrary visible timeline text. Kept as its own copy here
// (not a shared call) so this file stays free of any dependency on the
// content script, and importable in tests without pulling in its
// chrome.runtime.onMessage wiring.
export function getActiveXIdentity(): XIdentity | null {
  const href = document
    .querySelector<HTMLAnchorElement>('a[data-testid="AppTabBar_Profile_Link"]')
    ?.getAttribute("href")
  const handle = href ? href.replace(/^\//, "") : null
  return handle ? { username: handle } : null
}

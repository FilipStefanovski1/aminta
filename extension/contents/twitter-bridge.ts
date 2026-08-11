import type { PlasmoCSConfig } from "plasmo"

import { dispatchGenerate } from "~lib/backendGenerate"
import { resolveAmintaInsertion, type ManagedRegion } from "~lib/composerRegion"
import { shouldUseIncludedAi } from "~lib/entitlements"
import { pickNextReplyTarget, type ReplyPostData } from "~lib/replyTargets"
import { getStore } from "~lib/storage"
import { getOrBuildStyleProfile } from "~lib/styleProfile"
import { processTweetImageUrls } from "~lib/tweetMedia"

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*", "https://twitter.com/*"]
}

const isDev = (() => {
  try { return !("update_url" in chrome.runtime.getManifest()) } catch { return false }
})()

// Finds whichever tweetText node the user is actually replying to — NOT
// just the first tweet on the page. On a thread detail page X stacks the
// whole ancestor chain above the tweet being replied to (root post, then
// each reply down to it), so grabbing nodes[0] always returns the root post
// even when replying to a reply further down. Instead: find the active
// reply composer, then walk backward through every tweetText node to the
// closest one that appears BEFORE it in document order — X always renders
// [ancestor tweets...] -> [tweet being replied to] -> [composer], so the
// nearest preceding tweetText is the correct target regardless of thread
// depth.
//
// `strict`: when true, returns null (never falls back to nodes[0]) if
// `bar`'s composer has no preceding tweetText — that's exactly the signal
// that this bar is a new-post composer rather than a reply. Used by the
// inline toolbar to auto-detect reply context without misfiring on a
// plain "what's happening" box.
function findActiveTweetTextNode(bar?: HTMLElement, strict = false): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'))
  if (!nodes.length) return null

  const composer = findTextAreaWrapper(bar)
  if (composer) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const pos = nodes[i].compareDocumentPosition(composer)
      // DOCUMENT_POSITION_FOLLOWING on `composer` relative to `nodes[i]`
      // means nodes[i] comes before composer in the document.
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return nodes[i]
    }
  } else if (strict) {
    return null
  }

  return strict ? null : nodes[0]
}

function getActiveTweet(): string {
  return findActiveTweetTextNode()?.innerText.trim() ?? ""
}

function getReplyTargetText(bar: HTMLElement): string {
  return findActiveTweetTextNode(bar, true)?.innerText.trim() ?? ""
}

// Images attached to the same tweet as the matched tweetText node — scoped
// to that tweet's <article> so avatars, surrounding posts, and (for a
// reply-with-quote-tweet) anything outside this specific post never leak
// in. A quote-tweet embedded INSIDE this article is treated as part of
// this post's own content, not a "surrounding" post, since it's genuinely
// part of what's being replied to.
function extractTweetImages(textNode: HTMLElement | null): string[] {
  const article = textNode?.closest("article")
  if (!article) return []
  const srcs = Array.from(article.querySelectorAll<HTMLImageElement>("img[src]")).map((img) => img.src)
  return processTweetImageUrls(srcs)
}

function getActiveTweetImages(): string[] {
  return extractTweetImages(findActiveTweetTextNode())
}

// ─── Jump to next reply target ──────────────────────────────────────────────
// Scans the timeline (not just the single active/composer-adjacent tweet
// findActiveTweetTextNode targets) for the next post worth replying to —
// "post worth a reply" is a product concept (see lib/replyTargets.ts for the
// long-term vision), not just "next post." Deterministic, no AI call —
// suitability is decided entirely from data already on the page (author, ad
// label, text length, images).

// Persists only for the lifetime of this content-script injection (i.e. the
// current page load) — resets on navigation/reload, which doubles as a
// natural "new session" boundary. Good enough for "never repeat within the
// same side-panel session" without needing cross-context state plumbing.
const seenReplyTargetIds = new Set<string>()

interface DomReplyCandidate extends ReplyPostData {
  article: HTMLElement
  images: string[]
}

// Own-handle detection. Fragile: relies on the desktop left-nav profile
// link, which may not render in narrow/mobile layouts — if it's absent, the
// own-post filter is simply skipped rather than failing closed.
function getOwnHandle(): string | null {
  const href = document.querySelector<HTMLAnchorElement>('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute("href")
  return href ? href.replace(/^\//, "").toLowerCase() : null
}

// Fragile: X has no stable, documented "this is an ad" attribute. Promoted
// posts render a "Promoted" label in the same slot normal posts use for
// "so-and-so reposted" — socialContext is the closest stable-ish hook, with
// a plain-text fallback scan for layouts where that testid is absent.
function isPromoted(article: HTMLElement): boolean {
  const context = article.querySelector('[data-testid="socialContext"]')?.textContent ?? ""
  if (/promoted/i.test(context)) return true
  const firstLine = article.querySelector('div[dir="ltr"] > span')?.textContent?.trim() ?? ""
  return /^promoted$/i.test(firstLine)
}

// Permalinks are `/<author>/status/<id>` — the one place a tweet's author
// and a stable dedupe id are both available from a single attribute.
function getTweetPermalink(article: HTMLElement): { id: string; author: string } | null {
  const link = article.querySelector<HTMLAnchorElement>('a[role="link"][href*="/status/"]')
  const href = link?.getAttribute("href")
  if (!href) return null
  const m = href.match(/^\/([^/]+)\/status\/(\d+)/)
  return m ? { author: m[1].toLowerCase(), id: m[2] } : null
}

function imagesForArticle(article: HTMLElement | null): string[] {
  if (!article) return []
  const srcs = Array.from(article.querySelectorAll<HTMLImageElement>("img[src]")).map((img) => img.src)
  return processTweetImageUrls(srcs)
}

// DOM scraping only — ad filtering and data extraction. The actual
// eligibility/ordering decision lives in lib/replyTargets.ts (pure, unit
// tested) so it isn't duplicated or left untestable here.
function collectReplyCandidates(): DomReplyCandidate[] {
  const out: DomReplyCandidate[] = []
  for (const article of Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))) {
    if (isPromoted(article)) continue
    const permalink = getTweetPermalink(article)
    if (!permalink) continue
    const text = article.querySelector<HTMLElement>('[data-testid="tweetText"]')?.innerText.trim() ?? ""
    const images = imagesForArticle(article)
    out.push({ article, id: permalink.id, author: permalink.author, text, hasImages: images.length > 0, images })
  }
  return out
}

function highlightArticle(article: HTMLElement) {
  const prev = { outline: article.style.outline, boxShadow: article.style.boxShadow, transition: article.style.transition }
  article.style.transition = "outline 0.15s ease, box-shadow 0.15s ease"
  article.style.outline = "2px solid #74f7b5"
  article.style.boxShadow = "0 0 0 4px rgba(116,247,181,0.25)"
  setTimeout(() => {
    article.style.outline = prev.outline
    article.style.boxShadow = prev.boxShadow
    article.style.transition = prev.transition
  }, 1400)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function findNextReplyTarget(): Promise<{ text: string; imageUrls: string[] } | { error: string }> {
  const ownHandle = getOwnHandle()
  let candidates = collectReplyCandidates()
  let pick = pickNextReplyTarget(candidates, ownHandle, seenReplyTargetIds)

  if (!pick) {
    // Nothing eligible currently loaded — scroll further and give X's
    // virtualized timeline a moment to render more, then retry once.
    window.scrollBy({ top: window.innerHeight * 1.4, behavior: "smooth" })
    await sleep(1200)
    candidates = collectReplyCandidates()
    pick = pickNextReplyTarget(candidates, ownHandle, seenReplyTargetIds)
  }

  if (!pick) {
    return { error: "No good reply opportunities found yet. Scroll a little further and try again." }
  }

  seenReplyTargetIds.add(pick.id)
  const domPick = candidates.find(c => c.id === pick!.id)!
  domPick.article.scrollIntoView({ behavior: "smooth", block: "center" })
  highlightArticle(domPick.article)
  return { text: domPick.text, imageUrls: domPick.images }
}

// ─── Composer open/focus (shared by "Create with Aminta" etc.) ─────────────

function isComposerOpen(): boolean {
  return !!document.querySelector('[data-testid="tweetTextarea_0"]')
}

// Opens X's own compose modal without navigating away from wherever the
// user currently is — preserves any other in-progress draft on the page.
// Fragile: relies on the desktop left-nav "Post" button; if X renames or
// hides it (e.g. narrow layouts), this returns false and the caller's own
// fallback (a fresh tab straight at /compose/post) takes over instead.
function openOrFocusComposer(): boolean {
  if (isComposerOpen()) {
    getComposerBox()?.focus()
    return true
  }
  const newPostBtn = document.querySelector<HTMLElement>('[data-testid="SideNav_NewTweet_Button"]')
  if (newPostBtn) {
    newPostBtn.click()
    return true
  }
  return false
}

async function insertImageIntoComposer(dataUrl: string): Promise<boolean> {
  try {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const ext = blob.type.includes("png") ? "png" : blob.type.includes("gif") ? "gif" : "jpg"
    const file = new File([blob], `aminta-image.${ext}`, { type: blob.type || "image/jpeg" })

    // Strategy 1: find X's hidden file input inside the toolbar
    const toolbar = document.querySelector('[data-testid="toolBar"]')
    const fileInput =
      toolbar?.querySelector<HTMLInputElement>('input[type="file"]') ??
      document.querySelector<HTMLInputElement>('input[type="file"][accept*="image"]')

    if (fileInput) {
      const dt = new DataTransfer()
      dt.items.add(file)
      Object.defineProperty(fileInput, "files", { value: dt.files, configurable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      return true
    }

    // Strategy 2: synthetic paste event on the compose box
    const wrapper = document.querySelector('[data-testid="tweetTextarea_0"]') as HTMLElement | null
    if (!wrapper) return false
    const box = (wrapper.querySelector('[contenteditable="true"]') ?? wrapper) as HTMLElement
    box.focus()
    const dt2 = new DataTransfer()
    dt2.items.add(file)
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt2 as unknown as DataTransfer, bubbles: true, cancelable: true }))
    return true
  } catch {
    return false
  }
}

function findTextAreaWrapper(bar?: HTMLElement): HTMLElement | null {
  // Prefer the textarea in the same compose container as the bar (modal vs
  // sidebar disambiguation). `bar`'s immediate parent is enough for the
  // inline reply composer, but the reply MODAL ("Post your reply" popup)
  // nests the toolbar and the textarea under a shared ancestor a few levels
  // further up — so walk up from the bar looking for the nearest ancestor
  // whose subtree contains a tweetTextarea node, instead of assuming the
  // direct parent is close enough.
  if (bar) {
    let scope: HTMLElement | null = bar.parentElement
    for (let depth = 0; scope && depth < 8; depth++) {
      const relative = scope.querySelector<HTMLElement>('[data-testid^="tweetTextarea_"]')
      if (relative) return relative
      scope = scope.parentElement
    }
  }
  // Fall back: focused composer, then first in DOM
  const focused = document.activeElement?.closest<HTMLElement>('[data-testid^="tweetTextarea_"]')
  return focused ?? document.querySelector<HTMLElement>('[data-testid^="tweetTextarea_"]')
}

// The actual typing surface, not the wrapper — the wrapper also contains
// X's fake placeholder text ("Post your reply") as a real DOM node, which
// would otherwise make an empty composer read as non-empty.
function getComposerBox(bar?: HTMLElement): HTMLElement | null {
  const wrapper = findTextAreaWrapper(bar)
  if (!wrapper) return null
  return (wrapper.querySelector('[contenteditable="true"]') ?? wrapper) as HTMLElement
}

// ─── Aminta-managed region tracking ────────────────────────────────────────
// Generate/Polish/Insert must feel like one editable draft Aminta owns, not
// repeated separate insertions — so Polish (or a second Generate) has to
// REPLACE what Aminta last wrote, never append a second copy, while leaving
// anything the user typed outside that text untouched. Decision logic lives
// in lib/composerRegion.ts (pure, unit-tested); only the DOM-touching parts
// (the WeakMap keyed by the live contenteditable node, and reading its
// current text) live here.
//
// Keyed by the actual contenteditable node, which is stable while a given
// composer stays open. A closed/reopened composer (or a different bar) gets
// a fresh node, so it naturally falls through to "insert normally" — no
// explicit cleanup needed, and nothing here survives a page reload.
const managedRegions = new WeakMap<HTMLElement, ManagedRegion>()

// Public entry point for every Aminta-initiated write into the composer
// (inline bar Generate/Polish, the side panel's Insert button, Templates) —
// replaces the previously tracked Aminta region instead of appending after
// it, then updates tracking to the new region. Falls through to a plain
// full-box insert (today's behavior) the first time, or whenever the
// previous region can no longer be found intact.
function insertAmintaText(newText: string, bar?: HTMLElement): boolean {
  const box = getComposerBox(bar)
  if (!box) return false

  const { fullText, region } = resolveAmintaInsertion(box.innerText, managedRegions.get(box), newText)
  const ok = insertIntoComposer(fullText, bar)
  if (ok) managedRegions.set(box, region)
  return ok
}

function insertIntoComposer(text: string, bar?: HTMLElement): boolean {
  const box = getComposerBox(bar)
  if (!box) return false

  // Focus without triggering blur on the box itself. The Insert button already
  // has mousedown:preventDefault so focus never left the box in that flow.
  // For INSERT_TEXT messages (sidepanel path), we may need to re-focus.
  if (document.activeElement !== box) box.focus()

  // Tell X's internal editor to select all content. We dispatch a real
  // keydown event so X's own keyboard handler updates its selection state,
  // then we also set the DOM selection so they agree.
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  box.dispatchEvent(new KeyboardEvent("keydown", {
    key: "a", code: "KeyA", keyCode: 65,
    bubbles: true, cancelable: true,
    ctrlKey: !isMac, metaKey: isMac,
  }))

  const sel = window.getSelection()
  if (sel) {
    const range = document.createRange()
    range.selectNodeContents(box)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // Dispatch a native paste event carrying the text via DataTransfer.
  //
  // WHY PASTE INSTEAD OF execCommand("insertText"):
  // execCommand fires beforeinput, which X's React editor handles internally.
  // Chrome's execCommand implementation then *also* performs its own DOM
  // mutation regardless of whether X called preventDefault() on beforeinput.
  // Both the React state path and the browser DOM-mutation path run — one
  // inserts, the other inserts again → duplicate text.
  //
  // A paste event has no parallel browser-side DOM mutation path.
  // X's paste handler reads clipboardData.getData('text/plain'), replaces the
  // current selection via its own state management, calls preventDefault(),
  // and React reconciles once. Single insertion, consistent state.
  const dt = new DataTransfer()
  dt.setData("text/plain", text)

  const pasteEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dt as unknown as DataTransfer,
  })

  box.dispatchEvent(pasteEvent)

  // pasteEvent.defaultPrevented is true when X's handler accepted the paste.
  return pasteEvent.defaultPrevented
}

// ─── Recent keywords ──────────────────────────────────────────────────────────

const KEYWORDS_KEY = "amintaRecentKeywords"
const MAX_KEYWORDS = 5

async function loadKeywords(): Promise<string[]> {
  return new Promise(resolve => {
    chrome.storage.local.get(KEYWORDS_KEY, (r) => resolve(r[KEYWORDS_KEY] ?? []))
  })
}

async function saveKeyword(raw: string): Promise<void> {
  const keyword = raw.replace(/\n/g, " ").trim().slice(0, 40)
  if (!keyword) return
  const existing = await loadKeywords()
  const updated  = [keyword, ...existing.filter(k => k !== keyword)].slice(0, MAX_KEYWORDS)
  return new Promise(resolve => chrome.storage.local.set({ [KEYWORDS_KEY]: updated }, resolve))
}

// ─── Compose bar injection ────────────────────────────────────────────────────

const BAR_ATTR = "data-aminta-bar"

function getComposerText(bar?: HTMLElement): string {
  const box = getComposerBox(bar)
  return box ? box.innerText.trim() : ""
}

function setBarStatus(bar: HTMLElement, msg: string, isError = false) {
  const status = bar.querySelector<HTMLSpanElement>(".aminta-status")
  if (status) {
    status.textContent = msg
    // Idle label ("Aminta") stays dim via the container's own inline style;
    // any status we actively set here is feedback the user needs to see, so
    // it must be legible against the dark bar (#555 on #1f1f1f was
    // effectively invisible and made successful generations look like they
    // silently did nothing).
    status.style.color = isError ? "#f87171" : "#74f7b5"
  }
}

async function runGenerate(bar: HTMLElement, mode: "tweet" | "polish", prefill?: string) {
  const store = await getStore()
  if (!store.apiKey && !shouldUseIncludedAi(store)) { setBarStatus(bar, "No API key. Open Aminta Settings", true); return }
  if (!store.voice)  { setBarStatus(bar, "Train Aminta first", true); return }

  const composerText = getComposerText(bar)

  // Reply auto-detection: if Generate is clicked with nothing typed and no
  // keyword chip selected, and this bar's composer sits right under a tweet
  // (i.e. it's a reply box, not the "what's happening" box), use that
  // tweet as context and write an actual reply instead of a generic post.
  const replyTarget = mode === "tweet" && !composerText && !prefill ? getReplyTargetText(bar) : ""
  const isReply = !!replyTarget

  let input = ""
  let promptMode: "tweet" | "reply" | "polish" = mode
  if (mode === "polish") {
    input = composerText
    if (!input) { setBarStatus(bar, "Type a draft first", true); return }
  } else if (isReply) {
    promptMode = "reply"
    input = replyTarget
  } else {
    input = prefill ?? composerText
  }

  setBarStatus(bar, "Thinking…")
  bar.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = true })

  try {
    const styleProfile = await getOrBuildStyleProfile(store)
    const text = await dispatchGenerate(store, {
      generationMode: promptMode,
      input: input || "Write a compelling tweet about my niche",
      voice: store.voice,
      styleProfile,
      tone: "direct",
      length: "medium",
    })

    const inserted = insertAmintaText(text, bar)
    if (inserted) {
      setBarStatus(bar, "Inserted ✦", false)
      if (mode === "tweet" && input && !isReply) {
        saveKeyword(input).then(() => renderKeywords(bar))
      }
    } else {
      // Composer wasn't reachable (e.g. focus moved away) — clipboard is
      // the fallback, not the default path.
      navigator.clipboard.writeText(text).then(() => {
        setBarStatus(bar, "Copied ✦, paste with ⌘V", false)
        if (mode === "tweet" && input && !isReply) {
          saveKeyword(input).then(() => renderKeywords(bar))
        }
      }).catch(() => {
        setBarStatus(bar, "Done. Use Aminta sidebar to insert", false)
      })
    }
  } catch (e) {
    setBarStatus(bar, e instanceof Error ? e.message : "Error", true)
  } finally {
    bar.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = false })
  }
}

function truncate(s: string, max = 18): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…"
}

async function renderKeywords(bar: HTMLElement) {
  const container = bar.querySelector<HTMLElement>(".aminta-keywords")
  if (!container) return
  const keywords = await loadKeywords()
  container.innerHTML = ""
  keywords.forEach(kw => {
    const chip = document.createElement("button")
    chip.textContent = truncate(kw)
    chip.title = kw
    chip.style.cssText = [
      "background:#1a1f2e",
      "color:#74f7b5",
      "border:1px solid #252a38",
      "border-radius:5px",
      "padding:3px 7px",
      "font-family:'Press Start 2P',monospace",
      "font-size:6px",
      "cursor:pointer",
      "white-space:nowrap",
      "opacity:0.75",
      "transition:opacity 0.1s,border-color 0.1s",
      "flex-shrink:0",
    ].join(";")
    chip.onmouseenter = () => { chip.style.opacity = "1"; chip.style.borderColor = "#74f7b5" }
    chip.onmouseleave = () => { chip.style.opacity = "0.75"; chip.style.borderColor = "#252a38" }
    chip.addEventListener("mousedown", e => e.preventDefault())
    chip.onclick = () => { runGenerate(bar, "tweet", kw) }
    container.appendChild(chip)
  })
}

function buildBar(): HTMLElement {
  const bar = document.createElement("div")
  bar.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:6px",
    "padding:5px 8px",
    "margin-top:6px",
    "background:#1f1f1f",
    "border:1px solid #343438",
    "border-radius:10px",
    "font-family:'Press Start 2P',monospace",
    "font-size:7px",
    "line-height:1",
    "z-index:999",
    "overflow:hidden",
  ].join(";")

  const makeBtn = (label: string, onClick: () => void, accent = true) => {
    const btn = document.createElement("button")
    btn.textContent = label
    btn.style.cssText = [
      accent ? "background:#74f7b5" : "background:#1a1f2e",
      accent ? "color:#000"        : "color:#74f7b5",
      "border:2px solid #000",
      "box-shadow:2px 2px 0 #000",
      "border-radius:6px",
      "padding:4px 10px",
      "font-family:'Press Start 2P',monospace",
      "font-size:7px",
      "line-height:1",
      "height:24px",
      "cursor:pointer",
      "transition:transform 0.08s,box-shadow 0.08s",
      "white-space:nowrap",
      "flex-shrink:0",
      "display:inline-flex",
      "align-items:center",
    ].join(";")
    btn.onmousedown = () => { btn.style.transform = "translate(1px,1px)"; btn.style.boxShadow = "1px 1px 0 #000" }
    btn.onmouseup   = () => { btn.style.transform = ""; btn.style.boxShadow = "2px 2px 0 #000" }
    btn.onclick = onClick
    return btn
  }

  // Divider between action buttons and keyword chips
  const divider = document.createElement("div")
  divider.style.cssText = "width:1px;height:14px;background:#252a38;flex-shrink:0"

  // Keyword chips container — scrollable row
  const keywords = document.createElement("div")
  keywords.className = "aminta-keywords"
  keywords.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:5px",
    "flex:1",
    "overflow-x:auto",
    "scrollbar-width:none",
    "-ms-overflow-style:none",
  ].join(";")

  const status = document.createElement("span")
  status.className = "aminta-status"
  status.style.cssText = [
    "color:#444",
    "margin-left:auto",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "flex-shrink:0",
  ].join(";")
  status.textContent = "Aminta"

  const generateBtn = makeBtn("⚄ Generate", () => runGenerate(bar, "tweet"))
  const polishBtn   = makeBtn("+ Polish",   () => runGenerate(bar, "polish"), false)

  bar.append(generateBtn, polishBtn, divider, keywords, status)

  // Load keywords async after bar is built
  renderKeywords(bar)

  return bar
}

function injectBar(toolbar: Element) {
  // Check if this specific toolbar already has our bar injected right after it
  const next = toolbar.nextElementSibling as HTMLElement | null
  if (next?.hasAttribute(BAR_ATTR)) return
  const bar = buildBar()
  bar.setAttribute(BAR_ATTR, "1")
  toolbar.parentElement?.insertBefore(bar, toolbar.nextSibling)
}

function removeBar() {
  document.querySelectorAll(`[${BAR_ATTR}]`).forEach(el => el.remove())
}

let observerActive = false

function startObserver() {
  if (observerActive) return
  observerActive = true

  const obs = new MutationObserver(() => {
    const toolbars = document.querySelectorAll('[data-testid="toolBar"]')
    if (toolbars.length) toolbars.forEach(injectBar)
    else removeBar()
  })

  obs.observe(document.body, { childList: true, subtree: true })

  document.querySelectorAll('[data-testid="toolBar"]').forEach(injectBar)
}

startObserver()

// ─── Publish detection relay ───────────────────────────────────────────────────
// twitter-publish-detector.ts runs in the MAIN world (no chrome.* access) and
// posts a message here when it confirms a real X post went out. This script
// runs ISOLATED on the same page, so it can see that postMessage and hand it
// off to the extension via chrome.runtime — but only after validating every
// field, since MAIN-world messages are still just page-originated data.
window.addEventListener("message", (event) => {
  if (event.source !== window) return
  if (event.origin !== window.location.origin) return
  if (event.data?.source !== "aminta-publish-detector") return
  if (event.data?.type !== "AMINTA_TWEET_PUBLISHED") return

  chrome.runtime.sendMessage({ type: "AMINTA_POST_PUBLISHED", ts: event.data.ts }).catch(() => {})
})

// ─── Extension message handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_ACTIVE_TWEET") {
    const text = getActiveTweet()
    const imageUrls = getActiveTweetImages()
    if (isDev) console.log("[Aminta] GET_ACTIVE_TWEET — detected images:", imageUrls.length)
    // An image-only post (meme, screenshot) has no caption text but is
    // still a valid pull — only fail when we found neither.
    sendResponse(text || imageUrls.length > 0
      ? { ok: true, text, imageUrls }
      : { ok: false, error: "No tweet found on screen. Scroll a tweet into view, or paste it manually." }
    )
    return true
  }

  if (msg?.type === "INSERT_TEXT") {
    const ok = insertAmintaText(msg.text)
    sendResponse(ok
      ? { ok: true }
      : { ok: false, error: "Couldn't insert. Click inside the X compose box first, then try again." }
    )
    return true
  }

  if (msg?.type === "INSERT_IMAGE") {
    insertImageIntoComposer(msg.imageDataUrl).then((ok) => {
      sendResponse(ok
        ? { ok: true }
        : { ok: false, error: "Couldn't attach image. Make sure the X composer is open." }
      )
    })
    return true
  }

  if (msg?.type === "FIND_NEXT_REPLY_TARGET") {
    findNextReplyTarget().then((res) => {
      sendResponse("error" in res
        ? { ok: false, error: res.error }
        : { ok: true, text: res.text, imageUrls: res.imageUrls }
      )
    })
    return true
  }

  if (msg?.type === "OPEN_COMPOSER") {
    sendResponse({ ok: openOrFocusComposer() })
    return true
  }

  return false
})

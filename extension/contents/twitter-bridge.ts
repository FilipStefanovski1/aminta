import type { PlasmoCSConfig } from "plasmo"

import { dispatchGenerate } from "~lib/backendGenerate"
import {
  COMPOSER_BAR_ATTR,
  COMPOSER_BAR_VERSION,
  DEFAULT_COMPOSER_LENGTH,
  DEFAULT_COMPOSER_TONE,
  buildActionStrip,
  isAmintaBar,
  isCurrentBar,
  presetInstruction,
  resolveComposerLength,
  resolveComposerTone,
  type ComposerPresetId,
  type ComposerStripState,
} from "~lib/composerPresets"
import { resolveAmintaInsertion, type ManagedRegion } from "~lib/composerRegion"
import { effectiveApiKey, shouldUseIncludedAi } from "~lib/entitlements"
import { addMeme, deleteMeme, listMemes, rankMemesByTags, type MemeRecord } from "~lib/memeLibrary"
import { pickNextReplyTarget, type ReplyPostData } from "~lib/replyTargets"
import { getStore } from "~lib/storage"
import { getOrBuildStyleProfile } from "~lib/styleProfile"
import { assertActiveXAccountMatchesConnectedAccount } from "~lib/xAccountGuard"
import {
  debugSnapshotComposer,
  getActiveXComposer,
  insertAndVerifyThreadPost,
  readThreadComposerText,
  waitForNextComposerOrRegression,
  waitForThreadComposerAt,
} from "~lib/threadComposerDom"
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

// Same detection Generate's own reply-auto-detect already relies on (a
// preceding tweetText node in strict mode) — reused here purely to decide
// whether THIS bar should show the Meme pill at all. Never used to change
// what Generate/Polish do.
function isReplyComposer(bar: HTMLElement): boolean {
  return !!findActiveTweetTextNode(bar, true)
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

// X's reply/repost/like/view action bar renders as one `role="group"` with
// an aria-label like "12 replies, 3 reposts, 456 likes, 7,890 views" (exact
// counts, for accessibility — the visible spans are abbreviated, "1.2K",
// which is why this reads the label instead). Best-effort only: a ranking
// signal, never required — undefined (not 0) when unparseable, so a post
// with genuinely no engagement data never looks artificially unpopular.
function engagementForArticle(article: HTMLElement): { likeCount?: number; replyCount?: number } {
  const label = article.querySelector('[role="group"][aria-label]')?.getAttribute("aria-label") ?? ""
  const parse = (re: RegExp) => {
    const m = label.match(re)
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : undefined
  }
  return {
    replyCount: parse(/([\d,]+)\s*repl/i),
    likeCount: parse(/([\d,]+)\s*like/i),
  }
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
    const engagement = engagementForArticle(article)
    out.push({ article, id: permalink.id, author: permalink.author, text, hasImages: images.length > 0, images, ...engagement })
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

// Topics come straight from the user's existing Aminta DNA (Train's Topics
// field) — no separate scoring config, and nothing new for the user to set
// up. Absent entirely when there are no topics yet; rankReplyTargets()
// already degrades cleanly to conversation-potential/engagement/position
// alone in that case.
async function getUserTopics(): Promise<string[]> {
  const store = await getStore()
  return (store.voice?.niche ?? "").split(",").map((t) => t.trim()).filter(Boolean)
}

async function findNextReplyTarget(): Promise<{ text: string; imageUrls: string[]; reason: string } | { error: string }> {
  const ownHandle = getOwnHandle()
  const topics = await getUserTopics()
  let candidates = collectReplyCandidates()
  let pick = pickNextReplyTarget(candidates, ownHandle, seenReplyTargetIds, topics)

  if (!pick) {
    // Nothing eligible currently loaded — scroll further and give X's
    // virtualized timeline a moment to render more, then retry once.
    window.scrollBy({ top: window.innerHeight * 1.4, behavior: "smooth" })
    await sleep(1200)
    candidates = collectReplyCandidates()
    pick = pickNextReplyTarget(candidates, ownHandle, seenReplyTargetIds, topics)
  }

  if (!pick) {
    return { error: "No good reply opportunities found yet. Scroll a little further and try again." }
  }

  seenReplyTargetIds.add(pick.post.id)
  const domPick = candidates.find(c => c.id === pick!.post.id)!
  domPick.article.scrollIntoView({ behavior: "smooth", block: "center" })
  highlightArticle(domPick.article)
  return { text: domPick.text, imageUrls: domPick.images, reason: pick.reason }
}

// ─── Composer open/focus (shared by "Create with Aminta" etc.) ─────────────

// Opens X's own compose modal without navigating away from wherever the
// user currently is — preserves any other in-progress draft on the page.
// Fragile: relies on the desktop left-nav "Post" button; if X renames or
// hides it (e.g. narrow layouts), this returns false and the caller's own
// fallback (a fresh tab straight at /compose/post) takes over instead.
function openOrFocusComposer(): boolean {
  const existing = getActiveXComposer(0)
  if (existing) {
    existing.focus()
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

// ─── Thread builder: X's NATIVE multi-post thread composer ──────────────
// Builds the complete thread as a DRAFT inside X's own thread composer —
// Aminta inserts post 1, then the USER clicks X's own "+" (add another
// post) themselves; Aminta detects the composer that produces and inserts
// post 2 into it, and so on. Aminta never clicks "+" or the final Post/
// Post-all button itself — see lib/threadBuilder.ts's file-header comment
// for why "+" is a user action now. See lib/threadBuilder.ts for the
// orchestrating state machine and lib/threadComposerDom.ts for the DOM
// reading/writing this wires up (centralized + independently testable
// there).

// Set true by THREAD_BUILD_STOP (the user pressed Stop while
// THREAD_BUILD_WAIT_FOR_COMPOSER was polling for their "+" click), reset by
// THREAD_BUILD_PREPARE at the start of a build. Module-level rather than
// threaded through every message because the wait it interrupts is a
// long-running, user-paced poll already in flight when Stop is pressed —
// there's no other channel back into that poll's closure.
let threadBuildCancelled = false

// Opens/focuses a composer and refuses to build a thread on top of an
// existing draft — never silently erases what the user already typed.
async function prepareThreadBuild(): Promise<{ ok: boolean; error?: string }> {
  const opened = openOrFocusComposer()
  if (isDev) console.log("[Aminta thread] prepare — openOrFocusComposer:", opened, debugSnapshotComposer(0))
  if (!opened) return { ok: false, error: "composer_not_found" }
  const ready = await waitForThreadComposerAt(0)
  if (isDev) console.log("[Aminta thread] prepare — waited for composer 0:", ready, debugSnapshotComposer(0))
  if (!ready) return { ok: false, error: "composer_not_found" }
  const current = readThreadComposerText(0)
  if (current && current.trim().length > 0) return { ok: false, error: "composer_not_clean" }
  return { ok: true }
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

const BAR_ATTR = COMPOSER_BAR_ATTR

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

// Per-composer strip state. Keyed on the bar element so two open composers
// (e.g. the main box and a reply) keep independent selections.
const stripState = new WeakMap<HTMLElement, ComposerStripState>()

function getStripState(bar: HTMLElement): ComposerStripState {
  return stripState.get(bar) ?? { preset: null, length: DEFAULT_COMPOSER_LENGTH, tone: DEFAULT_COMPOSER_TONE }
}

async function runGenerate(bar: HTMLElement, mode: "tweet" | "polish", prefill?: string) {
  const store = await getStore()
  if (!effectiveApiKey(store) && !shouldUseIncludedAi(store)) { setBarStatus(bar, "No API key. Open Aminta Settings", true); return }
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

  const state = getStripState(bar)

  setBarStatus(bar, "Thinking…")
  bar.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = true })

  try {
    const styleProfile = await getOrBuildStyleProfile(store)
    const text = await dispatchGenerate(store, {
      generationMode: promptMode,
      input: input || "Write a compelling tweet about my niche",
      voice: store.voice,
      styleProfile,
      tone: resolveComposerTone(state.tone),
      length: resolveComposerLength(state.length),
      // Preset intent (News/Product) rides the existing templateInstruction
      // seam — shape only; Voice/Instincts still win. Polish keeps its own
      // framing, so no preset is applied there.
      templateInstruction: mode === "polish" ? undefined : presetInstruction(state.preset),
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

// ─── Meme Reply ─────────────────────────────────────────────────────────
// Personal, local meme library (lib/memeLibrary.ts, IndexedDB) + a caption
// step that reuses the exact same generation pipeline as every other
// composer action. Opening the popover, browsing, uploading, and deleting
// are all pure local operations — 0 credits, no AI call. Only picking a
// meme to generate a caption for is a real generation (generationMode
// "reply", the existing reply cost — see runMemeCaption below).
//
// Popovers are appended to document.body with position:fixed rather than
// nested inside the bar, so they can never be clipped by any overflow:
// hidden ancestor in X's own composer chrome.

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read image."))
    reader.readAsDataURL(blob)
  })
}

// Never posts anything itself — returns the caption text for the caller to
// preview and the user to explicitly confirm inserting.
async function runMemeCaption(bar: HTMLElement, meme: MemeRecord): Promise<string> {
  const store = await getStore()
  if (!effectiveApiKey(store) && !shouldUseIncludedAi(store)) throw new Error("No API key. Open Aminta Settings")
  if (!store.voice) throw new Error("Train Aminta first")

  const replyTarget = getReplyTargetText(bar)
  const state = getStripState(bar)
  const styleProfile = await getOrBuildStyleProfile(store)

  const captionInstruction = [
    "Write a short caption to accompany a meme reply. The meme image itself carries most of the joke, so this caption should be brief and complementary — not an explanation of the meme, not a restatement of it.",
    meme.name ? `The meme is: "${meme.name}".` : "",
    meme.tags.length ? `Its vibe/tags: ${meme.tags.join(", ")}.` : "",
  ].filter(Boolean).join(" ")

  // Same pipeline, same cost as a normal reply generation — reusing
  // generationMode "reply" rather than inventing a new mode/price.
  return dispatchGenerate(store, {
    generationMode: "reply",
    input: replyTarget || "Write a short, funny reply caption.",
    voice: store.voice,
    styleProfile,
    tone: resolveComposerTone(state.tone),
    length: "short",
    templateInstruction: captionInstruction,
  })
}

let closeMemeUI: (() => void) | null = null
function closeMemePopovers() {
  closeMemeUI?.()
  closeMemeUI = null
}

function memePanelBase(rect: DOMRect): HTMLDivElement {
  const panel = document.createElement("div")
  panel.style.cssText = [
    "position:fixed",
    `top:${rect.bottom + 6}px`,
    `left:${rect.left}px`,
    "width:264px",
    "background:#17171a",
    "border:1px solid #2b2b30",
    "border-radius:10px",
    "padding:8px",
    "z-index:2147483000",
    "box-shadow:0 4px 16px rgba(0,0,0,0.4)",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
    "color:#e5e5ea",
  ].join(";")
  return panel
}

function memeSmallBtn(label: string, accent = "#8e919a"): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.textContent = label
  btn.style.cssText = `font-size:10.5px;font-weight:600;color:${accent};background:transparent;border:1px solid #2b2b30;border-radius:6px;padding:5px 9px;cursor:pointer`
  btn.addEventListener("mousedown", (e) => e.preventDefault())
  return btn
}

/** Preview step: shows the meme + generated caption, lets the user insert, regenerate, or cancel. Insert is the ONLY thing that ever touches the composer. */
function openMemeCaptionPreview(bar: HTMLElement, anchorRect: DOMRect, meme: MemeRecord) {
  closeMemePopovers()
  const panel = memePanelBase(anchorRect)

  const img = document.createElement("img")
  img.style.cssText = "width:100%;max-height:140px;object-fit:cover;border-radius:7px;display:block;margin-bottom:8px"
  img.src = URL.createObjectURL(meme.blob)
  panel.appendChild(img)

  const status = document.createElement("p")
  status.style.cssText = "font-size:11px;color:#8e919a;margin:0 0 8px"
  status.textContent = "Writing a caption…"
  panel.appendChild(status)

  const caption = document.createElement("textarea")
  caption.rows = 3
  caption.style.cssText = "width:100%;box-sizing:border-box;background:#111;border:1px solid #2b2b30;border-radius:7px;color:#e5e5ea;font-size:12px;padding:6px;resize:none;display:none;margin-bottom:8px"
  panel.appendChild(caption)

  const actions = document.createElement("div")
  actions.style.cssText = "display:flex;gap:6px;justify-content:flex-end"
  const cancelBtn = memeSmallBtn("Cancel")
  const regenBtn = memeSmallBtn("Regenerate")
  const insertBtn = memeSmallBtn("Insert", ACCENT_MEME)
  regenBtn.style.display = "none"
  insertBtn.style.display = "none"
  actions.append(cancelBtn, regenBtn, insertBtn)
  panel.appendChild(actions)

  const close = () => {
    panel.remove()
    document.removeEventListener("mousedown", onOutside, true)
    document.removeEventListener("keydown", onKey, true)
    closeMemeUI = null
  }
  const onOutside = (e: MouseEvent) => { if (!panel.contains(e.target as Node)) close() }
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
  document.addEventListener("mousedown", onOutside, true)
  document.addEventListener("keydown", onKey, true)
  closeMemeUI = close

  cancelBtn.onclick = close

  async function generate() {
    status.textContent = "Writing a caption…"
    status.style.display = "block"
    caption.style.display = "none"
    regenBtn.style.display = "none"
    insertBtn.style.display = "none"
    try {
      const text = await runMemeCaption(bar, meme)
      caption.value = text
      status.style.display = "none"
      caption.style.display = "block"
      regenBtn.style.display = ""
      insertBtn.style.display = ""
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : "Couldn't write a caption."
    }
  }
  regenBtn.onclick = generate
  document.body.appendChild(panel)
  generate()

  // The one action that actually touches the composer — user-confirmed,
  // never automatic. Never clicks X's own Post/Reply button.
  insertBtn.onclick = async () => {
    const dataUrl = await blobToDataUrl(meme.blob)
    await insertImageIntoComposer(dataUrl)
    if (caption.value.trim()) insertAmintaText(caption.value.trim(), bar)
    close()
  }
}

const ACCENT_MEME = "#fb923c"

function openMemePopover(bar: HTMLElement) {
  closeMemePopovers()
  const anchor = bar.querySelector<HTMLElement>('[data-aminta-action="meme"]')
  const rect = (anchor ?? bar).getBoundingClientRect()
  const panel = memePanelBase(rect)

  const header = document.createElement("div")
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:7px"
  const title = document.createElement("span")
  title.textContent = "Meme library"
  title.style.cssText = "font-size:11.5px;font-weight:600"
  const uploadBtn = memeSmallBtn("+ Upload", ACCENT_MEME)
  header.append(title, uploadBtn)
  panel.appendChild(header)

  const fileInput = document.createElement("input")
  fileInput.type = "file"
  fileInput.accept = "image/*"
  fileInput.style.display = "none"
  panel.appendChild(fileInput)
  uploadBtn.onclick = () => fileInput.click()
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    await addMeme({ blob: file })
    fileInput.value = ""
    renderGrid()
  }

  const grid = document.createElement("div")
  grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:260px;overflow-y:auto"
  panel.appendChild(grid)

  const empty = document.createElement("p")
  empty.textContent = "No memes saved yet — upload one to get started."
  empty.style.cssText = "font-size:10.5px;color:#8e919a;margin:4px 0 0"

  async function renderGrid() {
    grid.innerHTML = ""
    empty.remove()
    const memes = await listMemes()
    if (!memes.length) { panel.appendChild(empty); return }

    // Zero-AI local prefilter: best matches (by tag overlap with the post
    // being replied to) sort first — browsing this order still costs 0.
    const ranked = rankMemesByTags(memes, getReplyTargetText(bar))
    for (const meme of ranked) {
      const cell = document.createElement("div")
      cell.style.cssText = "position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;cursor:pointer;background:#111;border:1px solid #2b2b30"
      cell.title = meme.name || meme.tags.join(", ") || "Use this meme"

      const img = document.createElement("img")
      img.src = URL.createObjectURL(meme.blob)
      img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block"
      cell.appendChild(img)

      const del = document.createElement("button")
      del.type = "button"
      del.textContent = "✕"
      del.title = "Delete meme"
      del.style.cssText = "position:absolute;top:2px;right:2px;width:16px;height:16px;line-height:1;font-size:9px;border-radius:4px;background:rgba(0,0,0,0.65);color:#f87171;border:none;cursor:pointer"
      del.addEventListener("mousedown", (e) => e.stopPropagation())
      del.onclick = async (e) => { e.stopPropagation(); await deleteMeme(meme.id); renderGrid() }
      cell.appendChild(del)

      cell.addEventListener("mousedown", (e) => e.preventDefault())
      cell.onclick = () => { closeMemePopovers(); openMemeCaptionPreview(bar, rect, meme) }
      grid.appendChild(cell)
    }
  }
  renderGrid()

  document.body.appendChild(panel)

  const close = () => {
    panel.remove()
    document.removeEventListener("mousedown", onOutside, true)
    document.removeEventListener("keydown", onKey, true)
    closeMemeUI = null
  }
  const onOutside = (e: MouseEvent) => { if (!panel.contains(e.target as Node) && e.target !== anchor) close() }
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
  document.addEventListener("mousedown", onOutside, true)
  document.addEventListener("keydown", onKey, true)
  closeMemeUI = close
}

// ─── DEV-ONLY composer lifecycle diagnostics ──────────────────────────────
// jsdom unit tests (lib/composerPresets.test.ts) prove the action strip's
// own click/dropdown wiring works in isolation, but they can't prove X's
// own DOM churn doesn't tear our bar out from under it — e.g. if X
// re-renders the toolbar's parent and our inserted bar gets removed along
// with it, injectBar mints a brand-new `bar` element, which is a brand-new
// WeakMap key for stripState, silently resetting News/Product/tone/length
// selections. This block traces that real lifecycle on x.com; every line
// is gated on isDev (true only for an unpacked/dev build — see isDev
// above), so it is completely inert in the packaged production build.
let barDebugSeq = 0
const trackedBars: Map<string, HTMLElement> | null = isDev ? new Map() : null

function nextBarDebugId(): string {
  return `b${++barDebugSeq}`
}

function logComposer(...args: unknown[]) {
  if (isDev) console.log("[Aminta composer]", ...args)
}

// Called at the top of every observer pass — catches a bar that was torn
// out of the DOM by X's own re-render (not by removeBar/injectBar
// themselves), which is exactly the "state silently reset" failure mode
// under investigation.
function checkForDisconnectedBars() {
  if (!trackedBars) return
  for (const [id, el] of trackedBars) {
    if (!el.isConnected) {
      logComposer(`bar disconnected (removed from DOM by something other than Aminta) ${id}`)
      trackedBars.delete(id)
    }
  }
}

function buildBar(debugId: string): HTMLElement {
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
    // The action strip is normal UI text, not the retro pixel treatment —
    // keyword chips below still set the pixel font explicitly for themselves.
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
    "font-size:11px",
    "line-height:1",
    "z-index:999",
    "overflow:hidden",
    "flex-wrap:nowrap",
    "min-width:0",
  ].join(";")

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
    "flex-shrink:0",
    "max-width:38%",
    "overflow-x:auto",
    "scrollbar-width:none",
    "-ms-overflow-style:none",
  ].join(";")

  const status = document.createElement("span")
  status.className = "aminta-status"
  status.style.cssText = [
    "color:#8e919a",
    "font-size:10px",
    "margin-left:auto",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "flex-shrink:0",
    // Without a cap, a long message (e.g. the connectivity-error string)
    // has no width to ellipsize against — flex-shrink:0 alone just lets it
    // claim however much space its full text needs, squeezing the action
    // strip's own flex:1 box down to a sliver and making Generate/Polish/
    // News look like they've been shoved out of view or overlapped. Capping
    // the width here is what makes the existing text-overflow:ellipsis
    // above actually do anything.
    "max-width:140px",
  ].join(";")
  status.textContent = "Aminta"

  // Action strip (Generate / Polish / News / Product / You / Length, +Meme
  // in reply composers). Fully re-rendered on each state change so active
  // pills stay in sync; selecting a preset, tone, or length never triggers
  // a generation, so this costs nothing. Meme is only offered at all when
  // this bar is a reply composer (see isReplyComposer) — never on a
  // top-level post.
  const renderStrip = () => {
    const state = getStripState(bar)
    logComposer(`render strip ${debugId}`, state)
    const current = bar.querySelector(".aminta-actions")
    const next = buildActionStrip(state, {
      onGenerate: () => { logComposer(`click Generate ${debugId}`); runGenerate(bar, "tweet") },
      onPolish: () => { logComposer(`click Polish ${debugId}`); runGenerate(bar, "polish") },
      onPreset: (preset: ComposerPresetId | null) => {
        logComposer(`click preset=${preset} ${debugId}`)
        stripState.set(bar, { ...getStripState(bar), preset })
        renderStrip()
      },
      onLength: (length) => {
        logComposer(`click length=${length} ${debugId}`)
        stripState.set(bar, { ...getStripState(bar), length })
        renderStrip()
      },
      onTone: (tone) => {
        logComposer(`click tone=${tone} ${debugId}`)
        stripState.set(bar, { ...getStripState(bar), tone })
        renderStrip()
      },
      ...(isReplyComposer(bar) ? { onOpenMeme: () => { logComposer(`click Meme ${debugId}`); openMemePopover(bar) } } : {}),
    })
    if (current) current.replaceWith(next)
    else bar.insertBefore(next, bar.firstChild)
  }
  renderStrip()

  bar.append(divider, keywords, status)

  // Load keywords async after bar is built
  renderKeywords(bar)

  return bar
}

function injectBar(toolbar: Element) {
  const next = toolbar.nextElementSibling as HTMLElement | null

  // Already carrying THIS build's bar — nothing to do.
  if (isCurrentBar(next)) {
    if (isDev) logComposer(`toolbar seen -> already current bar ${next?.dataset.aminataDebugId ?? "(no id)"}`)
    return
  }

  // A bar from a previous build (extension reloaded without refreshing the
  // tab). It must be removed rather than treated as "already injected",
  // otherwise the old markup wins permanently and this build's bar can never
  // mount. See COMPOSER_BAR_VERSION.
  const replacedId = isDev ? next?.dataset.aminataDebugId : undefined
  if (isAmintaBar(next)) next?.remove()
  if (isDev && replacedId && trackedBars) trackedBars.delete(replacedId)

  const debugId = isDev ? nextBarDebugId() : ""
  const bar = buildBar(debugId)
  bar.setAttribute(BAR_ATTR, COMPOSER_BAR_VERSION)
  if (isDev) {
    bar.dataset.aminataDebugId = debugId
    trackedBars?.set(debugId, bar)
    logComposer(replacedId
      ? `toolbar seen -> replaced stale/torn-out bar ${replacedId} with new bar ${debugId}`
      : `toolbar seen -> injected new bar ${debugId}`)
  }
  toolbar.parentElement?.insertBefore(bar, toolbar.nextSibling)
}

function removeBar() {
  document.querySelectorAll(`[${BAR_ATTR}]`).forEach(el => {
    if (isDev) {
      const id = (el as HTMLElement).dataset.aminataDebugId
      if (id) { logComposer(`bar removed (no toolbar present anymore) ${id}`); trackedBars?.delete(id) }
    }
    el.remove()
  })
}

let observerActive = false

function startObserver() {
  if (observerActive) return
  observerActive = true

  const obs = new MutationObserver(() => {
    if (isDev) checkForDisconnectedBars()
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
    assertActiveXAccountMatchesConnectedAccount().then((check) => {
      if (!check.ok) { sendResponse({ ok: false, error: check.error }); return }
      const ok = insertAmintaText(msg.text)
      sendResponse(ok
        ? { ok: true }
        : { ok: false, error: "Couldn't insert. Click inside the X compose box first, then try again." }
      )
    })
    return true
  }

  if (msg?.type === "INSERT_IMAGE") {
    assertActiveXAccountMatchesConnectedAccount().then((check) => {
      if (!check.ok) { sendResponse({ ok: false, error: check.error }); return }
      insertImageIntoComposer(msg.imageDataUrl).then((ok) => {
        sendResponse(ok
          ? { ok: true }
          : { ok: false, error: "Couldn't attach image. Make sure the X composer is open." }
        )
      })
    })
    return true
  }

  if (msg?.type === "FIND_NEXT_REPLY_TARGET") {
    findNextReplyTarget().then((res) => {
      sendResponse("error" in res
        ? { ok: false, error: res.error }
        : { ok: true, text: res.text, imageUrls: res.imageUrls, reason: res.reason }
      )
    })
    return true
  }

  if (msg?.type === "OPEN_COMPOSER") {
    sendResponse({ ok: openOrFocusComposer() })
    return true
  }

  // ── Thread builder (extension/lib/threadBuilder.ts) — builds the full
  // thread as a DRAFT inside X's own native multi-post composer. Aminta
  // inserts each post and verifies it; "+" (add another post) is the USER's
  // own click — Aminta only waits for the composer it produces and never
  // clicks it, or Post/Post-all, itself. See extension/lib/threadComposerDom.ts
  // for the DOM this relies on.

  if (msg?.type === "THREAD_BUILD_PREPARE") {
    assertActiveXAccountMatchesConnectedAccount().then((check) => {
      if (!check.ok) { sendResponse({ ok: false, error: check.error }); return }
      threadBuildCancelled = false
      prepareThreadBuild().then(sendResponse)
    })
    return true
  }

  if (msg?.type === "THREAD_BUILD_INSERT_AND_VERIFY") {
    assertActiveXAccountMatchesConnectedAccount().then((check) => {
      if (!check.ok) { sendResponse({ ok: false, error: check.error }); return }
      // Dev-only diagnostic for the active-composer false-positive class of
      // bug: structural facts only (counts, testid, rect, aria-hidden,
      // connected state) — never post content. Logged before AND after so a
      // live failure report can show whether the selected node changed
      // (remount) or was wrong from the start.
      if (isDev) console.log("[Aminta thread] before insert:", debugSnapshotComposer(msg.index))
      insertAndVerifyThreadPost(msg.index, msg.text ?? "").then((result) => {
        if (isDev) console.log("[Aminta thread] after verify:", debugSnapshotComposer(msg.index), result)
        sendResponse(result)
      })
    })
    return true
  }

  // Waits for the user's own "+" click to produce the next composer —
  // unbounded/user-paced (see waitForNextComposerOrRegression's doc
  // comment), interruptible via THREAD_BUILD_STOP below. Also watches
  // composer `previousIndex` on every poll tick, so a destructive change to
  // the already-verified draft fails fast with "previous_composer_cleared"
  // instead of an opaque timeout.
  if (msg?.type === "THREAD_BUILD_WAIT_FOR_COMPOSER") {
    waitForNextComposerOrRegression(msg.index, msg.previousIndex, msg.previousText ?? "", () => threadBuildCancelled).then((result) => {
      if (isDev) console.log("[Aminta thread] wait-for-next result:", result, debugSnapshotComposer(msg.index))
      sendResponse(result)
    })
    return true
  }

  if (msg?.type === "THREAD_BUILD_STOP") {
    threadBuildCancelled = true
    sendResponse({ ok: true })
    return true
  }

  return false
})

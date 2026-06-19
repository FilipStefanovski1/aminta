import type { PlasmoCSConfig } from "plasmo"

import { generate as runAI } from "~lib/ai"
import { buildMessages } from "~lib/prompts"
import { getStore } from "~lib/storage"

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*", "https://twitter.com/*"]
}

function getActiveTweet(): string {
  const nodes = document.querySelectorAll('[data-testid="tweetText"]')
  if (!nodes.length) return ""
  return (nodes[0] as HTMLElement).innerText.trim()
}

function insertIntoComposer(text: string): boolean {
  const box = document.querySelector('[data-testid="tweetTextarea_0"]') as HTMLElement | null
  if (!box) return false
  box.focus()
  document.execCommand("selectAll", false)
  return document.execCommand("insertText", false, text)
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

const BAR_ID = "aminta-compose-bar"

function getComposerText(): string {
  const box = document.querySelector('[data-testid="tweetTextarea_0"]') as HTMLElement | null
  return box ? box.innerText.trim() : ""
}

function setBarStatus(bar: HTMLElement, msg: string, isError = false) {
  const status = bar.querySelector<HTMLSpanElement>(".aminta-status")
  if (status) {
    status.textContent = msg
    status.style.color = isError ? "#f87171" : "#555"
  }
}

async function runGenerate(bar: HTMLElement, mode: "tweet" | "polish", prefill?: string) {
  const store = await getStore()
  if (!store.apiKey) { setBarStatus(bar, "No API key — open Aminta Settings", true); return }
  if (!store.voice)  { setBarStatus(bar, "Train Aminta first", true); return }

  const composerText = getComposerText()

  let input = ""
  if (mode === "polish") {
    input = composerText
    if (!input) { setBarStatus(bar, "Type a draft first", true); return }
  } else {
    // Use prefill (keyword chip click), or whatever is in the compose box, as the topic
    input = prefill ?? composerText
  }

  setBarStatus(bar, "Thinking…")
  bar.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = true })

  try {
    const messages = buildMessages(
      "x",
      mode === "polish" ? "polish" : "tweet",
      store.voice,
      input || "Write a compelling tweet about my niche",
      store.tweetDNA ?? []
    )
    const text = await runAI(store.apiKey, store.model, messages)
    const ok   = insertIntoComposer(text)
    setBarStatus(bar, ok ? "Done ✦" : "Click into the compose box first", !ok)

    // Save topic as recent keyword after a successful tweet generate
    if (mode === "tweet" && input && ok) {
      await saveKeyword(input)
      renderKeywords(bar)
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
    chip.onclick = () => {
      // Fill compose box with the keyword, then generate
      insertIntoComposer(kw)
      runGenerate(bar, "tweet", kw)
    }
    container.appendChild(chip)
  })
}

function buildBar(): HTMLElement {
  const bar = document.createElement("div")
  bar.id = BAR_ID
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

  const generateBtn = makeBtn("+ Generate", () => runGenerate(bar, "tweet"))
  const polishBtn   = makeBtn("+ Polish",   () => runGenerate(bar, "polish"), false)

  bar.append(generateBtn, polishBtn, divider, keywords, status)

  // Load keywords async after bar is built
  renderKeywords(bar)

  return bar
}

function injectBar(toolbar: Element) {
  if (document.getElementById(BAR_ID)) return
  const bar = buildBar()
  toolbar.parentElement?.insertBefore(bar, toolbar.nextSibling)
}

function removeBar() {
  document.getElementById(BAR_ID)?.remove()
}

function getToolbar() {
  return document.querySelector('[data-testid="toolBar"]')
}

let observerActive = false

function startObserver() {
  if (observerActive) return
  observerActive = true

  const obs = new MutationObserver(() => {
    const toolbar = getToolbar()
    if (toolbar) injectBar(toolbar)
    else         removeBar()
  })

  obs.observe(document.body, { childList: true, subtree: true })

  const toolbar = getToolbar()
  if (toolbar) injectBar(toolbar)
}

startObserver()

// ─── Extension message handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_ACTIVE_TWEET") {
    const text = getActiveTweet()
    sendResponse(text
      ? { ok: true, text }
      : { ok: false, error: "No tweet found on screen. Scroll a tweet into view, or paste it manually." }
    )
    return true
  }

  if (msg?.type === "INSERT_TEXT") {
    const ok = insertIntoComposer(msg.text)
    sendResponse(ok
      ? { ok: true }
      : { ok: false, error: "No open composer found. Click the post or reply box on X first." }
    )
    return true
  }

  return false
})

import type { PlasmoCSConfig } from "plasmo"

import { generate as runAI } from "~lib/ai"
import { buildMessages } from "~lib/prompts"
import { getStore } from "~lib/storage"

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*", "https://twitter.com/*"]
}

// Read the text of the top-most tweet currently in view.
function getActiveTweet(): string {
  const nodes = document.querySelectorAll('[data-testid="tweetText"]')
  if (!nodes.length) return ""
  return (nodes[0] as HTMLElement).innerText.trim()
}

// Insert text into the open composer (works for both the post box and reply box).
function insertIntoComposer(text: string): boolean {
  const box = document.querySelector(
    '[data-testid="tweetTextarea_0"]'
  ) as HTMLElement | null
  if (!box) return false
  box.focus()
  // X uses Draft.js — execCommand is the reliable way to register the input
  // so React picks up the change. Select existing content first so the insert
  // replaces it instead of appending (avoids duplicated text).
  document.execCommand("selectAll", false)
  return document.execCommand("insertText", false, text)
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
    status.style.color = isError ? "#f87171" : "#74f7b5"
  }
}

async function runGenerate(bar: HTMLElement, mode: "tweet" | "polish") {
  const store = await getStore()
  if (!store.apiKey) { setBarStatus(bar, "No API key — open Aminta Settings", true); return }
  if (!store.voice)  { setBarStatus(bar, "Train Aminta first", true); return }

  const input = mode === "polish" ? getComposerText() : ""
  if (mode === "polish" && !input) {
    setBarStatus(bar, "Nothing to polish — type a draft first", true)
    return
  }

  setBarStatus(bar, "Thinking…")
  bar.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = true })

  try {
    const messages = buildMessages("x", mode === "polish" ? "polish" : "tweet", store.voice, input || "Create a compelling tweet", store.tweetDNA ?? [])
    const text = await runAI(store.apiKey, store.model, messages)
    const ok = insertIntoComposer(text)
    setBarStatus(bar, ok ? "Done ✦" : "Insert failed — click into the compose box first", !ok)
  } catch (e) {
    setBarStatus(bar, e instanceof Error ? e.message : "Error", true)
  } finally {
    bar.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = false })
  }
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
    "background:#0f1117",
    "border:1px solid #252a38",
    "border-radius:10px",
    "font-family:'Press Start 2P',monospace",
    "font-size:7px",
    "line-height:1",
    "z-index:999",
  ].join(";")

  const makeBtn = (label: string, onClick: () => void) => {
    const btn = document.createElement("button")
    btn.textContent = label
    btn.style.cssText = [
      "background:#74f7b5",
      "color:#000",
      "border:2px solid #000",
      "box-shadow:2px 2px 0 #000",
      "border-radius:6px",
      "padding:4px 8px",
      "font-family:'Press Start 2P',monospace",
      "font-size:7px",
      "cursor:pointer",
      "transition:transform 0.08s,box-shadow 0.08s",
    ].join(";")
    btn.onmousedown = () => { btn.style.transform = "translate(1px,1px)"; btn.style.boxShadow = "1px 1px 0 #000" }
    btn.onmouseup   = () => { btn.style.transform = ""; btn.style.boxShadow = "2px 2px 0 #000" }
    btn.onclick = onClick
    return btn
  }

  const generateBtn = makeBtn("✦ Generate", () => runGenerate(bar, "tweet"))
  const polishBtn   = makeBtn("✨ Polish",   () => runGenerate(bar, "polish"))

  const status = document.createElement("span")
  status.className = "aminta-status"
  status.style.cssText = "color:#444;flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
  status.textContent = "Aminta"

  bar.append(generateBtn, polishBtn, status)
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
  // X's composer toolbar (emoji, GIF, media etc.) sits below the textarea
  return document.querySelector('[data-testid="toolBar"]')
}

let observerActive = false

function startObserver() {
  if (observerActive) return
  observerActive = true

  const obs = new MutationObserver(() => {
    const toolbar = getToolbar()
    if (toolbar) {
      injectBar(toolbar)
    } else {
      removeBar()
    }
  })

  obs.observe(document.body, { childList: true, subtree: true })

  // Inject immediately if composer is already open
  const toolbar = getToolbar()
  if (toolbar) injectBar(toolbar)
}

startObserver()

// ─── Extension message handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_ACTIVE_TWEET") {
    const text = getActiveTweet()
    sendResponse(
      text
        ? { ok: true, text }
        : {
            ok: false,
            error:
              "No tweet found on screen. Scroll a tweet into view, or paste it manually."
          }
    )
    return true
  }

  if (msg?.type === "INSERT_TEXT") {
    const ok = insertIntoComposer(msg.text)
    sendResponse(
      ok
        ? { ok: true }
        : {
            ok: false,
            error:
              "No open composer found. Click the post or reply box on X first."
          }
    )
    return true
  }

  return false
})

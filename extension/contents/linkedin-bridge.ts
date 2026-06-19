import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://www.linkedin.com/*"],
}

// Track the last editable element the user clicked in.
let lastEditor: HTMLElement | null = null

document.addEventListener(
  "focus",
  (e) => {
    const t = e.target as HTMLElement
    if (!t) return
    if (t.isContentEditable || t.getAttribute("role") === "textbox") {
      lastEditor = t
    }
  },
  true
)

function getActivePost(): string {
  const selectors = [
    '.feed-shared-text span[dir="ltr"]',
    '.update-components-text span[dir="ltr"]',
    '.feed-shared-update-v2__description span[dir="ltr"]',
    'span.break-words',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null
    const text = el?.innerText?.trim()
    if (text) return text
  }
  return ""
}

// Walk up from a node to find the nearest editable ancestor.
function nearestEditable(el: Element | null): HTMLElement | null {
  let node = el as HTMLElement | null
  while (node && node !== document.body) {
    if (node.isContentEditable || node.getAttribute("role") === "textbox") return node
    node = node.parentElement
  }
  return null
}

// Find the editor by physically hitting the DOM where the modal should be.
// This works regardless of what attribute the editor has.
function findEditorByPosition(): HTMLElement | null {
  const modal = (
    document.querySelector('[role="dialog"]') ||
    document.querySelector(".artdeco-modal") ||
    document.querySelector(".share-creation-modal")
  ) as HTMLElement | null

  if (!modal) return null
  const rect = modal.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null

  // Sample a vertical strip in the center of the modal at different heights
  const cx = rect.left + rect.width / 2
  const testY = [0.35, 0.45, 0.55, 0.30, 0.60].map((f) => rect.top + rect.height * f)

  for (const y of testY) {
    const hit = document.elementFromPoint(cx, y)
    if (!hit) continue
    const editable = nearestEditable(hit)
    if (editable) return editable
  }
  return null
}

// Attribute-based fallback for any contenteditable / textbox on the page.
function findEditorFallback(): HTMLElement | null {
  const byAttr = Array.from(document.querySelectorAll("[contenteditable]")).filter(
    (el) => el.getAttribute("contenteditable") !== "false"
  ) as HTMLElement[]

  const byRole = Array.from(document.querySelectorAll('[role="textbox"]')) as HTMLElement[]

  const all = [...byAttr, ...byRole].filter((el, i, arr) => arr.indexOf(el) === i)
  if (!all.length) return null

  const inModal = all.filter((el) =>
    el.closest('[role="dialog"], .artdeco-modal, .share-creation-modal')
  )
  const candidates = inModal.length ? inModal : all
  return candidates[candidates.length - 1]
}

function findEditor(): HTMLElement | null {
  // 1. Last element the user focused (most reliable when user clicked the box first)
  if (lastEditor && document.contains(lastEditor)) return lastEditor
  // 2. Physical hit-test inside the open modal
  const byPos = findEditorByPosition()
  if (byPos) return byPos
  // 3. Attribute scan fallback
  return findEditorFallback()
}

function insertInto(box: HTMLElement, text: string) {
  box.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
  box.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, cancelable: true }))
  box.dispatchEvent(new MouseEvent("click",     { bubbles: true, cancelable: true }))
  box.focus()

  setTimeout(() => {
    document.execCommand("selectAll", false)
    const ok = document.execCommand("insertText", false, text)
    if (!ok) {
      box.textContent = text
      box.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }))
    }
  }, 80)
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_ACTIVE_POST") {
    const text = getActivePost()
    sendResponse(
      text
        ? { ok: true, text }
        : { ok: false, error: "No post found. Scroll one into view or paste manually." }
    )
    return true
  }

  if (msg?.type === "INSERT_TEXT") {
    const box = findEditor()
    if (!box) {
      sendResponse({
        ok: false,
        error: "Click inside the LinkedIn post box once, then click Insert.",
      })
      return true
    }
    insertInto(box, msg.text)
    sendResponse({ ok: true })
    return true
  }

  return false
})

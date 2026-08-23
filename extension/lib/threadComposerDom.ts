// X's NATIVE multi-post thread composer — all DOM reading/writing for the
// thread builder centralized here (not scattered across twitter-bridge.ts)
// so it's independently testable with jsdom (see threadComposerDom.test.ts)
// separate from the content-script wiring (message listeners, page-level
// side effects) in contents/twitter-bridge.ts.
//
// P0 FIX #1 (false positive): live QA found verification reporting "1/5
// built" while the visibly active X composer was empty. Root cause: a
// plain `document.querySelector('[data-testid="tweetTextarea_0"]')` always
// returns the FIRST matching node in document order, with no guarantee
// that's the node the user is looking at. Fixed by scoping every lookup to
// the active compose dialog and requiring real visibility.
//
// P0 FIX #2 (composer identity across "+"): live QA with the fix above in
// place showed insert+verify for post 1 genuinely succeeding (exactly one
// real match, verified true) — but the moment "+" was clicked,
// `[data-testid="tweetTextarea_0"]` had ZERO matches anywhere in the
// document, not merely hidden ones. X does not keep composer 0 stably
// labeled tweetTextarea_0 once a thread has more than one post — the
// original assumption ("composer index N-1 is where post N belongs, by
// fixed numeric testid suffix") was simply wrong. Composers are now found
// by POSITION within the active dialog instead: the 1st tweetTextarea-like
// element in document order is post 1's composer, the 2nd is post 2's,
// regardless of whatever numeric suffix X's own testid attribute uses
// internally (and however it changes that suffix after "+").
//
// P0 FIX #3 (label decoys corrupting position order): live QA with FIX #2 in
// place showed getActiveXComposer(0) resolving to a node whose testid was
// `tweetTextarea_0_label`, not the real composer — X renders an outer
// accessibility-label wrapper with that testid, ANCESTOR of the real
// `tweetTextarea_N` composer, and it also matches a bare `^="tweetTextarea_"`
// prefix selector. Because the label wrapper CONTAINS the real composer, it
// sorts earlier in document order, so a purely prefix-matched, unfiltered
// query put decoy label nodes ahead of (or interleaved with) real composers
// and corrupted positional indexing entirely — insert would silently land
// in the right place (querySelector's contenteditable fallback found the
// real nested editable inside the label wrapper) but the position COUNT was
// wrong, so "the next composer" resolved to another decoy instead of the
// next real post. Composers are now matched by testid exactly
// `tweetTextarea_<digits>` — no suffix — which a label/decoy node never is.
//
// ARCHITECTURE CHANGE (abandoned auto-"+"): Aminta used to also click X's
// own "Add post" button itself. Even with the real, visible, correctly-
// targeted button and a realistic press/release event sequence, it never
// advanced the draft — consistent with X gating that action behind a
// browser-enforced `event.isTrusted` check, which no content-script-
// dispatched event can ever satisfy (isTrusted is not spoofable from JS).
// That code is removed. The "+" click is now a real USER action; Aminta
// only detects the composer it produces and fills it. See threadBuilder.ts
// for the resulting state machine.

const REAL_COMPOSER_TESTID = /^tweetTextarea_\d+$/

export const THREAD_BUILD_SELECTORS = {
  // Broad prefix match — narrowed to REAL_COMPOSER_TESTID by isRealComposer()
  // below before anything is counted, indexed, or selected. Never used
  // un-filtered for indexing: see P0 FIX #3 above for why the prefix alone
  // (which also matches e.g. `tweetTextarea_0_label`) is not safe.
  textareaAny: '[data-testid^="tweetTextarea_"]',
}

function isRealComposer(el: HTMLElement): boolean {
  const testid = el.getAttribute("data-testid")
  return !!testid && REAL_COMPOSER_TESTID.test(testid)
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A node counts as visible only if it (and every ancestor up to the
// document) is actually rendered: not aria-hidden, not display:none/
// visibility:hidden/collapse, and has non-zero on-screen bounds. A
// detached (no longer in the document) node is never visible either — that
// alone excludes a stale composer left over from a previous modal.
function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  let node: HTMLElement | null = el
  while (node) {
    if (node.getAttribute("aria-hidden") === "true") return false
    const style = window.getComputedStyle(node)
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false
    node = node.parentElement
  }
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

// The active compose dialog, if X has one open (the "Post" modal thread
// building always uses). Preferred over a bare document-wide search: an
// inline composer elsewhere on the page (e.g. the home timeline's own
// "what's happening" box) can share the same tweetTextarea_N testid, and
// scoping to the dialog rules it out entirely rather than hoping document
// order happens to favor the right one. If more than one dialog is somehow
// visible, the last one in document order is treated as topmost/active,
// matching how stacked modals are typically appended.
export function getActiveComposeDialog(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(isVisible)
  for (let i = dialogs.length - 1; i >= 0; i--) {
    if (dialogs[i].querySelector(THREAD_BUILD_SELECTORS.textareaAny)) return dialogs[i]
  }
  return null
}

function resolveEditable(wrapper: HTMLElement): HTMLElement | null {
  const editable = wrapper.matches('[contenteditable="true"]')
    ? wrapper
    : wrapper.querySelector<HTMLElement>('[contenteditable="true"]')
  if (!editable || !isVisible(editable)) return null
  if ((editable as HTMLElement & { disabled?: boolean }).disabled) return null
  if (editable.getAttribute("aria-disabled") === "true") return null
  return editable
}

// All visible tweetTextarea-like wrapper elements inside the active compose
// dialog, in DOM/reading order — position N is post N+1's composer. Never
// keyed by the numeric suffix in the testid itself: live QA proved X does
// not keep that suffix stable once a thread has more than one post (it can
// drop to zero matches for what was previously "tweetTextarea_0" the
// instant "+" is clicked), so parsing/matching that number is not a safe
// way to identify "which composer is post N" — only DOM position is.
function getComposersInDialog(): HTMLElement[] {
  const dialog = getActiveComposeDialog()
  const scope: ParentNode = dialog ?? document
  return Array.from(scope.querySelectorAll<HTMLElement>(THREAD_BUILD_SELECTORS.textareaAny))
    .filter(isRealComposer)
    .filter(isVisible)
}

/**
 * THE canonical way to locate composer `index`'s (0-based) real,
 * interactive, on-screen contenteditable — by POSITION among the visible
 * tweetTextarea-like elements in the active dialog, not by a fixed numeric
 * testid suffix. Every read, insert, and verify call in this file goes
 * through this — never a bare querySelector — so insertion and
 * verification are structurally guaranteed to target the same element.
 */
export function getActiveXComposer(index: number): HTMLElement | null {
  const wrapper = getComposersInDialog()[index]
  return wrapper ? resolveEditable(wrapper) : null
}

// Diagnostic snapshot only — never used for any pass/fail decision. Logged
// (dev builds only) around insert/verify so a live failure report can show
// exactly what was visible/selected without guessing. Never logs post
// content, only structural facts.
export interface ComposerDebugSnapshot {
  totalMatchesInDocument: number
  visibleMatchesInDialog: number
  /** The raw testid of every visible composer in the dialog, in position order — shows what X actually labels them, whatever that turns out to be. */
  allTestIdsInDialog: (string | null)[]
  selectedTestId: string | null
  /** Rect of the wrapper element itself — independent of whether a usable editable was found inside it. */
  wrapperRect: { width: number; height: number } | null
  /** Was any `[contenteditable="true"]` located in/at the wrapper at all, before any visibility/disabled check. */
  editableFound: boolean
  /** Rect of that raw editable, regardless of visibility — null iff editableFound is false. */
  editableRect: { width: number; height: number } | null
  editableAriaHidden: string | null
  editableConnected: boolean | null
  editableDisabled: boolean | null
  editableAriaDisabled: string | null
  /** Non-null only once the editable passes every check resolveEditable() requires — the same value getActiveXComposer() would return. */
  selectedRect: { width: number; height: number } | null
  selectedAriaHidden: string | null
  selectedConnected: boolean | null
  dialogFound: boolean
  /**
   * Real composer testids (tweetTextarea_<digits> only) in the dialog
   * BEFORE the visibility filter — distinguishes "the next composer hasn't
   * mounted at all yet" from "it's in the DOM but not yet passing isVisible
   * (still laying out, needs scroll-into-view, etc.)". allTestIdsInDialog
   * above is always a subset of this.
   */
  rawTestIdsInDialogIgnoringVisibility: (string | null)[]
}

export function debugSnapshotComposer(index: number): ComposerDebugSnapshot {
  const dialog = getActiveComposeDialog()
  const totalInDocument = document.querySelectorAll(THREAD_BUILD_SELECTORS.textareaAny).length
  const scope: ParentNode = dialog ?? document
  const rawInScope = Array.from(scope.querySelectorAll<HTMLElement>(THREAD_BUILD_SELECTORS.textareaAny)).filter(isRealComposer)
  const inDialog = getComposersInDialog()
  const selectedWrapper = inDialog[index] ?? null
  const rawEditable = selectedWrapper
    ? (selectedWrapper.matches('[contenteditable="true"]')
        ? selectedWrapper
        : selectedWrapper.querySelector<HTMLElement>('[contenteditable="true"]'))
    : null
  const selected = selectedWrapper ? resolveEditable(selectedWrapper) : null
  return {
    totalMatchesInDocument: totalInDocument,
    visibleMatchesInDialog: inDialog.length,
    allTestIdsInDialog: inDialog.map((w) => w.getAttribute("data-testid")),
    rawTestIdsInDialogIgnoringVisibility: rawInScope.map((w) => w.getAttribute("data-testid")),
    selectedTestId: selectedWrapper?.getAttribute("data-testid") ?? null,
    wrapperRect: selectedWrapper ? { width: selectedWrapper.getBoundingClientRect().width, height: selectedWrapper.getBoundingClientRect().height } : null,
    editableFound: !!rawEditable,
    editableRect: rawEditable ? { width: rawEditable.getBoundingClientRect().width, height: rawEditable.getBoundingClientRect().height } : null,
    editableAriaHidden: rawEditable?.getAttribute("aria-hidden") ?? null,
    editableConnected: rawEditable ? rawEditable.isConnected : null,
    editableDisabled: rawEditable ? !!(rawEditable as HTMLElement & { disabled?: boolean }).disabled : null,
    editableAriaDisabled: rawEditable?.getAttribute("aria-disabled") ?? null,
    selectedRect: selected ? { width: selected.getBoundingClientRect().width, height: selected.getBoundingClientRect().height } : null,
    selectedAriaHidden: selected?.getAttribute("aria-hidden") ?? null,
    selectedConnected: selected ? selected.isConnected : null,
    dialogFound: !!dialog,
  }
}

// Polls for composer N to exist (and be the real active one) after
// clicking "+" — deliberately a bounded poll, not a fixed sleep: X is an
// SPA and the next composer mounts asynchronously. Never used to infer
// publish success (there is none here — this only ever builds a draft).
export async function waitForThreadComposerAt(index: number, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (getActiveXComposer(index)) return true
    await sleepMs(200)
  }
  return false
}

// The "+" is now a real USER click (see the architecture-change note at the
// top of this file), so this waits for whatever composer that click
// produces — a user-paced wait, not a bounded automatic retry, so the
// timeout defaults to 10 minutes rather than 8 seconds; the user might take
// a while reviewing post N before clicking "+". Also watches composer
// `previousIndex` on every tick — if its confirmed text goes missing or
// changes (X remounting the compose UI, the user editing it, the compose
// window closing), that's surfaced as a specific, diagnosable reason
// instead of an opaque timeout. `shouldStop` is polled every tick too, so
// the user's own Stop button can interrupt an otherwise-indefinite wait.
//
// Requires the mismatch to persist across REGRESSION_CONFIRM_TICKS
// consecutive polls before reporting it, rather than firing on the very
// first one — live QA showed a single-tick false positive during a brief
// compose-UI remount (the same kind of remount insert/verify already
// tolerates elsewhere in this file, see test 5), not an actual clear.
const REGRESSION_CONFIRM_TICKS = 3
const USER_PACED_WAIT_TIMEOUT_MS = 10 * 60 * 1000

export async function waitForNextComposerOrRegression(
  nextIndex: number,
  previousIndex: number,
  previousText: string,
  shouldStop: () => boolean = () => false,
  timeoutMs = USER_PACED_WAIT_TIMEOUT_MS
): Promise<StepResult> {
  const expectedPrevious = normalizeForCompare(previousText)
  const start = Date.now()
  let consecutiveMismatches = 0
  while (Date.now() - start < timeoutMs) {
    if (shouldStop()) return { ok: false, error: "stopped" }
    if (getActiveXComposer(nextIndex)) return { ok: true }

    const stillThere = readThreadComposerText(previousIndex)
    const mismatched = stillThere === null || normalizeForCompare(stillThere) !== expectedPrevious
    if (mismatched) {
      consecutiveMismatches++
      if (consecutiveMismatches >= REGRESSION_CONFIRM_TICKS) {
        return { ok: false, error: "previous_composer_cleared" }
      }
    } else {
      consecutiveMismatches = 0
    }

    await sleepMs(200)
  }
  return { ok: false, error: "next_composer_timeout" }
}

// Normalizes whitespace the way X's contenteditable tends to reshape pasted
// text (collapsed blank lines, trimmed edges, non-breaking spaces at line/
// span boundaries) so a real, unmodified insertion isn't flagged as a
// mismatch over DOM-representation differences alone. Still an EXACT
// content comparison after normalizing — this must never get loose enough
// to pass genuinely wrong text.
export function normalizeForCompare(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/ /g, " ") // NBSP -> regular space
    .trim()
    .replace(/[ \t]+/g, " ")
}

// Reads whatever the ACTIVE, visible composer currently shows — reacquired
// fresh via getActiveXComposer() on every call, never a cached/stale
// reference, so a composer X remounts mid-flow is picked up correctly on
// the next read instead of silently reading a detached old node.
export function readThreadComposerText(index: number): string | null {
  const box = getActiveXComposer(index)
  return box ? box.innerText : null
}

export function insertIntoComposerAt(text: string, index: number): boolean {
  const box = getActiveXComposer(index)
  if (!box) return false
  if (document.activeElement !== box) box.focus()

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

  // Paste, not execCommand — see twitter-bridge.ts's insertIntoComposer()
  // comment for why (avoids a duplicate-insertion race between React's
  // paste handler and Chrome's own execCommand DOM mutation).
  const dt = new DataTransfer()
  dt.setData("text/plain", text)
  const pasteEvent = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt as unknown as DataTransfer })
  box.dispatchEvent(pasteEvent)
  return pasteEvent.defaultPrevented
}

export interface StepResult {
  ok: boolean
  error?: string
}

// The safety gate: never advance to "+" without re-reading the live,
// ACTIVE composer at this exact index and confirming it holds exactly the
// text this step meant to insert.
//
// This is a bounded POLL, not a single synchronous read — a real bug found
// in manual QA: React commits the paste event's DOM update asynchronously
// (past the synchronous dispatchEvent() call that triggers it), so reading
// innerText immediately in the same tick can observe stale/empty content
// even though the insert genuinely succeeded and the text is visibly
// present moments later. Polling (bounded, not an arbitrary long sleep) is
// what closes that timing gap without weakening the actual check.
//
// Every iteration re-resolves the active composer via readThreadComposerText
// (which itself calls getActiveXComposer fresh each time) rather than
// holding a DOM reference from before the loop — if X replaces/remounts the
// composer mid-poll, the next iteration picks up whatever is now actually
// active and visible, never a detached stale node.
export async function verifyThreadComposerText(
  index: number,
  expectedText: string,
  timeoutMs = 4000
): Promise<StepResult> {
  const expected = normalizeForCompare(expectedText)
  const start = Date.now()
  let lastSeen: string | null = null
  while (Date.now() - start < timeoutMs) {
    const current = readThreadComposerText(index)
    if (current === null) return { ok: false, error: "composer_not_found" }
    lastSeen = current
    if (normalizeForCompare(current) === expected) return { ok: true }
    await sleepMs(100)
  }
  return { ok: false, error: lastSeen === null ? "composer_not_found" : "composer_text_mismatch" }
}

export async function insertAndVerifyThreadPost(index: number, text: string): Promise<StepResult> {
  const inserted = insertIntoComposerAt(text, index)
  if (!inserted) return { ok: false, error: "insert_failed" }
  return verifyThreadComposerText(index, text)
}

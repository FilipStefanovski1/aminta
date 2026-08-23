// Builds a complete thread as a DRAFT inside X's own native multi-post
// composer — insert post 1 into the composer Aminta opened, then relay:
// wait for the USER to click X's own "+" (add another post) themselves,
// detect the composer that produces, insert post 2 into it, and so on.
// Aminta NEVER clicks X's "+" or its final Post/Post-all button: the user
// drives both, Aminta only fills what they create and reviews/publishes the
// whole thread themselves.
//
// ARCHITECTURE CHANGE: an earlier version had Aminta click "+" itself. Live
// QA proved that never worked — the button, targeting, and click sequence
// were all genuinely correct, but nothing happened, consistent with X
// gating that action behind a browser-enforced `event.isTrusted` check that
// no content-script-dispatched event can satisfy. Rather than escalate to
// chrome.debugger (a real permission/UX cost — Chrome shows a persistent
// "being debugged" banner) or X's official write API (a bigger trust/auth
// change), "+" is now a deliberate USER action; this file only detects the
// composer it produces. This itself replaced an even earlier auto-publish-
// and-reply-chain direction (permalink navigation, tweet-ID chaining,
// clicking Publish) that added real publishing risk — neither version of
// this feature has ever clicked Post/Post-all, and this one still doesn't.
//
// This module is the deterministic state machine + orchestration only. It
// has no chrome.* or DOM access itself — every side effect (prepare, insert
// + verify, wait for the user-created composer) is injected via
// ThreadBuilderHandlers, so the whole flow is unit-testable with mocked X
// interactions (see threadBuilder.test.ts) and never touches a real X post
// in tests. The live handlers (chrome.tabs / content-script messaging) are
// wired up in lib/threadBuilderLive.ts.

export type ThreadBuildStatus =
  | "idle"
  | "preparing"
  | "inserting"
  | "waiting_for_user_add"
  | "ready"
  | "failed"
  | "stopped"

export interface ThreadBuildState {
  sessionId: string
  posts: string[]
  currentIndex: number
  total: number
  status: ThreadBuildStatus
  /** How many composers have been successfully inserted + verified. */
  builtCount: number
  error: string | null
}

// Draft-building carries none of the publishing risk auto-posting did — the
// only thing bounding thread length is X's own composer limits and keeping
// a runaway model response from producing an unreasonably long draft.
export const MAX_AUTO_BUILD_THREAD_LENGTH = 10

// X's plain-tweet character limit per post in the thread.
export const MAX_POST_LENGTH = 280

export interface StepResult {
  ok: boolean
  error?: string
}

export interface ThreadBuilderHandlers {
  /** Opens/focuses a composer; fails with "composer_not_clean" if it already has text. */
  prepare: () => Promise<StepResult>
  /** Inserts `text` into composer `index`, then re-reads it to confirm the insert landed. */
  insertAndVerify: (index: number, text: string) => Promise<StepResult>
  /**
   * Waits for the USER to click X's own "+" and produce composer `index` —
   * unbounded/user-paced, not a short automatic retry. Also watches
   * composer `previousIndex` (which must still contain `previousText`) so a
   * destructive change to the already-verified draft fails fast with a
   * specific reason instead of an opaque timeout.
   */
  waitForComposer: (index: number, previousIndex: number, previousText: string) => Promise<StepResult>
  /**
   * Interrupts an in-flight waitForComposer() call when the user presses
   * Stop. Optional: the pure state machine still stops on its own between
   * steps via `stop()` below either way — this just lets a live
   * implementation cut short a wait that could otherwise run for minutes.
   */
  cancelWait?: () => void
  onState: (state: ThreadBuildState) => void
}

export function validateThreadForAutoBuild(posts: string[]): { ok: true } | { ok: false; reason: string } {
  if (posts.length === 0) return { ok: false, reason: "Thread is empty." }
  if (posts.length > MAX_AUTO_BUILD_THREAD_LENGTH) {
    return { ok: false, reason: `Building in X supports up to ${MAX_AUTO_BUILD_THREAD_LENGTH} posts. Copy each post and continue manually on X.` }
  }
  const tooLong = posts.findIndex((p) => p.length > MAX_POST_LENGTH)
  if (tooLong !== -1) {
    return { ok: false, reason: `Post ${tooLong + 1} is over ${MAX_POST_LENGTH} characters. Edit it or post manually.` }
  }
  if (posts.some((p) => !p.trim())) {
    return { ok: false, reason: "Every post must have text." }
  }
  return { ok: true }
}

function initialState(sessionId: string, posts: string[], startIndex = 0): ThreadBuildState {
  return {
    sessionId,
    posts,
    currentIndex: startIndex,
    total: posts.length,
    status: "idle",
    builtCount: startIndex,
    error: null,
  }
}

function errorMessage(code: string | undefined): string {
  switch (code) {
    case "composer_not_found": return "Couldn't open a composer."
    case "composer_not_clean": return "You already have a draft in X. Clear it, then try again."
    case "insert_failed": return "Couldn't insert into the composer."
    case "composer_text_mismatch": return "Composer didn't contain the expected text — stopped rather than build something wrong."
    case "next_composer_timeout": return "Gave up waiting for the next composer."
    case "previous_composer_cleared": return "The already-inserted text disappeared — stopped rather than continue on a broken draft."
    case "stopped": return "Stopped."
    default: return code ?? "Something went wrong."
  }
}

export interface ThreadBuilderController {
  sessionId: string
  stop: () => void
  /** Resolves with the final state once the run ends (ready/failed/stopped). */
  done: Promise<ThreadBuildState>
}

let activeSessionId: string | null = null

/** True while a thread is being built — the UI's own double-click guard should also check this. */
export function hasActiveThreadBuildSession(): boolean {
  return activeSessionId !== null
}

function genSessionId(): string {
  return `threadbuild_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// Shared step loop for both a fresh build (post 1 first) and a resume after
// failure (starts directly at the failed index). Re-inserting into a
// composer that already holds the right text is harmless — insertion
// replaces content rather than appending — so resuming never risks a
// duplicate, and since nothing is ever published here, there is no
// "already-posted" state to protect either.
async function runLoop(
  state: ThreadBuildState,
  handlers: ThreadBuilderHandlers,
  stopRequested: () => boolean,
  skipPrepare: boolean
): Promise<ThreadBuildState> {
  const emit = (patch: Partial<ThreadBuildState>) => {
    state = { ...state, ...patch }
    handlers.onState(state)
    return state
  }

  if (!skipPrepare) {
    if (stopRequested()) return emit({ status: "stopped" })
    emit({ status: "preparing" })
    const prepared = await handlers.prepare()
    if (!prepared.ok) return emit({ status: "failed", error: errorMessage(prepared.error) })
  }

  for (let i = state.currentIndex; i < state.total; i++) {
    if (stopRequested()) return emit({ status: "stopped" })

    emit({ currentIndex: i, status: "inserting" })
    const inserted = await handlers.insertAndVerify(i, state.posts[i])
    if (!inserted.ok) return emit({ status: "failed", error: errorMessage(inserted.error) })

    const next = emit({ builtCount: i + 1 })

    if (i + 1 >= state.total) return emit({ status: "ready" })

    if (stopRequested()) return emit({ status: "stopped" })

    // "+" is the user's own action from here — wait for them to click it
    // and produce the next composer. Unbounded/user-paced (see
    // waitForComposer's doc comment); stopRequested() alone can't interrupt
    // an in-flight wait that could run for minutes, so handlers.cancelWait()
    // gives the live implementation a way to cut it short the moment Stop
    // is pressed (see stop() below).
    emit({ status: "waiting_for_user_add" })
    const waited = await handlers.waitForComposer(i + 1, i, state.posts[i])
    if (!waited.ok) {
      if (waited.error === "stopped") return emit({ status: "stopped" })
      return emit({ status: "failed", error: errorMessage(waited.error ?? "next_composer_timeout") })
    }

    state = next
  }

  return emit({ status: "ready" })
}

/**
 * Starts building a fresh thread draft. Refuses to start a second
 * concurrent build (double-click / rerender guard).
 */
export function startThreadBuild(posts: string[], handlers: ThreadBuilderHandlers): ThreadBuilderController | { error: string } {
  const validation = validateThreadForAutoBuild(posts)
  if (validation.ok === false) return { error: validation.reason }
  if (activeSessionId) return { error: "A thread is already being built." }

  const sessionId = genSessionId()
  activeSessionId = sessionId
  let stopped = false

  const state = initialState(sessionId, posts)
  const done = runLoop(state, handlers, () => stopped, false).finally(() => {
    if (activeSessionId === sessionId) activeSessionId = null
  })

  return { sessionId, stop: () => { stopped = true; handlers.cancelWait?.() }, done }
}

/** Resumes a failed build from the post that failed. Always skips prepare() — the composer draft is already there, and re-checking "is it clean" would wrongly reject its own in-progress text. */
export function resumeThreadBuild(failedState: ThreadBuildState, handlers: ThreadBuilderHandlers): ThreadBuilderController | { error: string } {
  if (failedState.status !== "failed") return { error: "Nothing to retry." }
  if (activeSessionId) return { error: "A thread is already being built." }

  const sessionId = failedState.sessionId
  activeSessionId = sessionId
  let stopped = false

  const state = initialState(sessionId, failedState.posts, failedState.currentIndex)
  const done = runLoop(state, handlers, () => stopped, true).finally(() => {
    if (activeSessionId === sessionId) activeSessionId = null
  })

  return { sessionId, stop: () => { stopped = true; handlers.cancelWait?.() }, done }
}

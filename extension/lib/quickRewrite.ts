// Pure state transitions for OutputCard's Quick Rewrite actions (Shorter/
// Sharper/More casual) — kept separate from GeneratorPanel's React state so
// the concurrency guard, undo, and failure-preserves-output behaviors are
// unit-testable without rendering the component. GeneratorPanel is the only
// caller; the actual AI call (dispatchGenerate) stays there.

import type { QuickRewriteAction } from "~lib/prompts"

export interface QuickRewriteState {
  output: string
  /** Exactly the version just replaced — one level of undo only. */
  previous: string | null
  busy: QuickRewriteAction | null
  error: string
}

// A second click (of any action) while one is already in flight must be a
// no-op — this is the single source of truth for that guard.
export function canStartQuickRewrite(state: QuickRewriteState): boolean {
  return state.busy === null && state.output.trim().length > 0
}

export function startQuickRewrite(state: QuickRewriteState, action: QuickRewriteAction): QuickRewriteState {
  return { ...state, busy: action, error: "" }
}

// The new output becomes current; the version it replaced becomes the one
// undo restores. Always overwrites `previous` — only ever one level back.
export function applyQuickRewriteSuccess(state: QuickRewriteState, newText: string): QuickRewriteState {
  return { output: newText, previous: state.output, busy: null, error: "" }
}

// The successful previous output is never touched on failure.
export function applyQuickRewriteFailure(state: QuickRewriteState, message: string): QuickRewriteState {
  return { ...state, busy: null, error: message }
}

export function applyUndo(state: QuickRewriteState): QuickRewriteState {
  if (state.previous === null) return state
  return { ...state, output: state.previous, previous: null, error: "" }
}

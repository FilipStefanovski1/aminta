// Companion event bus — subscribe/emit pattern for external systems.
// Sound, particles, telemetry, and memory can subscribe without touching the engine.

import type { CompanionEvent, CompanionState } from "~lib/companion"

export type BusListener = (event: CompanionEvent, state: CompanionState) => void

const listeners = new Set<BusListener>()

// Returns an unsubscribe function — pass it to useEffect cleanup.
export function subscribeToCompanion(fn: BusListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitCompanionEvent(event: CompanionEvent, state: CompanionState): void {
  listeners.forEach(fn => fn(event, state))
}

// React bridge for the Companion Engine.
// Manages expression state lifecycle: dispatch → priority check → timer → reset.
// Emits to the bus after each successful dispatch so subscribers stay in sync.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ANIMATION_CSS } from "~lib/animation"
import {
  deriveMood,
  EXPRESSION_CLEAR_ON,
  EXPRESSION_DURATION,
  EXPRESSION_PRIORITY,
  getCompanionState,
  resolveExpression,
  type CompanionEvent,
  type CompanionState,
  type Expression,
} from "~lib/companion"
import { resolveDialogue } from "~lib/dialogue"
import { emitCompanionEvent } from "~hooks/companionBus"
import type { AmintaStore } from "~lib/storage"

export function useCompanion(store: AmintaStore | null): {
  state:     CompanionState
  speech:    string
  animClass: string
  animKey:   number
  dispatch:  (event: CompanionEvent) => void
} {
  // "wave" as initial expression — fires on the first home tab open
  const [expression, setExpression] = useState<Expression>("wave")
  const [lastEvent,  setLastEvent]  = useState<CompanionEvent>("open")
  // Increments each time a non-idle expression is applied.
  // Used as key on Sprite so CSS one-shot animations always restart correctly.
  const [animKey, setAnimKey] = useState(0)

  // Refs so dispatch never goes stale even across re-renders
  const storeRef      = useRef(store)
  storeRef.current    = store

  const expressionRef = useRef(expression)
  expressionRef.current = expression

  const resetTimer = useRef<ReturnType<typeof setTimeout>>()

  const dispatch = useCallback((event: CompanionEvent) => {
    const currentExpr  = expressionRef.current
    const currentStore = storeRef.current

    // ── Step 1: Check if this event is a clear signal for the active expression
    if (EXPRESSION_CLEAR_ON[currentExpr]?.includes(event)) {
      clearTimeout(resetTimer.current)
      setExpression("idle")
      setLastEvent(event)
      const nextState = getCompanionState(currentStore, "idle", event)
      emitCompanionEvent(event, nextState)
      return
    }

    // ── Step 2: Resolve what expression this event produces
    const mood    = deriveMood(currentStore)
    const newExpr = resolveExpression(event, mood)

    // "idle" events carry no new expression — nothing to set
    if (newExpr === "idle") {
      setLastEvent(event)
      return
    }

    // ── Step 3: Priority check — lower-priority events don't interrupt
    if (EXPRESSION_PRIORITY[newExpr] < EXPRESSION_PRIORITY[currentExpr]) return

    // ── Step 4: Apply the new expression
    clearTimeout(resetTimer.current)
    setExpression(newExpr)
    setLastEvent(event)
    setAnimKey(k => k + 1)

    const duration = EXPRESSION_DURATION[newExpr]
    if (duration !== undefined && duration !== Infinity) {
      resetTimer.current = setTimeout(() => setExpression("idle"), duration)
    }

    // ── Step 5: Emit to bus (sound, particles, telemetry, etc.)
    const nextState = getCompanionState(currentStore, newExpr, event)
    emitCompanionEvent(event, nextState)
  }, [])

  // Clean up pending timer on unmount
  useEffect(() => () => clearTimeout(resetTimer.current), [])

  // Compose the return value on every render
  const state    = getCompanionState(store, expression, lastEvent)
  const mood     = deriveMood(store)
  // Memoize speech so Math.random() only re-rolls when the event or mood changes,
  // not on every store update or unrelated render (which caused double bubble-pops).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const speech   = useMemo(() => store ? resolveDialogue(lastEvent, mood, store) : "...", [lastEvent, mood])
  const animClass = ANIMATION_CSS[state.animationId]

  return { state, speech, animClass, animKey, dispatch }
}

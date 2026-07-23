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
import { getLevelIdleLine, resolveDialogue } from "~lib/dialogue"
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

  // Resting-state speech: while nothing is actively happening (expression
  // idle — no wave/thinking/celebrating/error in progress), the bubble
  // cycles through that level's 3 lines every 4s instead of sitting on
  // whatever the last dispatched event happened to say.
  const [idleTick, setIdleTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setIdleTick(t => t + 1), 4000)
    return () => clearInterval(iv)
  }, [])

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
  // While resting (expression idle, nothing actively happening), the bubble
  // is driven by the level-line rotation (idleTick) instead — a reaction to
  // insert/mission_complete/etc. always wins for the duration of its own
  // expression window, then control returns to the rotation once it clears.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const speech   = useMemo(() => {
    if (!store) return "..."
    if (expression === "idle") return getLevelIdleLine(store.xp ?? 0, idleTick)
    return resolveDialogue(lastEvent, mood, store)
  }, [expression, idleTick, lastEvent, mood])
  const animClass = ANIMATION_CSS[state.animationId]

  return { state, speech, animClass, animKey, dispatch }
}

import { useRef, useState } from "react"

import { insertText } from "~lib/messaging"
import type { ThreadOption } from "~lib/prompts"
import { C } from "~lib/theme"
import {
  hasActiveThreadBuildSession,
  resumeThreadBuild,
  startThreadBuild,
  validateThreadForAutoBuild,
  type ThreadBuilderHandlers,
  type ThreadBuildState,
  type ThreadBuilderController,
} from "~lib/threadBuilder"
import { createLiveThreadBuilderHandlers } from "~lib/threadBuilderLive"

interface Props {
  threads: ThreadOption[]
  tint: string
}

function progressLabel(state: ThreadBuildState): string {
  switch (state.status) {
    case "preparing": return "Opening composer…"
    case "inserting": return "Building thread in X…"
    case "waiting_for_user_add": return "Click + on X to add the next post"
    case "ready": return "Thread ready in X ✓"
    case "failed": return `Stopped at ${state.builtCount}/${state.total}`
    case "stopped": return `Stopped at ${state.builtCount}/${state.total}`
    default: return ""
  }
}

const isRunning = (s: ThreadBuildState | null) =>
  !!s && !["idle", "ready", "failed", "stopped"].includes(s.status)

// Native X thread-composer builder (lib/threadBuilder.ts + lib/
// threadBuilderLive.ts): Aminta inserts each post into X's own multi-post
// thread composer, but the USER clicks X's own "+" (add another post)
// themselves between posts — Aminta only detects the composer that
// produces and fills it. Aminta never clicks "+" or X's Post/Post-all
// button. The user reviews the whole draft inside X and publishes it
// themselves.
export default function ThreadResults({ threads, tint }: Props) {
  const [selected, setSelected] = useState(0)
  const [posts, setPosts] = useState<string[][]>(() => threads.map((t) => [...t.posts]))
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [insertStatus, setInsertStatus] = useState("")
  const [buildState, setBuildState] = useState<ThreadBuildState | null>(null)
  const [buildError, setBuildError] = useState("")
  const controllerRef = useRef<ThreadBuilderController | null>(null)

  const active = threads[selected]
  const activePosts = posts[selected]
  const running = isRunning(buildState)

  const editPost = (i: number, text: string) => {
    setPosts((prev) => prev.map((thread, ti) => (ti === selected ? thread.map((p, pi) => (pi === i ? text : p)) : thread)))
  }

  const copyPost = async (i: number) => {
    try {
      await navigator.clipboard.writeText(activePosts[i])
      setCopiedIdx(i)
      setTimeout(() => setCopiedIdx(null), 1500)
    } catch { /* clipboard unavailable — no-op, user can select manually */ }
  }

  const insertFirst = async () => {
    setInsertStatus("")
    const res = await insertText("x", activePosts[0])
    setInsertStatus(res.ok
      ? "Post 1 inserted. Publish it, then copy each reply into the thread."
      : (res.error ?? "Couldn't insert — copy it manually."))
    setTimeout(() => setInsertStatus(""), 5000)
  }

  const runWithHandlers = async (
    start: (handlers: ThreadBuilderHandlers) => ThreadBuilderController | { error: string }
  ) => {
    setBuildError("")
    const handlers = await createLiveThreadBuilderHandlers(setBuildState)
    if ("error" in handlers) { setBuildError(handlers.error); return }

    const ctrl = start(handlers)
    if ("error" in ctrl) { setBuildError(ctrl.error); return }

    controllerRef.current = ctrl
    await ctrl.done
    controllerRef.current = null
  }

  const buildThread = () => {
    if (running || hasActiveThreadBuildSession()) return
    const validation = validateThreadForAutoBuild(activePosts)
    if (validation.ok === false) { setBuildError(validation.reason); return }
    runWithHandlers((handlers) => startThreadBuild(activePosts, handlers))
  }

  const retryBuild = () => {
    if (running || hasActiveThreadBuildSession() || !buildState || buildState.status !== "failed") return
    const failed = buildState
    runWithHandlers((handlers) => resumeThreadBuild(failed, handlers))
  }

  const stopBuild = () => controllerRef.current?.stop()

  const validation = validateThreadForAutoBuild(activePosts)
  const canEditFreely = !running

  // Thread Creator can now surface 1-3 options — a truncated/partially
  // malformed model response still returns whatever complete threads it
  // recovered (see lib/prompts.ts's parseThreadResponse) rather than
  // failing the whole generation. grid-cols-3 with only 1-2 real options
  // would leave empty trailing cells, so size the selector to what's
  // actually there instead of assuming 3 always.
  const selectorCols = threads.length >= 3 ? "grid-cols-3" : threads.length === 2 ? "grid-cols-2" : "grid-cols-1"

  return (
    <div className="space-y-3 animate-card-in">
      {/* ── Thread selector ── */}
      <div className={`grid ${selectorCols} gap-1.5`}>
        {threads.map((t, i) => {
          const isActive = i === selected
          return (
            <button
              key={i}
              disabled={running}
              onClick={() => setSelected(i)}
              className="rounded-lg px-2 py-2 text-left transition-all disabled:opacity-50"
              style={{
                backgroundColor: isActive ? tint + "14" : C.card,
                border: `1.5px solid ${isActive ? tint : C.border}`,
              }}>
              <p className="font-pixel text-[7px]" style={{ color: isActive ? tint : C.textDim }}>Thread {i + 1}</p>
              <p className="text-[9px] mt-1 leading-snug line-clamp-2" style={{ color: isActive ? C.text : C.textFaint }}>
                {t.angle}
              </p>
              <p className="text-[8px] mt-1" style={{ color: C.textGhost }}>{posts[i].length} posts</p>
            </button>
          )
        })}
      </div>

      {/* ── Selected thread — editable posts ── */}
      <div className="space-y-2">
        {activePosts.map((post, i) => {
          const isCurrent = running && buildState?.currentIndex === i
          const isDone = !!buildState && (buildState.builtCount > i)
          return (
            <div key={i} className="rounded-xl p-3" style={{
              backgroundColor: "#111318",
              border: `1px solid ${isCurrent ? tint : "#1e2028"}`,
            }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-pixel text-[7px]" style={{ color: tint }}>
                  {i === 0 ? "HOOK" : `${i + 1}/${activePosts.length}`}
                  {isDone && " ✓"}
                </span>
                <span className="text-[9px]" style={{ color: post.length > 280 ? "#fbbf24" : C.textGhost }}>
                  {post.length}/280
                </span>
              </div>
              <textarea
                value={post}
                onChange={(e) => editPost(i, e.target.value)}
                readOnly={!canEditFreely}
                rows={Math.min(6, Math.max(2, Math.ceil(post.length / 45)))}
                className="w-full bg-transparent text-[12px] leading-relaxed resize-none outline-none"
                style={{ color: C.text }}
              />
              <button
                onClick={() => copyPost(i)}
                className="mt-1.5 text-[10px]"
                style={{ color: copiedIdx === i ? tint : C.textFaint }}>
                {copiedIdx === i ? "Copied ✓" : "Copy"}
              </button>
            </div>
          )
        })}
      </div>

      {/* ── Build progress ── */}
      {buildState && buildState.status !== "idle" && (
        <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "#111318", border: `1px solid ${tint}40` }}>
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[8px]" style={{ color: tint }}>
              {buildState.status === "ready" ? "READY" : buildState.status === "failed" || buildState.status === "stopped" ? "STOPPED" : "BUILDING THREAD IN X"}
            </span>
            <span className="text-[10px]" style={{ color: C.textDim }}>{buildState.builtCount} of {buildState.total} added</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#1e2028" }}>
            <div className="h-full transition-all" style={{
              width: `${(buildState.builtCount / buildState.total) * 100}%`,
              backgroundColor: tint,
            }} />
          </div>
          <p className="text-[10px]" style={{ color: C.textDim }}>{progressLabel(buildState)}</p>
          {(buildState.status === "failed" || buildState.status === "stopped") && buildState.error && (
            <p className="text-[10px]" style={{ color: "#f87171" }}>{buildState.error}</p>
          )}
          {buildState.status === "ready" && (
            <p className="text-[10px]" style={{ color: C.textDim }}>
              Review your thread, then post when you're ready.
            </p>
          )}
          <div className="flex gap-2">
            {running && (
              <button onClick={stopBuild} className="text-[10px] rounded px-2 py-1" style={{ border: `1px solid ${C.border}`, color: C.textDim }}>
                Stop
              </button>
            )}
            {buildState.status === "failed" && !running && (
              <button onClick={retryBuild} className="text-[10px] rounded px-2 py-1" style={{ border: `1px solid ${tint}`, color: tint }}>
                Retry from {buildState.currentIndex + 1}
              </button>
            )}
          </div>
        </div>
      )}

      {buildError && <p className="text-[10px]" style={{ color: "#f87171" }}>{buildError}</p>}

      {/* ── Primary action: build the full thread draft in X ── */}
      <button
        onClick={buildThread}
        disabled={running || validation.ok === false}
        className="btn-pixel w-full bg-mint text-black rounded py-2.5 font-pixel text-[8px] active:scale-[0.97] disabled:opacity-40">
        Build thread in X
      </button>
      {validation.ok === false && !running && (
        <p className="text-[10px]" style={{ color: C.textFaint }}>{validation.reason}</p>
      )}

      {/* ── Manual fallback — always available ── */}
      <button
        onClick={insertFirst}
        disabled={running}
        className="w-full rounded py-2 text-[9px] disabled:opacity-40"
        style={{ border: `1px solid ${C.border}`, color: C.textDim }}>
        Insert post 1 into X (manual)
      </button>
      {insertStatus && (
        <p className="text-[10px]" style={{ color: C.textDim }}>{insertStatus}</p>
      )}
    </div>
  )
}

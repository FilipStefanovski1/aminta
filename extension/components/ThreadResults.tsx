import { useState } from "react"

import { insertText } from "~lib/messaging"
import type { ThreadOption } from "~lib/prompts"
import { C } from "~lib/theme"

interface Props {
  threads: ThreadOption[]
  tint: string
}

// Thread auto-posting (chaining replies across multiple composer states)
// is a separate, larger content-script feature — not attempted here. This
// inserts POST 1 into the current composer (same path as a normal post),
// and gives Copy on every post so the user continues the thread manually
// via X's own reply flow. Honest and immediately useful, not a fragile
// multi-step DOM automation that can't be verified without live testing.
export default function ThreadResults({ threads, tint }: Props) {
  const [selected, setSelected] = useState(0)
  const [posts, setPosts] = useState<string[][]>(() => threads.map((t) => [...t.posts]))
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [insertStatus, setInsertStatus] = useState("")

  const active = threads[selected]
  const activePosts = posts[selected]

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

  return (
    <div className="space-y-3 animate-card-in">
      {/* ── Thread selector ── */}
      <div className="grid grid-cols-3 gap-1.5">
        {threads.map((t, i) => {
          const isActive = i === selected
          return (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className="rounded-lg px-2 py-2 text-left transition-all"
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
        {activePosts.map((post, i) => (
          <div key={i} className="rounded-xl p-3" style={{ backgroundColor: "#111318", border: "1px solid #1e2028" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-pixel text-[7px]" style={{ color: tint }}>
                {i === 0 ? "HOOK" : `${i + 1}/${activePosts.length}`}
              </span>
              <span className="text-[9px]" style={{ color: post.length > 280 ? "#fbbf24" : C.textGhost }}>
                {post.length}/280
              </span>
            </div>
            <textarea
              value={post}
              onChange={(e) => editPost(i, e.target.value)}
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
        ))}
      </div>

      <button
        onClick={insertFirst}
        className="btn-pixel w-full bg-mint text-black rounded py-2.5 font-pixel text-[8px] active:scale-[0.97]">
        Insert post 1 into X
      </button>
      {insertStatus && (
        <p className="text-[10px]" style={{ color: C.textDim }}>{insertStatus}</p>
      )}
    </div>
  )
}

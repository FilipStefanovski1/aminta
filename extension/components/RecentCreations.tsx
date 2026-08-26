import { useState } from "react"
import { createPortal } from "react-dom"

import { creationPreview, creationTypeLabel, deleteRecentCreation, joinThreadForCopy, relativeTimeLabel } from "~lib/recentCreations"
import type { RecentCreation } from "~lib/storage"
import { C } from "~lib/theme"

interface Props {
  creations: RecentCreation[]
  tint: string
  /** Takes the saved creation back into the appropriate Create workflow. See GeneratorPanel's initialTopic/initialMode. */
  onReuse: (c: RecentCreation) => void
  /** Refresh the store after a delete so the list here stays in sync. */
  onUpdate: () => void
}

function copyText(c: RecentCreation): string {
  return c.type === "thread" ? joinThreadForCopy(c.posts ?? []) : (c.text ?? "")
}

export default function RecentCreations({ creations, tint, onReuse, onUpdate }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [detail, setDetail] = useState<RecentCreation | null>(null)
  const [copied, setCopied] = useState(false)

  if (creations.length === 0) {
    return (
      <div className="px-1 animate-card-in" style={{ animationDelay: "170ms" }}>
        <p className="font-pixel text-[7px] mb-1" style={{ color: C.text }}>Recent creations</p>
        <p className="text-[11px]" style={{ color: C.textFaint }}>Your generated posts will appear here.</p>
      </div>
    )
  }

  const visible = showAll ? creations : creations.slice(0, 3)

  const copy = async (c: RecentCreation) => {
    try {
      await navigator.clipboard.writeText(copyText(c))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — no-op */ }
  }

  const remove = async (id: string) => {
    await deleteRecentCreation(id)
    setDetail(null)
    onUpdate()
  }

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden animate-card-in"
        style={{ animationDelay: "170ms", backgroundColor: C.card, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
          <p className="font-pixel text-[7px]" style={{ color: C.text }}>Recent creations</p>
          {creations.length > 3 && (
            <button onClick={() => setShowAll((v) => !v)} className="text-[10px]" style={{ color: tint }}>
              {showAll ? "Show less" : "View all"}
            </button>
          )}
        </div>
        <div>
          {visible.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setDetail(c)}
              className="w-full flex items-start justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
              style={{ borderTop: i > 0 ? `1px solid ${C.borderSoft}` : undefined }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold" style={{ color: tint }}>{creationTypeLabel(c)}</span>
                  <span className="text-[9px]" style={{ color: C.textGhost }}>{relativeTimeLabel(c.createdAt)}</span>
                </div>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: C.textFaint }}>{creationPreview(c)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {detail && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setDetail(null)}>
          <div
            className="w-full rounded-t-2xl p-4 space-y-3 animate-slide-up"
            style={{ background: C.card, border: `1px solid ${C.border}`, maxHeight: "80vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold" style={{ color: tint }}>{creationTypeLabel(detail)}</span>
              <span className="text-[9px]" style={{ color: C.textGhost }}>{relativeTimeLabel(detail.createdAt)}</span>
            </div>

            {detail.type === "thread" ? (
              <div className="space-y-2">
                {(detail.posts ?? []).map((post, i) => (
                  <div key={i} className="rounded-xl p-3" style={{ backgroundColor: C.cardInner, border: `1px solid ${C.borderSoft}` }}>
                    <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: C.text }}>{post}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: C.text }}>{detail.text}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => copy(detail)}
                className="flex-1 rounded-lg py-2.5 text-[11px] font-medium"
                style={{ border: `1px solid ${C.border}`, color: copied ? tint : C.textFaint }}>
                {copied ? "Copied" : detail.type === "thread" ? "Copy thread" : "Copy"}
              </button>
              <button
                onClick={() => { onReuse(detail); setDetail(null) }}
                className="flex-1 rounded-lg py-2.5 text-[11px] font-semibold text-black"
                style={{ backgroundColor: tint }}>
                Reuse
              </button>
            </div>
            <button
              onClick={() => remove(detail.id)}
              className="w-full text-[10px] py-1"
              style={{ color: C.textGhost }}>
              Delete
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

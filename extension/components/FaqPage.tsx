import { useState } from "react"

import { FAQS } from "~lib/faq"
import { C } from "~lib/theme"

interface Props {
  tint: string
  onClose: () => void
}

export default function FaqPage({ tint, onClose }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  return (
    <div className="absolute inset-0 z-30 flex flex-col animate-slide-up" style={{ backgroundColor: C.bg }}>
      <header
        className="shrink-0 flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: `1px solid ${C.border}` }}>
        <button
          onClick={onClose}
          aria-label="Back"
          title="Back"
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: tint }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <p className="font-pixel text-[9px]" style={{ color: C.text }}>Help &amp; FAQ</p>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-2">
        {FAQS.map((item, i) => {
          const open = openIdx === i
          return (
            <div key={item.q} className="rounded-xl overflow-hidden" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
              <button
                onClick={() => setOpenIdx(open ? null : i)}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left">
                <span className="text-[12px] font-medium" style={{ color: C.text }}>{item.q}</span>
                <span className="shrink-0 text-[11px]" style={{ color: open ? tint : C.textDim }}>{open ? "−" : "+"}</span>
              </button>
              {open && (
                <p className="px-3.5 pb-3.5 text-[11px] leading-relaxed" style={{ color: C.textDim }}>
                  {item.a}
                </p>
              )}
            </div>
          )
        })}
        <div className="h-2" />
      </main>
    </div>
  )
}

import { useState } from "react"

import { getStageTint } from "~lib/evolution"
import type { AmintaStore, VoiceProfile } from "~lib/storage"
import { C } from "~lib/theme"
import { Card, SectionLabel, Sprite } from "~components/ui"

interface Props {
  store: AmintaStore
  initial: VoiceProfile | null
  onSave: (voice: VoiceProfile) => Promise<void> | void
  dnaCount?: number
}

const VOICE_STYLES = ["Casual", "Direct", "Witty", "Raw", "Motivational", "Analytical"]

const STYLE_PREVIEWS: Record<string, string> = {
  Casual:       "shipped a thing. not sure it works. going to sleep.",
  Direct:       "Three features. One bug. Net positive.",
  Witty:        "My deploy script has more trust issues than my last relationship.",
  Raw:          "I almost gave up yesterday. I didn't. That's the whole story.",
  Motivational: "Every post you skip is a post someone else made instead.",
  Analytical:   "Engagement peaks 8–10 AM and 6–8 PM. That's the window.",
}

const INFO_TIPS: Record<string, string> = {
  niche:        "Be specific — 'crypto' is too broad, 'DeFi protocol security' is useful. Aminta uses this to stay on-topic when generating.",
  voice:        "Pick the style closest to how you actually write, not how you want to write. Aminta mimics your current voice, not an ideal one.",
  examples:     "Paste 3–5 real posts you've written. The more authentic (even rough drafts), the better Aminta learns your patterns.",
  inspiration:  "An X handle whose writing style you admire. Aminta blends their rhythm with your voice — not their content.",
  rules:        "Hard rules Aminta must follow every time. Good examples: 'no hashtags', 'keep under 200 chars', 'never use the word leverage'.",
}

const inputCls = "input-pixel w-full rounded-xl px-3 py-2.5 text-sm"

function InfoTip({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold leading-none transition-colors"
        style={{
          backgroundColor: open ? C.border : "transparent",
          border: `1px solid ${C.border}`,
          color: C.textDim,
        }}>
        i
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-6 z-20 rounded-xl p-3 text-[11px] leading-relaxed w-56"
            style={{ backgroundColor: "#2a2a2e", border: `1px solid ${C.border}`, color: C.text, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            {tip}
          </div>
        </>
      )}
    </span>
  )
}

function SectionLabelWithTip({ children, tipKey }: { children: React.ReactNode; tipKey: string }) {
  return (
    <div className="flex items-center mb-2" style={{ marginBottom: 8 }}>
      <p className="font-pixel text-[7px] uppercase tracking-widest" style={{ color: "#8a8a96" }}>{children}</p>
      <InfoTip tip={INFO_TIPS[tipKey]} />
    </div>
  )
}

export default function VoiceProfileForm({ store, initial, onSave, dnaCount = 0 }: Props) {
  const tint = getStageTint(store.xp ?? 0)

  const [niche,            setNiche]            = useState(initial?.niche ?? "")
  const [voiceStyle,       setVoiceStyle]       = useState(initial?.voiceStyle ?? "")
  const [voiceInspiration, setVoiceInspiration] = useState(initial?.voiceInspiration ?? "")
  const [examples,         setExamples]         = useState<string[]>(() => {
    const raw = initial?.examples ?? ""
    if (!raw) return []
    if (raw.startsWith("[")) {
      try { return JSON.parse(raw) as string[] } catch {}
    }
    // legacy: split on double-newline, then single-newline as last resort
    const byDouble = raw.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
    return byDouble.length > 1 ? byDouble : raw.split("\n").map(s => s.trim()).filter(Boolean)
  })
  const [newPost,     setNewPost]     = useState("")
  const [adding,      setAdding]      = useState(false)
  const [customRules, setCustomRules] = useState(initial?.customRules ?? "")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const learned = [
    !!niche.trim(),
    !!voiceStyle,
    examples.length >= 3,
    !!voiceInspiration.trim() || !!customRules.trim(),
  ]
  const learnedCount = learned.filter(Boolean).length

  const addExample = () => {
    if (!newPost.trim()) return
    setExamples(prev => [...prev, newPost.trim()])
    setNewPost("")
    setAdding(false)
  }
  const removeExample = (i: number) => setExamples(prev => prev.filter((_, j) => j !== i))

  const save = async () => {
    setError("")
    if (!niche.trim())  { setError("Tell Aminta what you write about first."); return }
    if (!voiceStyle)    { setError("Pick how you sound."); return }
    await onSave({
      niche:            niche.trim(),
      tone:             voiceStyle,
      voiceStyle,
      voiceInspiration: voiceInspiration.trim(),
      examples:         JSON.stringify(examples),
      customRules:      customRules.trim(),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-3 pb-4">

      {/* ── Aminta presence + progress ── */}
      <Card glow={tint} className="flex items-center gap-3 animate-card-in">
        <Sprite xp={store.xp ?? 0} size={44} float />
        <div className="flex-1 min-w-0">
          <p className="font-pixel text-[9px]" style={{ color: C.text }}>teach me how you write.</p>
          <div className="flex gap-1 mt-2">
            {learned.map((done, i) => (
              <div key={i} className="flex-1 h-1 rounded-full transition-colors duration-500"
                style={{ backgroundColor: done ? tint : C.border }} />
            ))}
          </div>
        </div>
        <span className="font-pixel text-[7px] shrink-0" style={{ color: tint }}>{learnedCount}/4</span>
      </Card>

      {/* ── What you write about ── */}
      <Card className="animate-card-in" style={{ animationDelay: "30ms" }}>
        <SectionLabelWithTip tipKey="niche">What you write about</SectionLabelWithTip>
        <input value={niche} onChange={(e) => setNiche(e.target.value)}
          placeholder="e.g. indie hacking, AI tools, fitness" className={inputCls} />
      </Card>

      {/* ── How you sound ── */}
      <Card className="animate-card-in" style={{ animationDelay: "60ms" }}>
        <SectionLabelWithTip tipKey="voice">How you sound</SectionLabelWithTip>
        <div className="grid grid-cols-2 gap-2">
          {VOICE_STYLES.map((s) => {
            const active = voiceStyle === s
            return (
              <button key={s} onClick={() => setVoiceStyle(s)}
                className="py-2.5 px-3 rounded-xl border-2 text-xs font-medium transition-all active:scale-[0.96]"
                style={{
                  borderColor: active ? tint : C.border,
                  backgroundColor: active ? tint + "12" : "transparent",
                  color: active ? tint : C.textDim,
                }}>
                {s}
              </button>
            )
          })}
        </div>
        {voiceStyle && (
          <p className="text-[11px] mt-3 italic leading-relaxed pt-2.5" style={{ color: C.textDim, borderTop: `1px solid ${C.border}` }}>
            "{STYLE_PREVIEWS[voiceStyle]}"
          </p>
        )}
      </Card>

      {/* ── Things you've written ── */}
      <Card className="animate-card-in" style={{ animationDelay: "90ms" }}>
        <div className="flex items-center justify-between mb-2">
          <SectionLabelWithTip tipKey="examples">Things you've written</SectionLabelWithTip>
          <span className="font-pixel text-[6px]" style={{ color: C.textFaint }}>{examples.length}/5</span>
        </div>

        <div className="space-y-2">
          {examples.map((post, i) => (
            <div key={i} className="group flex gap-2.5 rounded-xl p-3" style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
              <span className="font-pixel text-[6px] mt-0.5 shrink-0 select-none" style={{ color: C.textFaint }}>#{i + 1}</span>
              <p className="flex-1 text-[11px] leading-relaxed break-words min-w-0" style={{ color: "#ccc" }}>{post}</p>
              <button onClick={() => removeExample(i)}
                className="shrink-0 text-xs leading-none mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: C.textFaint }}>✕</button>
            </div>
          ))}

          {examples.length === 0 && !adding && (
            <p className="font-pixel text-[7px] text-center py-2" style={{ color: C.textFaint }}>nothing yet. show me how you write.</p>
          )}

          {examples.length < 5 && (adding ? (
            <div className="rounded-xl p-3" style={{ backgroundColor: C.cardInner, border: `1px solid ${tint}44` }}>
              <textarea value={newPost} onChange={e => setNewPost(e.target.value)} rows={3}
                placeholder="Paste one of your posts…" autoFocus
                className="w-full text-[12px] bg-transparent resize-none outline-none leading-relaxed"
                style={{ color: C.text }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addExample()
                  if (e.key === "Escape") { setNewPost(""); setAdding(false) }
                }} />
              <div className="flex items-center gap-3 mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                <button onClick={addExample} disabled={!newPost.trim()}
                  className="font-pixel text-[8px] disabled:opacity-40" style={{ color: tint }}>Add →</button>
                <button onClick={() => { setNewPost(""); setAdding(false) }}
                  className="font-pixel text-[8px]" style={{ color: C.textDim }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full rounded-xl py-3 font-pixel text-[7px] flex items-center justify-center gap-2 transition-colors"
              style={{ border: `1px dashed ${C.border}`, color: C.textDim }}>
              + Add a post
            </button>
          ))}
        </div>
      </Card>

      {/* ── Who you sound like + rules ── */}
      <Card className="animate-card-in" style={{ animationDelay: "120ms" }}>
        <SectionLabelWithTip tipKey="inspiration">Who you sound like (optional)</SectionLabelWithTip>
        <input value={voiceInspiration} onChange={(e) => setVoiceInspiration(e.target.value)}
          placeholder="@handle, or leave blank" className={inputCls} />

        <div className="flex items-center justify-between mt-4 mb-0">
          <SectionLabelWithTip tipKey="rules">Your rules (optional)</SectionLabelWithTip>
          <span className="font-pixel text-[6px]" style={{ color: C.textFaint }}>{customRules.length}/300</span>
        </div>
        <textarea value={customRules} onChange={(e) => setCustomRules(e.target.value.slice(0, 300))} rows={3}
          placeholder={"Never use hashtags.\nNo emojis.\nDon't sound like a startup."}
          className={`${inputCls} resize-none`} />
      </Card>

      {/* ── Save ── */}
      <div className="space-y-2">
        {error && <p className="text-[11px] text-red-400 animate-fade-in">{error}</p>}
        {saved && <p className="font-pixel text-[9px] text-center animate-toast" style={{ color: tint }}>Saved ✓ Aminta learned.</p>}
        <button onClick={save}
          className="btn-pixel w-full py-3 rounded-xl font-pixel text-[9px] text-black active:scale-[0.98]"
          style={{ backgroundColor: tint }}>
          {saved ? "Saved ✓" : "Save & Teach Aminta"}
        </button>
      </div>

    </div>
  )
}

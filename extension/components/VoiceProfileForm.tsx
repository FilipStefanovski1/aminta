import { useCallback, useEffect, useRef, useState } from "react"

import { getStageTint } from "~lib/evolution"
import {
  INSTINCT_CATEGORIES,
  INSTINCT_PRESETS,
  POPULAR_INSTINCT_PRESETS,
  PRESET_BY_LABEL,
  PRESET_BY_PROMPT,
  searchInstinctPresets,
  type InstinctPreset,
} from "~lib/instinctPresets"
import type { AmintaStore, VoiceProfile } from "~lib/storage"
import { C } from "~lib/theme"
import { Card, Sprite } from "~components/ui"
import VoiceRefreshCard from "~components/VoiceRefreshCard"

interface Props {
  store: AmintaStore
  initial: VoiceProfile | null
  onSave: (voice: VoiceProfile) => Promise<void> | void
  dnaCount?: number
  /** Re-read the store after a Voice Refresh installs a new profile. */
  onRefreshed?: () => void
}

const VOICE_STYLES: { id: string; desc: string }[] = [
  { id: "Casual",       desc: "Relaxed, conversational" },
  { id: "Direct",       desc: "No fluff. Point first." },
  { id: "Witty",        desc: "Sharp, dry, subtext" },
  { id: "Raw",          desc: "Unfiltered, real" },
  { id: "Motivational", desc: "Energy, momentum" },
  { id: "Analytical",   desc: "Data-driven, precise" },
]

const STYLE_PREVIEWS: Record<string, string> = {
  Casual:       "shipped a thing. not sure it works. going to sleep.",
  Direct:       "Three features. One bug. Net positive.",
  Witty:        "My deploy script has more trust issues than my last relationship.",
  Raw:          "I almost gave up yesterday. I didn't. That's the whole story.",
  Motivational: "Every post you skip is a post someone else made instead.",
  Analytical:   "Engagement peaks 8–10 AM and 6–8 PM. That's the window.",
}

const INFO_TIPS: Record<string, string> = {
  niche:       "Be specific. 'crypto' is too broad, 'DeFi protocol security' is useful. Aminta uses this to stay on-topic when generating.",
  voice:       "Pick the style closest to how you actually write, not how you want to write. Aminta mimics your current voice, not an ideal one.",
  examples:    "Paste 3–5 real posts you've written. The more authentic, the better Aminta learns your patterns.",
  rules:       "Things Aminta must never do. Examples: 'no hashtags', 'keep under 200 chars', 'never say leverage'.",
}

const MEMORY_LESSONS = [
  "Learned your pacing",
  "Understood your tone",
  "Captured your vocabulary",
  "Felt your rhythm",
  "Recognized your style",
]

function InfoTip({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Section labels vary in width, so the icon's horizontal position drifts
  // from card to card — anchoring the tooltip to a fixed side of the icon
  // (left-0 or right-0) overflows the panel whenever the icon happens to
  // land near that edge. Position it as `fixed` instead, computed from the
  // icon's real on-screen position and clamped to stay inside the panel.
  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect  = btnRef.current.getBoundingClientRect()
    const WIDTH = 224 // w-56
    const MARGIN = 12
    const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - WIDTH - MARGIN)
    setPos({ top: rect.bottom + 6, left })
  }, [open])

  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold leading-none"
        style={{ border: `1px solid ${C.border}`, color: C.textDim }}>
        i
      </button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="fixed z-20 rounded-xl p-3 text-[11px] leading-relaxed w-56"
            style={{ top: pos.top, left: pos.left, backgroundColor: "#252528", border: `1px solid ${C.border}`, color: C.text, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            {tip}
          </div>
        </>
      )}
    </span>
  )
}

function SectionHead({ label, tipKey, meta }: { label: string; tipKey: string; meta?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center">
        <p className="font-pixel text-[7px] uppercase tracking-widest" style={{ color: C.textDim }}>{label}</p>
        <InfoTip tip={INFO_TIPS[tipKey]} />
      </div>
      {meta}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, backgroundColor: C.borderSoft, margin: "0 -16px" }} />
}

function PixelStep({ done, label, tint }: { done: boolean; label: string; tint: string }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="6" height="6" viewBox="0 0 6 6" style={{ flexShrink: 0, imageRendering: "pixelated" }}>
        {done
          ? <rect x="0" y="0" width="6" height="6" fill={tint} />
          : <rect x="0" y="0" width="6" height="6" fill="none" stroke={C.border} strokeWidth="1" />
        }
      </svg>
      <span className="text-[10px] leading-none transition-colors duration-300"
        style={{ color: done ? C.text : C.textDim }}>
        {label}
      </span>
    </div>
  )
}

export default function VoiceProfileForm({ store, initial, onSave, dnaCount = 0, onRefreshed }: Props) {
  const tint = getStageTint(store.xp ?? 0)

  const [topics,           setTopics]           = useState<string[]>(() =>
    (initial?.niche ?? "").split(",").map(s => s.trim()).filter(Boolean)
  )
  const [newTopic,         setNewTopic]         = useState("")
  const [voiceStyle,       setVoiceStyle]       = useState(initial?.voiceStyle ?? "")
  // No longer editable via UI (the "Sound like" section was removed) — kept
  // read-only so an existing user's previously-saved inspiration handle(s)
  // keep round-tripping through save() and the "Instincts" step's done-check
  // exactly as before, instead of being silently dropped.
  const [voiceInspiration] = useState<string[]>(() =>
    (initial?.voiceInspiration ?? "").split(",").map(s => s.trim()).filter(Boolean)
  )
  const [examples,         setExamples]         = useState<string[]>(() => {
    const raw = initial?.examples ?? ""
    if (!raw) return []
    if (raw.startsWith("[")) {
      try { return JSON.parse(raw) as string[] } catch {}
    }
    const byDouble = raw.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
    return byDouble.length > 1 ? byDouble : raw.split("\n").map(s => s.trim()).filter(Boolean)
  })
  const [newPost,  setNewPost]  = useState("")
  const [adding,   setAdding]   = useState(false)
  const [rules,    setRules]    = useState<string[]>(() =>
    (initial?.customRules ?? "").split("\n").map(s => s.trim()).filter(Boolean)
  )
  // Doubles as the preset-library search box and the free-text "type your
  // own instinct" input — one field, per the UX spec (search filters the
  // library live; Enter with no matching preset adds it as a custom
  // instinct, exactly like the old newRule input did).
  const [instinctQuery, setInstinctQuery] = useState("")
  // Collapsed by default — the full categorized library is an opt-in
  // "advanced browse" view, not shown alongside Popular by default (that
  // was the duplication problem with the previous design).
  const [browseAllOpen, setBrowseAllOpen] = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState("")

  // Snapshot of the last-saved (or initially-loaded) profile, used purely to
  // decide whether the Save/Update button should be visible. Only updates on
  // mount and right after a successful save — never on every keystroke — so
  // it stays a stable "what's actually persisted" baseline to diff against.
  const snapshot = (t: string[], vs: string, vi: string[], ex: string[], r: string[]) =>
    JSON.stringify({ t, vs, vi, ex, r })
  const baselineRef = useRef(snapshot(topics, voiceStyle, voiceInspiration, examples, rules))
  const isDirty = baselineRef.current !== snapshot(topics, voiceStyle, voiceInspiration, examples, rules)

  // Companion reaction system — drives Sprite animation + transient speech
  const [animCls,  setAnimCls]  = useState("sprite-float aminta-glow")
  const [speech,   setSpeech]   = useState<string | null>(null)
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const react = useCallback((msg: string, anim = "sprite-react aminta-glow") => {
    if (speechTimer.current) clearTimeout(speechTimer.current)
    if (animTimer.current)   clearTimeout(animTimer.current)
    setSpeech(msg)
    setAnimCls(anim)
    animTimer.current   = setTimeout(() => setAnimCls("sprite-float aminta-glow"), 420)
    speechTimer.current = setTimeout(() => setSpeech(null), 3800)
  }, [])

  const addTopic = () => {
    const t = newTopic.trim()
    if (!t || topics.includes(t) || topics.length >= 10) return
    setTopics(prev => [...prev, t])
    setNewTopic("")
  }
  const removeTopic = (i: number) => setTopics(prev => prev.filter((_, j) => j !== i))

  const STEPS = [
    { label: "Topics",           done: topics.length > 0 },
    { label: "Writing tone",     done: !!voiceStyle },
    { label: "Writing examples", done: examples.length >= 3 },
    { label: "Instincts",        done: voiceInspiration.length > 0 || rules.length > 0 },
  ]
  const learnedCount  = STEPS.filter(s => s.done).length
  const confidencePct = Math.round((learnedCount / 4) * 100)

  const baseMessage =
    learnedCount === 0 ? "Teach me your voice." :
    learnedCount === 1 ? "I'm starting to understand you." :
    learnedCount === 2 ? "I'm learning how you write." :
    learnedCount === 3 ? "I know your tone. I still need more examples." :
    "I recognize your writing habits now."

  const displayMessage = speech ?? baseMessage

  const addExample = () => {
    if (!newPost.trim()) return
    const next = [...examples, newPost.trim()]
    setExamples(next)
    setNewPost("")
    setAdding(false)
    if (next.length >= 3) {
      react("I think I'm starting to understand you.", "sprite-celebrate aminta-glow")
    } else {
      react("I learned something from this.")
    }
  }
  const removeExample = (i: number) => {
    setExamples(prev => prev.filter((_, j) => j !== i))
    react("Memory faded.", "sprite-think aminta-glow")
  }

  const handleVoiceStyle = (id: string) => {
    setVoiceStyle(id)
  }

  // Adds an instinct by its already-resolved internal prompt string
  // (whatever ends up stored/sent to the model — a preset's internalPrompt,
  // or raw custom text). Shared by both the preset chips and the free-text
  // Enter path so dedupe/cap logic lives in exactly one place.
  const addInstinct = (prompt: string) => {
    const p = prompt.trim()
    if (!p || rules.includes(p) || rules.length >= 10) return
    setRules(prev => [...prev, p])
    react("I'll remember that every time I write.")
  }

  const addPreset = (preset: InstinctPreset) => addInstinct(preset.internalPrompt)

  const addRule = () => {
    const typed = instinctQuery.trim()
    if (!typed) return
    // Typing a preset's own label (e.g. "no hashtags") maps to that preset's
    // internal prompt instead of storing the label text as a second, oddly-
    // worded duplicate of the same intent — see instinctPresets.ts.
    const matched = PRESET_BY_LABEL.get(typed.toLowerCase())
    addInstinct(matched ? matched.internalPrompt : typed)
    setInstinctQuery("")
  }
  const removeRule = (i: number) => setRules(prev => prev.filter((_, j) => j !== i))

  const save = async () => {
    setError("")
    if (!topics.length) { setError("I need to know what you write about first."); return }
    if (!voiceStyle)    { setError("Pick the tone that fits how you sound."); return }
    await onSave({
      niche:            topics.join(", "),
      tone:             voiceStyle,
      voiceStyle,
      voiceInspiration: voiceInspiration.join(", "),
      examples:         JSON.stringify(examples),
      customRules:      rules.join("\n"),
    })
    baselineRef.current = snapshot(topics, voiceStyle, voiceInspiration, examples, rules)
    setSaved(true)
    react("I feel more like you now.", "sprite-celebrate aminta-sparkle")
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-3 pb-4">

      {/* ── Hero ── */}
      <Card glow={tint} className="animate-card-in">
        <div className="flex items-center gap-4">
          <Sprite xp={store.xp ?? 0} size={56} animClass={animCls} />

          <div className="flex-1 min-w-0">
            {/* Confidence readout */}
            <div className="flex items-end gap-1 mb-1.5">
              <span
                className="font-pixel leading-none"
                style={{ fontSize: 20, color: tint, lineHeight: 1 }}>
                {confidencePct}
              </span>
              <span
                className="font-pixel leading-none mb-[3px]"
                style={{ fontSize: 10, color: tint + "88" }}>
                %
              </span>
              <span
                className="font-pixel leading-none mb-[3px] ml-1"
                style={{ fontSize: 7, color: C.textDim }}>
                voice confidence
              </span>
            </div>

            {/* Live speech / status — transitions between reaction and base */}
            <p
              key={displayMessage}
              className="text-[11px] leading-snug mb-3 animate-fade-in"
              style={{ color: speech ? tint : C.text }}>
              {displayMessage}
            </p>

            {/* Pixel step checklist — 2-col */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-[7px]">
              {STEPS.map(({ label, done }) => (
                <PixelStep key={label} done={done} label={label} tint={tint} />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Teaching sections — one unified card ── */}
      <Card pad={false} className="animate-card-in overflow-hidden" style={{ animationDelay: "30ms" }}>

        {/* Topics */}
        <div className="p-4">
          <SectionHead label="What you write about" tipKey="niche" />
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {topics.map((topic, i) => (
                <span
                  key={i}
                  className="group/chip inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px]"
                  style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}`, color: C.text }}>
                  {topic}
                  <button
                    onClick={() => removeTopic(i)}
                    className="opacity-30 group-hover/chip:opacity-80 hover:!opacity-100 transition-opacity leading-none"
                    style={{ color: C.textDim, fontSize: 14 }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {topics.length < 10 && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
              <input
                value={newTopic}
                onChange={e => setNewTopic(e.target.value)}
                placeholder={topics.length === 0 ? "e.g. indie hacking, AI tools, B2B SaaS…" : "Add another topic…"}
                className="flex-1 bg-transparent text-[11px] outline-none min-w-0"
                style={{ color: C.text }}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); addTopic() }
                  if (e.key === "Escape") setNewTopic("")
                }}
              />
              {newTopic.trim() && (
                <button
                  onClick={addTopic}
                  className="font-pixel text-[7px] shrink-0"
                  style={{ color: tint }}>
                  Add
                </button>
              )}
            </div>
          )}
        </div>

        <Divider />

        {/* Voice style */}
        <div className="p-4">
          <SectionHead label="How you sound" tipKey="voice" />
          <div className="grid grid-cols-2 gap-2">
            {VOICE_STYLES.map(({ id, desc }) => {
              const active = voiceStyle === id
              return (
                <button
                  key={id}
                  onClick={() => handleVoiceStyle(id)}
                  className="relative text-left p-3 rounded-xl transition-all duration-150 active:scale-[0.97]"
                  style={{
                    border:          `2px solid ${active ? tint : C.border}`,
                    backgroundColor: active ? tint + "10" : "transparent",
                    transform:       active ? "scale(1.015)" : "scale(1)",
                    boxShadow:       active ? `0 0 20px ${tint}20` : "none",
                  }}>
                  <p className="font-pixel text-[7px] mb-1" style={{ color: active ? tint : C.text }}>{id}</p>
                  <p className="text-[9px] leading-snug" style={{ color: active ? tint + "bb" : C.textDim }}>{desc}</p>
                </button>
              )
            })}
          </div>
          {voiceStyle && (
            <p
              className="mt-3 text-[11px] italic leading-relaxed"
              style={{ color: C.textDim, borderLeft: `2px solid ${tint}44`, paddingLeft: 10 }}>
              "{STYLE_PREVIEWS[voiceStyle]}"
            </p>
          )}
        </div>

        <Divider />

        {/* Memory */}
        <div className="p-4">
          <SectionHead
            label="Aminta's memory"
            tipKey="examples"
            meta={
              <div className="flex items-center gap-[4px]">
                {[0, 1, 2, 3, 4].map(i => (
                  <svg key={i} width="5" height="5" viewBox="0 0 5 5" style={{ imageRendering: "pixelated", display: "block" }}>
                    {i < examples.length
                      ? <rect x="0" y="0" width="5" height="5" fill={tint} />
                      : <rect x="0" y="0" width="5" height="5" fill="none" stroke={C.border} strokeWidth="1" />
                    }
                  </svg>
                ))}
              </div>
            }
          />

          <p className="text-[10px] -mt-1 mb-3 leading-relaxed" style={{ color: C.textDim }}>
            {examples.length === 0
              ? "Paste real things you've written. Raw drafts are fine."
              : examples.length === 1
                ? "One more example and I'll start understanding your pacing."
                : examples.length === 2
                  ? "One more and I'll have enough to write in your voice."
                  : `${examples.length} memories. I'm beginning to understand how you write.`
            }
          </p>

          <div className="space-y-2">
            {examples.map((post, i) => {
              const lesson = MEMORY_LESSONS[i % MEMORY_LESSONS.length]
              const depth  = post.length < 60 ? "brief" : post.length < 160 ? "clear" : "rich"
              return (
                <div
                  key={i}
                  className="group rounded-xl p-3"
                  style={{ backgroundColor: C.cardInner }}>
                  <div className="flex items-start gap-2.5">
                    <svg width="5" height="5" viewBox="0 0 5 5" className="shrink-0 mt-[3px]" style={{ imageRendering: "pixelated" }}>
                      <rect x="0" y="0" width="5" height="5" fill={tint + "88"} />
                    </svg>
                    <p className="flex-1 text-[11px] leading-relaxed break-words min-w-0" style={{ color: C.text }}>
                      {post}
                    </p>
                    <button
                      onClick={() => removeExample(i)}
                      className="shrink-0 leading-none opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
                      style={{ color: C.textDim, fontSize: 14, marginTop: 0 }}>
                      ×
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 pl-[13px]">
                    <span
                      className="font-pixel text-[6px] px-1.5 py-[3px] rounded"
                      style={{ backgroundColor: tint + "15", color: tint }}>
                      ✓ {lesson}
                    </span>
                    <span className="font-pixel text-[6px]" style={{ color: C.textDim }}>{depth}</span>
                  </div>
                </div>
              )
            })}

            {examples.length === 0 && !adding && (
              <div
                className="rounded-xl py-7 flex flex-col items-center gap-2 cursor-pointer transition-colors"
                style={{ border: `1px dashed ${C.border}` }}
                onClick={() => setAdding(true)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = tint + "55" }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border }}>
                <p className="font-pixel text-[7px]" style={{ color: C.textDim }}>no memories yet.</p>
                <p className="text-[10px]" style={{ color: C.textDim }}>your real posts are my best teacher.</p>
              </div>
            )}

            {adding ? (
              <div className="rounded-xl p-2.5" style={{ backgroundColor: C.cardInner, border: `1px solid ${tint}44` }}>
                <textarea
                  value={newPost}
                  onChange={e => setNewPost(e.target.value)}
                  rows={2}
                  placeholder="Paste something you've actually written…"
                  autoFocus
                  className="w-full text-[12px] bg-transparent resize-none outline-none leading-relaxed"
                  style={{ color: C.text }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addExample()
                    if (e.key === "Escape") { setNewPost(""); setAdding(false) }
                  }}
                />
                <div className="flex items-center gap-3 mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                  <button
                    onClick={addExample}
                    disabled={!newPost.trim()}
                    className="font-pixel text-[8px] disabled:opacity-30 transition-opacity"
                    style={{ color: tint }}>
                    Save memory
                  </button>
                  <button
                    onClick={() => { setNewPost(""); setAdding(false) }}
                    className="font-pixel text-[8px]"
                    style={{ color: C.textDim }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : examples.length < 5 ? (
              <button
                onClick={() => setAdding(true)}
                className="w-full rounded-xl py-3 font-pixel text-[7px] flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.98]"
                style={{ border: `1px solid ${C.border}`, color: C.text }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = tint + "66"
                  e.currentTarget.style.color = tint
                  e.currentTarget.style.backgroundColor = tint + "08"
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.border
                  e.currentTarget.style.color = C.text
                  e.currentTarget.style.backgroundColor = "transparent"
                }}>
                + Teach me another post
              </button>
            ) : null}
          </div>
        </div>

        <Divider />

        {/* Instincts / rules */}
        <div className="p-4">
          <SectionHead label="Instincts (optional)" tipKey="rules" />
          {rules.length === 0 && (
            <p className="text-[10px] mb-3 leading-relaxed" style={{ color: C.textDim }}>
              Writing preferences I should always follow. Search, pick a popular one, or type your own.
            </p>
          )}

          {/* 1. Selected — same chip UI as before, nothing changed here. A
              rule that matches a preset's internalPrompt displays that
              preset's friendly label; anything else (pre-existing freeform
              instincts, and any genuinely custom one) displays as the raw
              text it's always been. */}
          {rules.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {rules.map((rule, i) => (
                <span
                  key={i}
                  className="group/chip inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px]"
                  style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}`, color: C.text }}>
                  {PRESET_BY_PROMPT.get(rule)?.label ?? rule}
                  <button
                    onClick={() => removeRule(i)}
                    className="opacity-30 group-hover/chip:opacity-80 hover:!opacity-100 transition-opacity leading-none"
                    style={{ color: C.textDim, fontSize: 14 }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {rules.length < 10 && (() => {
            const query = instinctQuery.trim()
            const isSearching = query.length > 0
            // Never duplicate a selected instinct anywhere in this picker —
            // Popular, search results, and Browse-all all exclude whatever
            // is already in `rules`.
            const unselected = (list: InstinctPreset[]) =>
              list.filter(p => !rules.includes(p.internalPrompt))
            const searchResults = isSearching ? unselected(searchInstinctPresets(query)) : []
            const popular = unselected(POPULAR_INSTINCT_PRESETS)

            return (
              <>
                {/* 2. Search — directly under Selected. Doubles as the
                    free-text input; Enter adds a matching preset (if the
                    typed text is one) or a custom instinct otherwise. */}
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3"
                  style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
                  <input
                    value={instinctQuery}
                    onChange={e => setInstinctQuery(e.target.value)}
                    placeholder="Search or create an instinct…"
                    className="flex-1 bg-transparent text-[11px] outline-none min-w-0"
                    style={{ color: C.text }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); addRule() }
                      if (e.key === "Escape") setInstinctQuery("")
                    }}
                  />
                  {query && (
                    <button
                      onClick={addRule}
                      className="font-pixel text-[7px] shrink-0"
                      style={{ color: tint }}>
                      Add
                    </button>
                  )}
                </div>

                {isSearching ? (
                  // Actively searching — replace Popular/Browse-all with a
                  // flat list of matches so nothing shows twice.
                  searchResults.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {searchResults.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => addPreset(preset)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                          style={{ border: `1px solid ${C.border}`, color: C.textDim }}>
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] leading-relaxed" style={{ color: C.textDim }}>
                      No matching instinct — press Enter to add "{query}" as a custom instinct.
                    </p>
                  )
                ) : (
                  <>
                    {/* 3. Popular — quick-add chips only, 8 curated defaults */}
                    {popular.length > 0 && (
                      <>
                        <p className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: C.textDim }}>Popular</p>
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                          {popular.map(preset => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => addPreset(preset)}
                              className="px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                              style={{ border: `1px solid ${C.border}`, color: C.textDim }}>
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {/* 4. Browse all — collapsed by default; the full
                        categorized library is an advanced/opt-in view, not
                        shown alongside Popular. */}
                    <button
                      type="button"
                      onClick={() => setBrowseAllOpen(v => !v)}
                      className="text-[10px] underline-offset-2 hover:underline"
                      style={{ color: C.textDim }}>
                      {browseAllOpen ? "Hide full library" : "Browse all instincts"}
                    </button>

                    {browseAllOpen && (
                      <div className="mt-2.5 max-h-40 overflow-y-auto pr-1 space-y-2.5">
                        {INSTINCT_CATEGORIES.map(category => {
                          const inCategory = unselected(
                            INSTINCT_PRESETS.filter(p => p.category === category)
                          )
                          if (inCategory.length === 0) return null
                          return (
                            <div key={category}>
                              <p className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: C.textGhost }}>
                                {category}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {inCategory.map(preset => (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => addPreset(preset)}
                                    className="px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                                    style={{ border: `1px solid ${C.border}`, color: C.textDim }}>
                                    {preset.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            )
          })()}

          {rules.length > 0 && (
            <p className="text-[10px] mt-2" style={{ color: C.textDim }}>
              I'll follow {rules.length === 1 ? "this instinct" : `these ${rules.length} instincts`} in every generation.
            </p>
          )}
        </div>

      </Card>

      {/* ── Save — only shown once there's something unsaved to act on ── */}
      {(isDirty || saved) && (
        <div className="space-y-2 pt-1 animate-fade-in">
          {error && (
            <p className="text-[11px] text-center animate-fade-in" style={{ color: "#f87171" }}>{error}</p>
          )}
          {saved && (
            <p className="font-pixel text-[8px] text-center animate-toast-up" style={{ color: tint }}>
              Saved ✓. I feel more like you now.
            </p>
          )}
          <button
            onClick={save}
            className="btn-pixel w-full py-3.5 rounded-xl font-pixel text-[9px] text-black active:scale-[0.98] transition-all duration-150"
            style={{
              backgroundColor: tint,
              boxShadow: saved ? `0 0 28px ${tint}55` : `0 2px 14px ${tint}30`,
            }}>
            {saved
              ? "Saved ✓"
              : learnedCount === 4
                ? "Update Aminta"
                : learnedCount === 0
                  ? "Save & Start Teaching"
                  : `Save & Keep Teaching  ${learnedCount}/4`
            }
          </button>
          {learnedCount < 4 && !saved && (
            <p className="text-[10px] text-center leading-relaxed" style={{ color: C.textDim }}>
              {learnedCount === 0 && "Start with your topics and a writing tone."}
              {learnedCount === 1 && "One section done. Each one sharpens my voice."}
              {learnedCount === 2 && "Writing examples will make the biggest difference."}
            </p>
          )}
        </div>
      )}

      {/* Voice Refresh — same Train surface, not a separate section. */}
      <VoiceRefreshCard store={store} onRefreshed={onRefreshed ?? (() => {})} />

    </div>
  )
}

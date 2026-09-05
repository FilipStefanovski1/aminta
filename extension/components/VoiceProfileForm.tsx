import { useCallback, useEffect, useRef, useState } from "react"

import { getStageTint } from "~lib/evolution"
import {
  INSTINCT_CATEGORIES,
  INSTINCT_PRESETS,
  POPULAR_INSTINCT_PRESETS,
  PRESET_BY_LABEL,
  PRESET_BY_PROMPT,
  findConflictingPreset,
  parseCustomRules,
  searchInstinctPresets,
  type InstinctPreset,
} from "~lib/instinctPresets"
import { getStore } from "~lib/storage"
import type { AmintaStore, VoiceProfile } from "~lib/storage"
import { getOrBuildStyleProfile } from "~lib/styleProfile"
import { summarizeStyleProfile } from "~lib/styleProfileSummary"
import { parseExamples, serializeExamples } from "~lib/trainingExamples"
import { C } from "~lib/theme"
import { normalizePersonalContext } from "~lib/personalContext"
import PersonalContextField from "~components/PersonalContextField"
import { Card, Sprite } from "~components/ui"
import VoiceRefreshCard from "~components/VoiceRefreshCard"

// Free users build DNA from manual examples alone — no cap tuned for a
// single-add-at-a-time flow anymore now that bulk paste is the primary
// path. Anything past ~10 stops adding real confidence anyway (see
// computeConfidenceScore in lib/styleProfile.ts), so this is generous
// headroom, not an invitation to paste unlimited text into one prompt.
const MAX_EXAMPLES = 15

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

const INFO_TIPS: Record<string, string> = {
  niche:       "Be specific. 'crypto' is too broad, 'DeFi protocol security' is useful. Aminta uses this to stay on-topic when generating.",
  voice:       "Pick the style closest to how you actually write, not how you want to write. Aminta mimics your current voice, not an ideal one.",
  examples:    "Paste 3–5 real posts you've written. The more authentic, the better Aminta learns your patterns.",
  rules:       "Things Aminta must never do. Examples: 'no hashtags', 'keep under 200 chars', 'never say leverage'.",
  about:       "Background about you — what you do, what you're building, what you're into. Aminta only uses it when it's relevant to what you're writing, and never invents anything beyond what you write here.",
}

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

function SectionHead({ label, tipKey, desc, meta }: { label: string; tipKey: string; desc?: string; meta?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <p className="font-pixel text-[10px] uppercase tracking-widest" style={{ color: C.text }}>{label}</p>
          <InfoTip tip={INFO_TIPS[tipKey]} />
        </div>
        {meta}
      </div>
      {desc && (
        <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: C.textFaint }}>{desc}</p>
      )}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, backgroundColor: C.borderSoft, margin: "0 -16px" }} />
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
  const [examples,         setExamples]         = useState<string[]>(() => parseExamples(initial?.examples))
  // Personal Context — background about WHO the user is, editable here
  // after onboarding. Same canonical field the onboarding step writes
  // (voice.personalContext), never a second copy.
  const [personalContext,  setPersonalContext]  = useState(() => normalizePersonalContext(initial?.personalContext))
  const [newPost,  setNewPost]  = useState("")
  const [adding,   setAdding]   = useState(false)
  const [rules,    setRules]    = useState<string[]>(() => parseCustomRules(initial?.customRules))
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
  const snapshot = (t: string[], vs: string, vi: string[], ex: string[], r: string[], pc: string) =>
    JSON.stringify({ t, vs, vi, ex, r, pc })
  const baselineRef = useRef(snapshot(topics, voiceStyle, voiceInspiration, examples, rules, personalContext))
  const isDirty = baselineRef.current !== snapshot(topics, voiceStyle, voiceInspiration, examples, rules, personalContext)

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
  const learnedCount = STEPS.filter(s => s.done).length

  // Human-readable state from real data — no fabricated "voice confidence %"
  // and no permanent checklist. One honest sentence answering "how does
  // Aminta learn how I write right now" — X Voice Refresh (if it's ever
  // run) is the most concrete signal; manual training is the fallback; an
  // empty profile is the honest "still learning" state, not a 0% badge.
  const hasAnyTraining = topics.length > 0 || !!voiceStyle || examples.length > 0 || !!store.styleProfile
  const dnaStatusLine =
    store.lastVoiceRefreshAt
      ? "Your voice was refreshed recently."
      : hasAnyTraining
        ? "Your voice is trained from your writing examples."
        : "Aminta is still learning your voice."

  // What Aminta actually learned, in plain language — reused from the same
  // summary Voice Refresh already computed (lib/styleProfileSummary.ts),
  // now surfaced here regardless of whether the profile came from X or
  // manual training, since both populate the same StyleProfile.
  const learned = summarizeStyleProfile(store.styleProfile)
  const [showLearned, setShowLearned] = useState(false)

  const displayMessage = speech ?? dnaStatusLine

  // One example at a time — each save persists immediately (same
  // onSave()/getOrBuildStyleProfile() pipeline every other training path
  // already goes through) so it survives a refresh without the user having
  // to separately hit the bottom "Save & Keep Teaching" button. If this
  // account's DNA is X-history-sourced, getOrBuildStyleProfile's early
  // return keeps firing exactly as before, so adding an example can never
  // silently overwrite a Voice-Refreshed profile — it only ever adds
  // examples available for the next successful Voice Refresh + manual
  // retrain to use.
  const addExample = async () => {
    const text = newPost.trim()
    if (!text) return
    const next = [...examples, text]
    setExamples(next)
    setNewPost("")
    setAdding(false)
    try {
      await onSave({
        niche:            topics.join(", "),
        tone:             voiceStyle,
        voiceStyle,
        voiceInspiration: voiceInspiration.join(", "),
        examples:         serializeExamples(next),
        customRules:      rules.join("\n"),
        personalContext:  normalizePersonalContext(personalContext),
      })
      baselineRef.current = snapshot(topics, voiceStyle, voiceInspiration, next, rules, personalContext)
      const freshStore = await getStore()
      await getOrBuildStyleProfile(freshStore)
      onRefreshed?.()
    } catch {
      // Local state already has the new example — the bottom "Save & Keep
      // Teaching" button (isDirty) covers retrying the persist.
    }
    if (next.length >= 3) {
      react("I think I'm starting to understand you.", "sprite-celebrate aminta-glow")
    } else {
      react("I learned something from this.")
    }
  }
  const removeExample = (i: number) => {
    setExamples(prev => prev.filter((_, j) => j !== i))
    react("Removed.", "sprite-think aminta-glow")
  }

  const handleVoiceStyle = (id: string) => {
    setVoiceStyle(id)
  }

  // Adds an instinct by its already-resolved internal prompt string
  // (whatever ends up stored/sent to the model — a preset's internalPrompt,
  // or raw custom text). Shared by both the preset chips and the free-text
  // Enter path so dedupe/cap logic lives in exactly one place. `matched` is
  // the preset it resolved from, if any — only presets carry conflict
  // metadata, so a freely-typed custom instinct is never blocked this way.
  const addInstinct = (prompt: string, matched?: InstinctPreset) => {
    const p = prompt.trim()
    if (!p || rules.includes(p) || rules.length >= 10) return
    const conflict = findConflictingPreset(matched, rules)
    if (conflict) {
      react(`That conflicts with "${conflict.label}," which you already have.`, "sprite-think aminta-glow")
      return
    }
    setRules(prev => [...prev, p])
    react("I'll remember that every time I write.")
  }

  const addPreset = (preset: InstinctPreset) => addInstinct(preset.internalPrompt, preset)

  // Typing a preset's own label (e.g. "no hashtags") maps to that preset's
  // internal prompt instead of storing the label text as a second, oddly-
  // worded duplicate of the same intent — see instinctPresets.ts. Also
  // collapses internal whitespace (never rewrites the actual wording).
  const resolveInstinctInput = (raw: string): { prompt: string; matched?: InstinctPreset } => {
    const typed = raw.trim().replace(/\s+/g, " ")
    const matched = PRESET_BY_LABEL.get(typed.toLowerCase())
    return { prompt: matched ? matched.internalPrompt : typed, matched }
  }

  // Only freeform custom instincts are editable in place — a preset's own
  // wording is fixed by design (see instinctPresets.ts), so a preset-backed
  // rule only ever gets removed and replaced, never rewritten.
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null)

  const startEditRule = (i: number) => {
    if (PRESET_BY_PROMPT.has(rules[i])) return
    setEditingRuleIndex(i)
    setInstinctQuery(rules[i])
  }
  const cancelEditRule = () => {
    setEditingRuleIndex(null)
    setInstinctQuery("")
  }

  const submitInstinctQuery = () => {
    const raw = instinctQuery.trim()
    if (!raw) return
    const { prompt, matched } = resolveInstinctInput(raw)

    if (editingRuleIndex !== null) {
      const others = rules.filter((_, j) => j !== editingRuleIndex)
      if (others.includes(prompt)) { cancelEditRule(); return }
      const conflict = findConflictingPreset(matched, others)
      if (conflict) {
        react(`That conflicts with "${conflict.label}," which you already have.`, "sprite-think aminta-glow")
        return
      }
      setRules(prev => prev.map((r, j) => (j === editingRuleIndex ? prompt : r)))
      cancelEditRule()
      react("Got it — updated.")
      return
    }

    addInstinct(prompt, matched)
    setInstinctQuery("")
  }
  const removeRule = (i: number) => {
    setRules(prev => prev.filter((_, j) => j !== i))
    if (editingRuleIndex === i) cancelEditRule()
  }

  const save = async () => {
    setError("")
    if (!topics.length) { setError("I need to know what you write about first."); return }
    if (!voiceStyle)    { setError("Pick the tone that fits how you sound."); return }
    await onSave({
      niche:            topics.join(", "),
      tone:             voiceStyle,
      voiceStyle,
      voiceInspiration: voiceInspiration.join(", "),
      examples:         serializeExamples(examples),
      customRules:      rules.join("\n"),
      personalContext:  normalizePersonalContext(personalContext),
    })
    baselineRef.current = snapshot(topics, voiceStyle, voiceInspiration, examples, rules, personalContext)
    setSaved(true)
    react("I feel more like you now.", "sprite-celebrate aminta-sparkle")
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-4 pb-4">

      {/* ── Aminta DNA status — one honest sentence, no checklist, no fake
          confidence score. Answers "how does Aminta learn how I write." ── */}
      <Card glow={tint} className="animate-card-in">
        <p className="font-pixel text-[10px] uppercase tracking-widest mb-3" style={{ color: C.text }}>Voice status</p>
        <div className="flex items-center gap-4">
          <Sprite xp={store.xp ?? 0} size={56} animClass={animCls} />

          <div className="flex-1 min-w-0">
            <p
              key={displayMessage}
              className="text-[13px] font-medium leading-snug animate-fade-in"
              style={{ color: speech ? tint : C.text }}>
              {displayMessage}
            </p>

            {learned.length > 0 && (
              <button
                onClick={() => setShowLearned(v => !v)}
                className="text-[11px] mt-1.5 leading-none block"
                style={{ color: tint }}>
                {showLearned ? "Hide details" : "View what Aminta learned"}
              </button>
            )}
          </div>
        </div>

        {showLearned && learned.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
            <div className="space-y-2.5">
              {learned.map((s) => (
                <div key={s.title}>
                  <p className="text-[10px] leading-none mb-1" style={{ color: C.textFaint }}>{s.title}</p>
                  {s.inline && (
                    <p className="text-[10px] leading-snug" style={{ color: C.textDim }}>{s.inline}</p>
                  )}
                  {s.lines.map((line) => (
                    <p key={line} className="text-[10px] leading-snug" style={{ color: C.textDim }}>
                      {s.lines.length > 1 ? `• ${line}` : line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Voice Refresh — Pro/Founder only, stays at the top: it's their
          primary training action. Free users train manually first (below);
          Voice Refresh appears later as an optional upsell, never as a
          gate in front of manual training. */}
      {store.aiIncludedPaid && (
        <VoiceRefreshCard store={store} onRefreshed={onRefreshed ?? (() => {})} />
      )}

      {/* ── Teaching sections — one unified card ── */}
      <Card pad={false} className="animate-card-in overflow-hidden" style={{ animationDelay: "30ms" }}>

        {/* Voice style */}
        <div className="p-5">
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
        </div>

        <Divider />

        {/* About you — Personal Context. Background knowledge (who they are,
            what they're building), NOT writing style: it sits alongside the
            other teaching sections rather than inside Writing examples,
            because it never feeds StyleProfile extraction. Same field the
            onboarding step writes. */}
        <div className="p-5">
          <SectionHead
            label="About you"
            tipKey="about"
            desc="Background Aminta can draw on — what you do, what you're building, what you care about. Used only when it's relevant."
          />
          <PersonalContextField
            value={personalContext}
            onChange={setPersonalContext}
            tint={tint}
            rows={5}
          />
        </div>

        <Divider />

        {/* Writing examples */}
        <div className="p-5">
          <SectionHead
            label="Writing examples"
            tipKey="examples"
            desc="Add real posts you've written. Aminta learns your style."
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

          <div className="space-y-2">
            {examples.map((post, i) => (
              <div
                key={i}
                className="group rounded-xl p-3"
                style={{ backgroundColor: C.cardInner }}>
                <div className="flex items-start gap-2.5">
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
              </div>
            ))}

            {adding ? (
              <div className="rounded-xl p-2.5" style={{ backgroundColor: C.cardInner, border: `1px solid ${tint}44` }}>
                <textarea
                  value={newPost}
                  onChange={e => setNewPost(e.target.value)}
                  rows={2}
                  placeholder="Paste a post you've actually written…"
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
                    Save example
                  </button>
                  <button
                    onClick={() => { setNewPost(""); setAdding(false) }}
                    className="font-pixel text-[8px]"
                    style={{ color: C.textDim }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : examples.length < MAX_EXAMPLES ? (
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
                + Add writing example
              </button>
            ) : null}
          </div>
        </div>

        <Divider />

        {/* Instincts / rules */}
        <div className="p-5">
          <SectionHead label="Instincts (optional)" tipKey="rules" desc="Rules Aminta should always follow." />

          {/* 1. Selected — a rule that matches a preset's internalPrompt
              displays that preset's friendly label and isn't editable (its
              wording is fixed by design, see instinctPresets.ts); anything
              else — freeform custom instincts — can be clicked to edit in
              place instead of remove-and-retype. No icon marks this: the
              label itself becomes the click target, same as any other text
              button in this file. */}
          {rules.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {rules.map((rule, i) => {
                const preset = PRESET_BY_PROMPT.get(rule)
                const editable = !preset
                const editing = editingRuleIndex === i
                return (
                  <span
                    key={i}
                    className="group/chip inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px]"
                    style={{
                      backgroundColor: C.cardInner,
                      border: `1px solid ${editing ? tint : C.border}`,
                      color: C.text,
                    }}>
                    {editable ? (
                      <button onClick={() => startEditRule(i)} className="text-left">
                        {rule}
                      </button>
                    ) : (
                      preset.label
                    )}
                    <button
                      onClick={() => removeRule(i)}
                      className="opacity-30 group-hover/chip:opacity-80 hover:!opacity-100 transition-opacity leading-none"
                      style={{ color: C.textDim, fontSize: 14 }}>
                      ×
                    </button>
                  </span>
                )
              })}
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
                    typed text is one) or a custom instinct otherwise. While
                    editing an existing custom instinct (see
                    startEditRule), this same field holds its current text
                    and Enter/Save replaces it in place instead of adding. */}
                {editingRuleIndex !== null && (
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px]" style={{ color: C.textFaint }}>Editing instinct</span>
                    <button onClick={cancelEditRule} className="text-[10px]" style={{ color: C.textDim }}>
                      Cancel
                    </button>
                  </div>
                )}
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3"
                  style={{ backgroundColor: C.cardInner, border: `1px solid ${editingRuleIndex !== null ? tint : C.border}` }}>
                  <input
                    value={instinctQuery}
                    onChange={e => setInstinctQuery(e.target.value)}
                    placeholder="Search or create an instinct…"
                    className="flex-1 bg-transparent text-[11px] outline-none min-w-0"
                    style={{ color: C.text }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); submitInstinctQuery() }
                      if (e.key === "Escape") cancelEditRule()
                    }}
                  />
                  {query && (
                    <button
                      onClick={submitInstinctQuery}
                      className="font-pixel text-[7px] shrink-0"
                      style={{ color: tint }}>
                      {editingRuleIndex !== null ? "Save" : "Add"}
                    </button>
                  )}
                </div>

                {/* Suggestions are hidden while editing an existing custom
                    instinct — clicking a preset here would otherwise ADD a
                    new rule instead of updating the one being edited, which
                    is confusing. The input above still works normally. */}
                {editingRuleIndex === null && (isSearching ? (
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
                ))}
              </>
            )
          })()}

          {rules.length > 0 && (
            <p className="text-[10px] mt-2" style={{ color: C.textDim }}>
              I'll follow {rules.length === 1 ? "this instinct" : `these ${rules.length} instincts`} in every generation.
            </p>
          )}
        </div>

        <Divider />

        {/* Topics — supporting context, demoted to a single compact row */}
        <div className="p-5">
          <SectionHead label="Topics" tipKey="niche" />
          <div className="flex flex-wrap gap-2">
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
            {topics.length < 10 && (
              <div
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
                style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
                <input
                  value={newTopic}
                  onChange={e => setNewTopic(e.target.value)}
                  placeholder={topics.length === 0 ? "e.g. indie hacking, AI tools, B2B SaaS…" : "Add another…"}
                  className="bg-transparent text-[10px] outline-none min-w-[90px]"
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
        </div>

      </Card>

      {/* ── Voice Refresh — Free users only, as a low-key optional upsell
          after manual training, never a gate. */}
      {!store.aiIncludedPaid && (
        <VoiceRefreshCard store={store} onRefreshed={onRefreshed ?? (() => {})} />
      )}

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

    </div>
  )
}

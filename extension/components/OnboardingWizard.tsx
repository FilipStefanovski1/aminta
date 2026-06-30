import { useEffect, useState } from "react"

import type { AmintaStore, VoiceProfile } from "~lib/storage"
import { C } from "~lib/theme"
import { Card, PrimaryButton, SectionLabel, Sprite, SpeechBubble } from "~components/ui"

interface Props {
  store: AmintaStore
  onDone: (patch: Partial<AmintaStore>) => Promise<void>
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

const TOTAL = 6

function Dots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {Array.from({ length: TOTAL }).map((_, i) => (
        <span key={i} className="rounded-full transition-all"
          style={{
            width: i === current ? 14 : 6, height: 6,
            backgroundColor: i <= current ? C.mint : C.border,
          }} />
      ))}
    </div>
  )
}

const inputCls = "input-pixel w-full rounded-xl px-3 py-3 text-sm"

export default function OnboardingWizard({ store, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [niche, setNiche] = useState(store.voice?.niche || store.interests || "")
  const [voiceStyle, setVoiceStyle] = useState(store.voice?.voiceStyle || "")
  const [examples, setExamples] = useState<string[]>(() => {
    const raw = store.voice?.examples ?? ""
    return raw ? raw.split("\n").filter(s => s.trim()) : []
  })
  const [draft, setDraft] = useState("")
  const [apiKey, setApiKey] = useState(store.apiKey || "")
  const [finishing, setFinishing] = useState(false)

  const next = () => setStep(s => s + 1)
  const addExample = () => { if (draft.trim()) { setExamples(p => [...p, draft.trim()]); setDraft("") } }

  // Auto-advance the "learning" screen
  useEffect(() => {
    if (step !== 5) return
    const t = setTimeout(() => finish(), 2200)
    return () => clearTimeout(t)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async () => {
    if (finishing) return
    setFinishing(true)
    const voice: VoiceProfile = {
      niche,
      tone: voiceStyle,
      voiceStyle,
      examples: examples.join("\n"),
      voiceInspiration: store.voice?.voiceInspiration || "",
      customRules: store.voice?.customRules || "",
    }
    await onDone({ interests: niche, voice, apiKey, onboardingDone: true })
  }

  return (
    <div className="absolute inset-0 flex flex-col px-5 py-6" style={{ backgroundColor: C.bg }}>

      {/* Progress */}
      <div className="shrink-0 mb-8">
        <Dots current={step} />
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── 0 · Welcome ── */}
        {step === 0 && (
          <div className="animate-slide-up flex flex-col items-center text-center pt-6">
            <Sprite xp={0} size={96} />
            <div className="mt-6">
              <SpeechBubble text="hi. i'm aminta." />
            </div>
            <h2 className="font-pixel text-[11px] mt-8 leading-relaxed" style={{ color: C.text }}>
              I help creators<br />stay consistent.
            </h2>
            <p className="text-[12px] mt-3 leading-relaxed" style={{ color: C.textFaint }}>
              You write. You post. I grow.<br />Let's learn your voice — takes a minute.
            </p>
          </div>
        )}

        {/* ── 1 · Topic ── */}
        {step === 1 && (
          <div className="animate-slide-up space-y-5">
            <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
              What do you<br />write about?
            </h2>
            <Card>
              <SectionLabel>Your topics</SectionLabel>
              <input value={niche} onChange={(e) => setNiche(e.target.value)} autoFocus
                placeholder="e.g. indie hacking, AI tools, fitness" className={inputCls} />
              <p className="text-[10px] mt-2" style={{ color: C.textGhost }}>Be specific — it makes everything sharper.</p>
            </Card>
          </div>
        )}

        {/* ── 2 · Sound ── */}
        {step === 2 && (
          <div className="animate-slide-up space-y-5">
            <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
              How do you<br />usually sound?
            </h2>
            <Card>
              <div className="grid grid-cols-2 gap-2">
                {VOICE_STYLES.map((s) => {
                  const active = voiceStyle === s
                  return (
                    <button key={s} onClick={() => setVoiceStyle(s)}
                      className="py-2.5 px-3 rounded-xl border-2 text-xs font-medium transition-all active:scale-[0.96]"
                      style={{
                        borderColor: active ? C.mint : C.border,
                        backgroundColor: active ? C.mint + "12" : "transparent",
                        color: active ? C.mint : C.textDim,
                      }}>{s}</button>
                  )
                })}
              </div>
              {voiceStyle && (
                <p className="text-[10px] mt-3 italic leading-relaxed pt-2.5" style={{ color: C.textFaint, borderTop: `1px solid ${C.border}` }}>
                  "{STYLE_PREVIEWS[voiceStyle]}"
                </p>
              )}
            </Card>
          </div>
        )}

        {/* ── 3 · Examples ── */}
        {step === 3 && (
          <div className="animate-slide-up space-y-5">
            <div>
              <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                Show me a few<br />things you wrote.
              </h2>
              <p className="text-[12px] mt-3" style={{ color: C.textFaint }}>Paste 3 of your posts. This is how I learn you.</p>
            </div>
            <Card>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>Your posts</SectionLabel>
                <span className="font-pixel text-[6px]" style={{ color: examples.length >= 3 ? C.mint : C.textGhost }}>{examples.length}/3+</span>
              </div>
              <div className="space-y-2">
                {examples.map((p, i) => (
                  <div key={i} className="group flex gap-2 rounded-xl p-2.5" style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
                    <p className="flex-1 text-[11px] leading-relaxed break-words min-w-0" style={{ color: "#ccc" }}>{p}</p>
                    <button onClick={() => setExamples(prev => prev.filter((_, j) => j !== i))}
                      className="shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: C.textGhost }}>✕</button>
                  </div>
                ))}
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
                  placeholder="Paste a post, then press Add…" className={`${inputCls} resize-none`}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addExample() }} />
                <button onClick={addExample} disabled={!draft.trim()}
                  className="w-full rounded-xl py-2 font-pixel text-[7px] disabled:opacity-40 transition-colors"
                  style={{ border: `1px dashed ${C.border}`, color: C.mint }}>+ Add post</button>
              </div>
            </Card>
          </div>
        )}

        {/* ── 4 · Connect AI ── */}
        {step === 4 && (
          <div className="animate-slide-up space-y-5">
            <div>
              <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                One last thing.
              </h2>
              <p className="text-[12px] mt-3 leading-relaxed" style={{ color: C.textFaint }}>
                I run on your own AI key, so you stay in control. A free Groq key works great.
              </p>
            </div>
            <Card>
              <SectionLabel>AI key</SectionLabel>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoFocus
                placeholder="gsk_…  ·  AIza…  ·  sk-or-…" className={inputCls} />
              <p className="text-[10px] mt-2 leading-relaxed" style={{ color: C.textGhost }}>
                Free key at <span style={{ color: C.mint }}>console.groq.com/keys</span>. Stored on your device only.
              </p>
            </Card>
          </div>
        )}

        {/* ── 5 · Learning ── */}
        {step === 5 && (
          <div className="animate-slide-up flex flex-col items-center text-center pt-10">
            <Sprite xp={0} size={96} animClass="sprite-react aminta-glow" />
            <div className="mt-6">
              <SpeechBubble text="learning your voice…" />
            </div>
            <p className="text-[12px] mt-8" style={{ color: C.textFaint }}>Getting ready to write with you.</p>
          </div>
        )}

      </div>

      {/* ── Footer action ── */}
      <div className="shrink-0 pt-4 space-y-2">
        {step === 0 && <PrimaryButton onClick={next}>Meet Aminta →</PrimaryButton>}
        {step === 1 && <PrimaryButton onClick={next} disabled={!niche.trim()}>Continue →</PrimaryButton>}
        {step === 2 && <PrimaryButton onClick={next} disabled={!voiceStyle}>Continue →</PrimaryButton>}
        {step === 3 && (
          <>
            <PrimaryButton onClick={next} disabled={examples.length < 1}>Continue →</PrimaryButton>
            <button onClick={next} className="w-full text-center text-[10px] py-1 transition-colors"
              style={{ color: C.textGhost }}>Skip for now</button>
          </>
        )}
        {step === 4 && (
          <>
            <PrimaryButton onClick={next} disabled={!apiKey.trim()}>Continue →</PrimaryButton>
            <button onClick={next} className="w-full text-center text-[10px] py-1 transition-colors"
              style={{ color: C.textGhost }}>I'll add it later</button>
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from "react"

import type { AmintaStore, VoiceProfile } from "~lib/storage"
import { C } from "~lib/theme"
import { isGoogleKey, isGroqKey } from "~lib/ai"
import { dispatchGenerate } from "~lib/backendGenerate"
import { shouldUseIncludedAi } from "~lib/entitlements"
import { FORMS } from "~lib/evolution"
import DemonMascot from "~components/DemonMascot"
import { Card, PrimaryButton, SectionLabel, Sprite, SpeechBubble } from "~components/ui"

// The companion's final evolved form — used only as an aspirational teaser
// on the last onboarding screen ("this is what you're building toward"),
// not tied to the user's actual (level 1) progress.
const FINAL_FORM = FORMS[FORMS.length - 1]

// Small ambient pixel motes drifting around the mascot on the final screen.
const AMBIENT_PARTICLES = Array.from({ length: 6 }, (_, i) => ({
  angle: (i / 6) * 360,
  dist: i % 2 === 0 ? 58 : 46,
  size: i % 3 === 0 ? 3 : 2,
  delay: `${i * 0.42}s`,
}))

interface Props {
  store: AmintaStore
  onDone: (patch: Partial<AmintaStore>) => Promise<void>
}

// ─── Intent (step 1) ────────────────────────────────────────────────────────
// Purely a UI seed for the early demo generation below — never persisted to
// AmintaStore/synced/backed by a new field. Its only job is picking a
// starting prompt so the very first generation has *something* to write
// about before any real customization (topics/tone/examples) exists.

const INTENT_OPTIONS = [
  { id: "posts",   label: "Write posts",   desc: "Create something from scratch.",   seed: "an introduction post about who you are and what you're building" },
  { id: "replies", label: "Reply to posts", desc: "Respond to conversations.",        seed: "a post about jumping into more conversations on X" },
  { id: "grow",    label: "Grow on X",      desc: "Ideas, strategy and consistency.", seed: "a post about showing up consistently on X" },
] as const
type IntentId = typeof INTENT_OPTIONS[number]["id"]

// ─── Topics ────────────────────────────────────────────────────────────────

const SUGGESTED_TOPICS = [
  "AI", "Startups", "Crypto", "Web3", "Design", "Product", "Indie hacking",
  "SaaS", "Marketing", "Fitness", "Productivity", "Personal growth", "Memes",
  "Tech", "Investing", "Career", "Founder journey", "Building in public",
]

const MAX_TOPICS = 5
const MAX_TOPIC_LEN = 32

function normalizeTopic(raw: string): string {
  return raw.trim().slice(0, MAX_TOPIC_LEN)
}

// Splits on commas, trims, caps length, dedupes case-insensitively, caps count.
function parseTopics(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(",")) {
    if (out.length >= MAX_TOPICS) break
    const t = normalizeTopic(part)
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

// ─── Tones ─────────────────────────────────────────────────────────────────

const MAX_TONES = 3

const TONE_OPTIONS: { id: string; desc: string }[] = [
  { id: "Casual",            desc: "Relaxed and conversational, like texting a friend." },
  { id: "Professional",      desc: "Polished, buttoned-up, and businesslike." },
  { id: "Friendly",          desc: "Warm and approachable." },
  { id: "Authentic",         desc: "Honest and unpolished, true to how you actually talk." },
  { id: "Confident",         desc: "States things plainly, no hedging." },
  { id: "Humble",            desc: "Downplays wins, credits others." },
  { id: "Direct",            desc: "No fluff. Point first." },
  { id: "Concise",           desc: "Says more with fewer words." },
  { id: "Conversational",    desc: "Reads like natural speech, not a press release." },
  { id: "Analytical",        desc: "Explains ideas with logic and evidence." },
  { id: "Educational",       desc: "Teaches something in every post." },
  { id: "Storytelling",      desc: "Uses personal experiences and narratives." },
  { id: "Opinionated",       desc: "Takes a clear stance instead of sitting on the fence." },
  { id: "Insightful",        desc: "Notices what other people miss." },
  { id: "Practical",         desc: "Focused on what's actually useful." },
  { id: "Builder",           desc: "Shares progress and things you're creating." },
  { id: "Technical",         desc: "Precise and detail-heavy, written for practitioners." },
  { id: "Visionary",         desc: "Paints the bigger picture and what's next." },
  { id: "Data-driven",       desc: "Backs claims with numbers." },
  { id: "Contrarian",        desc: "Challenges common beliefs to spark discussion." },
  { id: "Bold",              desc: "Says the thing other people won't." },
  { id: "Witty",             desc: "Sharp, dry, quick with a line." },
  { id: "Funny",             desc: "Goes for the laugh." },
  { id: "Playful",           desc: "Light and fun, doesn't take itself seriously." },
  { id: "Motivational",      desc: "Energy and momentum. Pushes the reader forward." },
  { id: "Inspirational",     desc: "Uplifting, focused on what's possible." },
  { id: "Curious",           desc: "Asks questions and explores out loud." },
  { id: "Thought-provoking", desc: "Leaves the reader thinking after they scroll past." },
]
const TONE_DESC: Record<string, string> = Object.fromEntries(TONE_OPTIONS.map(t => [t.id, t.desc]))

// Splits on commas, trims, dedupes case-insensitively, caps count.
function parseTones(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(",")) {
    if (out.length >= MAX_TONES) break
    const t = part.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

// ─── AI key / provider detection ──────────────────────────────────────────

type Provider = "groq" | "gemini" | "openrouter" | "unknown"

function detectProvider(key: string): Provider {
  const k = key.trim()
  if (!k) return "unknown"
  if (isGroqKey(k)) return "groq"
  if (isGoogleKey(k)) return "gemini"
  if (k.startsWith("sk-or-")) return "openrouter"
  return "unknown"
}

const PROVIDER_LABEL: Record<Provider, string> = {
  groq: "Groq", gemini: "Gemini", openrouter: "OpenRouter", unknown: "",
}
const PROVIDER_COLOR: Record<Provider, string> = {
  groq: "#f97316", gemini: "#4a90d9", openrouter: "#a78bfa", unknown: C.textGhost,
}

// A key that's present but clearly malformed (too short / has whitespace) —
// not a full validity check (that happens server-side on first generation),
// just enough to catch an obvious copy/paste mistake with a friendly nudge.
function looksMalformed(key: string): boolean {
  const k = key.trim()
  if (!k) return false
  if (detectProvider(k) !== "unknown") return false
  return k.length < 20 || /\s/.test(k)
}

type ProviderInfoKey = "gemini" | "openrouter"
const PROVIDER_INFO: Record<ProviderInfoKey, { title: string; points: string[]; url: string; cta: string }> = {
  gemini: {
    title: "Google Gemini",
    points: ["Generous free tier", "Great quality", "Easy to obtain"],
    url: "https://aistudio.google.com/apikey",
    cta: "Get a Gemini key →",
  },
  openrouter: {
    title: "OpenRouter",
    points: ["Supports Claude, GPT, Gemini, DeepSeek and many more", "One key, hundreds of models"],
    url: "https://openrouter.ai/keys",
    cta: "Get an OpenRouter key →",
  },
}

// Step order — value before customization, not after:
//   0 Welcome
//   1 Intent            (seeds the step-3 demo generation only)
//   2 Choose your AI     (BYOK only — see next()/back() below: Included AI
//                         accounts never see this step at all, not even
//                         briefly, since shouldUseIncludedAi() already tells
//                         us up front there's nothing to ask for)
//   3 Generate first post (moved early — value before any setup investment)
//   4 "Now make Aminta sound more like you" (transition into customization)
//   5 Topics
//   6 Tone
//   7 Examples ("what sounds exactly like you")
//   8 Learning (auto-advancing transition — now makes sense: real voice data exists)
//   9 Payoff — confirms progress, no XP/progression framing (that's an
//     in-product mechanic users discover later, not an onboarding concept)
const TOTAL = 10

function Dots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {Array.from({ length: TOTAL }).map((_, i) => {
        const isCurrent = i === current
        const isDone    = i < current
        return (
          <span key={i} className="rounded-full transition-all"
            style={{
              width: isCurrent ? 16 : 6, height: 6,
              backgroundColor: isCurrent ? C.mint : isDone ? C.mint + "80" : C.border,
            }} />
        )
      })}
    </div>
  )
}

const inputCls = "input-pixel w-full rounded-xl px-3 py-3 text-sm"

export default function OnboardingWizard({ store, onDone }: Props) {
  const [step, setStep] = useState(0)

  // ── Intent ──
  const [intent, setIntent] = useState<IntentId | "">("")

  // ── Topics ──
  const [topics, setTopics]     = useState<string[]>(() =>
    parseTopics(store.voice?.niche || store.interests || "")
  )
  const [topicDraft, setTopicDraft] = useState("")

  // ── Tones ──
  const [tones, setTones] = useState<string[]>(() =>
    parseTones(store.voice?.voiceStyle || store.voice?.tone || "")
  )

  const [examples, setExamples] = useState<string[]>(() => {
    const raw = store.voice?.examples ?? ""
    return raw ? raw.split("\n").filter(s => s.trim()) : []
  })

  // First name only — reads more natural than the full display name in a
  // one-line greeting. Skips the generic "Aminta user" fallback (ensureProfile's
  // neutral default for an account with no usable name) rather than greeting
  // someone by that literal string.
  const greetName = (() => {
    const dn = store.displayName?.trim()
    if (!dn || dn === "Aminta user") return ""
    return dn.split(/\s+/)[0]
  })()
  const [draft, setDraft] = useState("")
  const [apiKey, setApiKey] = useState(store.apiKey || "")
  const [finishing, setFinishing] = useState(false)
  const [providerInfoOpen, setProviderInfoOpen] = useState<ProviderInfoKey | null>(null)
  const [faqOpen, setFaqOpen] = useState(false)

  // Same entitlement check dispatchGenerate() itself uses (lib/entitlements.ts)
  // — if it's true, dispatchGenerate ignores apiKey entirely and calls the
  // Included-AI backend instead, so the "Choose your AI" step has nothing to
  // ask for and the first-post generation never needs a key at all.
  const includedAi = shouldUseIncludedAi(store)

  // ── First post (step 3) ──
  // Reuses dispatchGenerate() exactly as GeneratorPanel does — no new AI
  // plumbing. Runs here BEFORE topics/tone/examples exist yet (that's the
  // point — value before setup), seeded only by the intent picked in step 1.
  const [firstPost, setFirstPost] = useState("")
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState("")
  const [copied, setCopied] = useState(false)

  // Step 2 ("Choose your AI") is skipped entirely for Included AI accounts —
  // reuses the same `includedAi` value computed once below (see
  // shouldUseIncludedAi import), never a second/duplicate entitlement check.
  // Step 8 is a 2.2s auto-advancing transition ("learning your voice…"), not
  // a real step — going back from step 9 must skip straight to step 7, or
  // the auto-advance effect below would immediately forward past it again.
  const next = () => setStep(s => (s === 1 && includedAi ? 3 : s + 1))
  const back = () => setStep(current => {
    if (current === 9) return 7
    if (current === 3 && includedAi) return 1
    return Math.max(0, current - 1)
  })
  const addExample = () => { if (draft.trim()) { setExamples(p => [...p, draft.trim()]); setDraft("") } }

  // ── Topic chip logic ──
  const addTopics = (raw: string) => {
    setTopics(prev => {
      if (prev.length >= MAX_TOPICS) return prev
      const seen = new Set(prev.map(t => t.toLowerCase()))
      const next = [...prev]
      for (const part of raw.split(",")) {
        if (next.length >= MAX_TOPICS) break
        const t = normalizeTopic(part)
        if (!t) continue
        const key = t.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        next.push(t)
      }
      return next
    })
  }
  const removeTopic = (i: number) => setTopics(prev => prev.filter((_, j) => j !== i))
  const toggleSuggestedTopic = (topic: string) => {
    const key = topic.toLowerCase()
    if (topics.some(t => t.toLowerCase() === key)) {
      setTopics(prev => prev.filter(t => t.toLowerCase() !== key))
    } else {
      addTopics(topic)
    }
  }
  const commitTopicDraft = () => {
    if (topicDraft.trim()) {
      addTopics(topicDraft)
      setTopicDraft("")
    }
  }
  const handleTopicKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      commitTopicDraft()
    } else if (e.key === "Tab") {
      if (topicDraft.trim()) commitTopicDraft() // let focus move as normal
    } else if (e.key === "Backspace" && !topicDraft && topics.length > 0) {
      setTopics(prev => prev.slice(0, -1))
    }
  }
  const handleTopicPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text")
    if (text.includes(",")) {
      e.preventDefault()
      addTopics(text)
      setTopicDraft("")
    }
  }

  // ── Tone chip logic ──
  const toggleTone = (id: string) => {
    setTones(prev => {
      if (prev.includes(id)) return prev.filter(t => t !== id)
      if (prev.length >= MAX_TONES) return prev
      return [...prev, id]
    })
  }

  // ── AI key ──
  const provider   = detectProvider(apiKey)
  const malformed  = looksMalformed(apiKey)
  const canGenerate = includedAi || !!apiKey.trim()

  // Auto-advance the "learning" screen into the payoff step
  useEffect(() => {
    if (step !== 8) return
    const t = setTimeout(() => setStep(9), 2200)
    return () => clearTimeout(t)
  }, [step])

  // Fire the demo generation as soon as the step is reached, so there's
  // already something on screen rather than a blank state waiting for a
  // click. Only runs once per visit to the step (guarded by firstPost/
  // generating being empty) — going Back and Continue again won't
  // re-generate or double-fire.
  useEffect(() => {
    if (step !== 3 || firstPost || generating) return
    if (!canGenerate) return // no key, not entitled — nothing to generate with
    generateFirstPost()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function generateFirstPost() {
    setGenerating(true)
    setGenerateError("")
    try {
      // Topics/tone/examples don't exist yet at this point in the flow by
      // design — the voice profile here is intentionally near-empty, same
      // as any first-time GeneratorPanel use before Train has been touched.
      const voice: VoiceProfile = {
        niche: "",
        tone: "",
        voiceStyle: "",
        examples: "",
        voiceInspiration: store.voice?.voiceInspiration || "",
        customRules: store.voice?.customRules || "",
      }
      const seed = INTENT_OPTIONS.find(o => o.id === intent)?.seed ?? "an introduction post"
      const text = await dispatchGenerate(
        { ...store, apiKey },
        {
          generationMode: "tweet",
          input: seed,
          voice,
          styleProfile: null,
          tone: "direct",
          length: "short",
        }
      )
      setFirstPost(text)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Couldn't generate a post right now.")
    } finally {
      setGenerating(false)
    }
  }

  async function copyFirstPost() {
    if (!firstPost) return
    await navigator.clipboard.writeText(firstPost)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const finish = async (openX: boolean) => {
    if (finishing) return
    setFinishing(true)
    const voice: VoiceProfile = {
      niche: topics.join(", "),
      tone: tones.join(", "),
      voiceStyle: tones.join(", "),
      examples: examples.join("\n"),
      voiceInspiration: store.voice?.voiceInspiration || "",
      customRules: store.voice?.customRules || "",
    }
    if (openX) chrome.tabs.create({ url: "https://x.com" })
    await onDone({ interests: topics.join(", "), voice, apiKey, onboardingDone: true })
  }

  return (
    <div className="absolute inset-0 flex flex-col px-5 py-6" style={{ backgroundColor: C.bg }}>

      {/* Progress */}
      <div className="shrink-0 mb-8 relative flex items-center justify-center" style={{ minHeight: 16 }}>
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            aria-label="Back"
            className="absolute left-0 font-pixel text-[7px] uppercase tracking-widest transition-colors"
            style={{ color: C.textDim }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.text }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.textDim }}>
            ‹ Back
          </button>
        )}
        <Dots current={step} />
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── 0 · Welcome ──
            store.displayName is already populated by this point via the
            existing pullFromCloud() sync — set at signup by ensureProfile()
            from the X profile's name (see supabase-migration-x-first-
            profiles.sql). No new auth plumbing, no new API call: this is
            data the login already produced, just read for the first time
            here. Falls back to the generic greeting if it hasn't landed yet
            or resolved to the neutral "Aminta user" default. */}
        {step === 0 && (
          <div className="animate-slide-up flex flex-col items-center text-center pt-6">
            <SpeechBubble text={greetName ? `welcome, ${greetName} 👋` : "hi. i'm aminta."} />
            <div className="mt-4">
              <Sprite xp={0} size={96} />
            </div>
            <h2 className="font-pixel text-[11px] mt-8 leading-relaxed" style={{ color: C.text }}>
              Let&apos;s show you<br />what I can do.
            </h2>
            <p className="text-[12px] mt-3 leading-relaxed" style={{ color: C.textDim }}>
              One quick question, then I&apos;ll write<br />something for you.
            </p>
          </div>
        )}

        {/* ── 1 · Intent ── */}
        {step === 1 && (
          <div className="animate-slide-up space-y-5">
            <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
              What are you trying<br />to do today?
            </h2>
            <Card>
              <div className="space-y-2">
                {INTENT_OPTIONS.map((opt) => {
                  const active = intent === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setIntent(opt.id)}
                      className="w-full text-left px-3.5 py-3 rounded-xl border transition-all active:scale-[0.98]"
                      style={{
                        borderColor: active ? C.mint : C.border,
                        backgroundColor: active ? C.mint + "16" : "transparent",
                      }}>
                      <p className="text-[12px] font-medium" style={{ color: active ? C.mint : C.text }}>{opt.label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: active ? C.mint : C.textDim }}>{opt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ── 2 · Choose your AI ──
            Entitled (Included AI) accounts skip the key entirely — this is
            exactly the check dispatchGenerate() itself makes, so there's
            never a mismatch between what this step asks for and what
            generation actually needs. */}
        {step === 2 && (
          <div className="animate-slide-up space-y-5">
            {includedAi ? (
              <>
                <div>
                  <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                    You&apos;re ready.
                  </h2>
                  <p className="text-[12px] mt-3 leading-relaxed" style={{ color: C.textDim }}>
                    AI generation is already included.<br /><br />Let&apos;s write something.
                  </p>
                </div>
                <Card>
                  <p className="text-[12px] leading-relaxed font-medium" style={{ color: C.mint }}>
                    ✓ AI generation included on your plan
                  </p>
                </Card>
              </>
            ) : (
              <>
                <div>
                  <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                    Choose your AI
                  </h2>
                  <p className="text-[12px] mt-3 leading-relaxed" style={{ color: C.textDim }}>
                    Aminta runs using your own AI model, so your prompts stay private and under your control. You can use:
                  </p>
                  <ul className="mt-2 space-y-1">
                    <li className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>• <span style={{ color: C.text }}>Groq</span>: recommended, free, fastest</li>
                    <li className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>• <span style={{ color: C.text }}>Google Gemini</span>: free tier</li>
                    <li className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>• <span style={{ color: C.text }}>OpenRouter</span>: hundreds of models</li>
                    <li className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>• Your existing API key, if you already have one</li>
                  </ul>
                </div>

                <Card>
                  <SectionLabel>AI key</SectionLabel>

                  <div className="relative">
                    <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoFocus
                      placeholder="Paste your API key..." className={`${inputCls} ${provider !== "unknown" ? "pr-20" : ""}`} />
                    {provider !== "unknown" && (
                      <span
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-2 py-1 rounded-md"
                        style={{ backgroundColor: PROVIDER_COLOR[provider] + "22", color: PROVIDER_COLOR[provider] }}>
                        {PROVIDER_LABEL[provider]}
                      </span>
                    )}
                  </div>

                  {malformed && (
                    <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "#f5b50a" }}>
                      That doesn't look like a complete API key. Double check you copied the whole thing.
                    </p>
                  )}

                  <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
                    <p className="text-[11px] font-medium" style={{ color: C.mint }}>✓ Recommended: Groq, free, fastest</p>
                    <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer"
                      className="text-[11px] underline block" style={{ color: C.mint }}>
                      Get a free API key →
                    </a>
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    <button onClick={() => setProviderInfoOpen("gemini")}
                      className="text-[11px] underline transition-colors" style={{ color: C.textDim }}>
                      Use Gemini instead
                    </button>
                    <button onClick={() => setProviderInfoOpen("openrouter")}
                      className="text-[11px] underline transition-colors" style={{ color: C.textDim }}>
                      Use OpenRouter instead
                    </button>
                  </div>

                  {/* Collapsible FAQ */}
                  <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
                    <button onClick={() => setFaqOpen(v => !v)}
                      className="w-full flex items-center justify-between text-[11px] font-medium" style={{ color: C.textDim }}>
                      <span>Why do I need my own API key?</span>
                      <span style={{ transform: faqOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
                    </button>
                    {faqOpen && (
                      <p className="text-[11px] mt-2 leading-relaxed" style={{ color: C.textDim }}>
                        It keeps your prompts private, lets you choose your favorite model, and avoids monthly AI costs built into subscriptions.
                      </p>
                    )}
                  </div>
                </Card>

                <p className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>
                  You can always add or change your AI model in Settings.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── 3 · Generate your first post ──
            Runs dispatchGenerate() (auto-fired on entry, see the useEffect
            above) seeded only by the step-1 intent — topics/tone/examples
            don't exist yet on purpose, this is the value-before-setup step.
            If step 2 was skipped with no key and no entitlement, there's
            nothing to generate with; shown as its own state, not a silent
            failure. */}
        {step === 3 && (
          <div className="animate-slide-up flex flex-col items-center text-center pt-6">
            {!canGenerate && (
              <>
                <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                  Your first post.
                </h2>
                <Card className="w-full text-left mt-5">
                  <p className="text-[12px] leading-relaxed" style={{ color: C.textDim }}>
                    You skipped adding an AI model, so I don&apos;t have anything to write with yet.
                    Add one anytime in Settings, then come find me in the panel.
                  </p>
                </Card>
              </>
            )}

            {canGenerate && generating && (
              <div className="mt-8 flex flex-col items-center gap-3">
                <Sprite xp={0} size={96} animClass="sprite-react aminta-glow" />
                <p className="font-pixel text-[8px] tracking-widest" style={{ color: C.mint }}>one sec...</p>
              </div>
            )}

            {canGenerate && !generating && generateError && (
              <>
                <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                  Your first post.
                </h2>
                <Card className="w-full text-left mt-5">
                  <p className="text-[12px] leading-relaxed" style={{ color: "#f5b50a" }}>{generateError}</p>
                  <button onClick={generateFirstPost}
                    className="mt-3 text-[11px] underline font-medium" style={{ color: C.mint }}>
                    Try again
                  </button>
                </Card>
              </>
            )}

            {canGenerate && !generating && !generateError && firstPost && (
              <>
                <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                  I&apos;d post something like this.
                </h2>
                <Card className="w-full text-left mt-5">
                  <SectionLabel>Generated</SectionLabel>
                  <p className="text-[13px] leading-relaxed mt-2" style={{ color: "#ccc" }}>{firstPost}</p>
                  <button onClick={copyFirstPost}
                    className="w-full rounded-xl py-2.5 mt-3 text-[11px] font-semibold transition-colors"
                    style={{ border: `1px dashed ${C.mint}88`, color: C.mint }}>
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ── 4 · Transition into customization ── */}
        {step === 4 && (
          <div className="animate-slide-up flex flex-col items-center text-center pt-10">
            <SpeechBubble text="not bad, right?" />
            <div className="mt-4">
              <Sprite xp={0} size={96} />
            </div>
            <h2 className="font-pixel text-[11px] mt-8 leading-relaxed" style={{ color: C.text }}>
              Now make Aminta<br />sound more like you.
            </h2>
            <p className="text-[12px] mt-3 leading-relaxed" style={{ color: C.textDim }}>
              A few quick questions. Takes less than a minute.
            </p>
          </div>
        )}

        {/* ── 5 · Topic ── */}
        {step === 5 && (
          <div className="animate-slide-up space-y-5">
            <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
              What do you<br />write about?
            </h2>
            <Card>
              <SectionLabel>Your topics</SectionLabel>

              {topics.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {topics.map((topic, i) => (
                    <span key={i}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-lg text-[11px] font-medium"
                      style={{ backgroundColor: C.mint + "16", border: `1px solid ${C.mint}55`, color: C.mint }}>
                      {topic}
                      <button
                        onClick={() => removeTopic(i)}
                        aria-label={`Remove topic ${topic}`}
                        className="w-4 h-4 flex items-center justify-center rounded-full leading-none transition-colors"
                        style={{ color: C.mint }}>
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <input
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value)}
                onKeyDown={handleTopicKeyDown}
                onPaste={handleTopicPaste}
                autoFocus
                disabled={topics.length >= MAX_TOPICS}
                placeholder={topics.length >= MAX_TOPICS ? `Max ${MAX_TOPICS} topics` : "e.g. indie hacking, AI tools, fitness"}
                className={`${inputCls} disabled:opacity-50`}
              />

              <p className="text-[9px] uppercase tracking-widest mt-3 mb-2" style={{ color: C.textDim }}>Suggested</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_TOPICS.map((topic) => {
                  const key = topic.toLowerCase()
                  const active = topics.some(t => t.toLowerCase() === key)
                  const atCap  = !active && topics.length >= MAX_TOPICS
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleSuggestedTopic(topic)}
                      disabled={atCap}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                      style={{
                        border: `1px solid ${active ? C.mint : C.border}`,
                        backgroundColor: active ? C.mint + "16" : "transparent",
                        color: active ? C.mint : C.textDim,
                      }}>
                      {topic}
                    </button>
                  )
                })}
              </div>

              <p className="text-[11px] mt-3 leading-relaxed" style={{ color: C.textDim }}>
                Pick a few or type your own, up to {MAX_TOPICS}.
              </p>
            </Card>
          </div>
        )}

        {/* ── 6 · Sound ── */}
        {step === 6 && (
          <div className="animate-slide-up space-y-5">
            <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
              How do you<br />usually sound?
            </h2>
            <Card>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>Your tone</SectionLabel>
                <span className="text-[11px]" style={{ color: tones.length >= MAX_TONES ? C.mint : C.textDim }}>
                  {tones.length}/{MAX_TONES}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TONE_OPTIONS.map(({ id }) => {
                  const active = tones.includes(id)
                  const atCap  = !active && tones.length >= MAX_TONES
                  return (
                    <button key={id} onClick={() => toggleTone(id)} disabled={atCap}
                      className="px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all active:scale-[0.96] disabled:opacity-35 disabled:cursor-not-allowed"
                      style={{
                        borderColor: active ? C.mint : C.border,
                        backgroundColor: active ? C.mint + "16" : "transparent",
                        color: active ? C.mint : C.textDim,
                      }}>{id}</button>
                  )
                })}
              </div>
              {tones.length > 0 && (
                <div className="mt-3 pt-2.5 space-y-1" style={{ borderTop: `1px solid ${C.border}` }}>
                  {tones.map(t => (
                    <p key={t} className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>
                      <span style={{ color: C.mint }}>{t}</span>: {TONE_DESC[t] ?? ""}
                    </p>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── 7 · Examples ── */}
        {step === 7 && (
          <div className="animate-slide-up space-y-5">
            <div>
              <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                What&apos;s one post that<br />sounds exactly like you?
              </h2>
              <p className="text-[12px] mt-3" style={{ color: C.textDim }}>One is enough to start. This is how I learn you — add more anytime.</p>
            </div>
            <Card>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>Your posts</SectionLabel>
                <span className="text-[11px] font-medium" style={{ color: examples.length >= 1 ? C.mint : C.textDim }}>{examples.length} added</span>
              </div>
              <div className="space-y-2">
                {examples.map((p, i) => (
                  <div key={i} className="group flex gap-2 rounded-xl p-2.5" style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
                    <p className="flex-1 text-[11px] leading-relaxed break-words min-w-0" style={{ color: "#ccc" }}>{p}</p>
                    <button onClick={() => setExamples(prev => prev.filter((_, j) => j !== i))}
                      aria-label="Remove post"
                      className="shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: C.textDim }}>✕</button>
                  </div>
                ))}
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
                  placeholder="Paste a post, then press Add…" className={`${inputCls} resize-none`}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addExample() }} />
                <button onClick={addExample} disabled={!draft.trim()}
                  className="w-full rounded-xl py-2.5 text-[11px] font-semibold disabled:opacity-50 transition-colors"
                  style={{ border: `1px dashed ${C.mint}88`, color: C.mint }}>+ Add post</button>
              </div>
            </Card>
          </div>
        )}

        {/* ── 8 · Learning ── */}
        {step === 8 && (
          <div className="animate-slide-up flex flex-col items-center text-center pt-10">
            <SpeechBubble text="learning your voice…" />
            <div className="mt-4">
              <Sprite xp={0} size={96} animClass="sprite-react aminta-glow" />
            </div>
            <p className="text-[12px] mt-8" style={{ color: C.textDim }}>Getting ready to write with you.</p>
          </div>
        )}

        {/* ── 9 · Payoff — confirms progress, no XP/progression framing.
            "Feed Aminta" and XP are in-product mechanics users discover
            naturally once they're actually posting, not concepts to explain
            during onboarding. */}
        {step === 9 && (
          <div className="animate-slide-up flex flex-col items-center text-center pt-6">

            <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
              Nice.
            </h2>

            <p className="text-[12px] mt-2 leading-relaxed" style={{ color: C.textDim }}>
              Aminta already knows a little about you.<br />
              You&apos;ll be able to teach it even more over time.
            </p>

            {/* Mascot, final evolved form, with ambient particles */}
            <div className="relative flex items-center justify-center mt-5" style={{ width: 132, height: 132 }}>
              {AMBIENT_PARTICLES.map((p, i) => {
                const rad = (p.angle * Math.PI) / 180
                const dx  = Math.cos(rad) * p.dist
                const dy  = Math.sin(rad) * p.dist
                return (
                  <span key={i} className="pixel-particle absolute rounded-[1px]"
                    style={{
                      width: p.size, height: p.size, backgroundColor: C.mint,
                      top: "50%", left: "50%",
                      "--dx": `${dx}px`, "--dy": `${dy}px`,
                      animationDelay: p.delay,
                    } as React.CSSProperties} />
                )
              })}
              <DemonMascot skin={FINAL_FORM.skin} size={112} className="sprite-float aminta-glow" />
            </div>

            {/* Visual instruction card — functional info only, no XP mentions */}
            <Card className="w-full text-left mt-5" style={{ padding: 12 }}>
              <div className="space-y-1.5">
                {[
                  "Generate appears under the composer",
                  "Polish improves your draft",
                ].map((row) => (
                  <div key={row} className="flex items-center gap-2">
                    <svg width="6" height="6" viewBox="0 0 6 6" className="shrink-0" style={{ imageRendering: "pixelated" }}>
                      <rect x="0" y="0" width="6" height="6" fill={C.mint} />
                    </svg>
                    <span className="text-[11px] leading-snug" style={{ color: C.text }}>{row}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

      </div>

      {/* ── Footer action ── */}
      <div className="shrink-0 pt-4 space-y-2">
        {step === 0 && <PrimaryButton onClick={next}>Meet Aminta</PrimaryButton>}
        {step === 1 && <PrimaryButton onClick={next} disabled={!intent}>Continue</PrimaryButton>}
        {step === 2 && (
          includedAi ? (
            <PrimaryButton onClick={next}>Continue</PrimaryButton>
          ) : (
            <>
              <PrimaryButton onClick={next} disabled={!apiKey.trim()}>Continue</PrimaryButton>
              <button onClick={next} className="w-full text-center text-[11px] py-1 transition-colors"
                style={{ color: C.textDim }}>I'll add it later</button>
            </>
          )
        )}
        {step === 3 && (
          <PrimaryButton onClick={next} disabled={generating}>
            {generating ? "Writing…" : "Continue"}
          </PrimaryButton>
        )}
        {step === 4 && <PrimaryButton onClick={next}>Continue</PrimaryButton>}
        {step === 5 && <PrimaryButton onClick={next} disabled={topics.length === 0}>Continue</PrimaryButton>}
        {step === 6 && <PrimaryButton onClick={next} disabled={tones.length === 0}>Continue</PrimaryButton>}
        {step === 7 && (
          <>
            <PrimaryButton onClick={next} disabled={examples.length < 1}>Continue</PrimaryButton>
            <button onClick={next} className="w-full text-center text-[11px] py-1 transition-colors"
              style={{ color: C.textDim }}>Skip for now</button>
          </>
        )}
        {step === 9 && (
          <>
            <PrimaryButton onClick={() => finish(false)} disabled={finishing}
              className="hover:shadow-[0_0_24px_rgba(116,247,181,0.45)]">
              {finishing ? "Saving…" : "Enter Aminta →"}
            </PrimaryButton>
            <button onClick={() => finish(true)} disabled={finishing}
              className="w-full text-center text-[11px] py-1.5 font-medium transition-colors disabled:opacity-50"
              style={{ color: C.textDim }}>Or open x.com</button>
          </>
        )}
      </div>

      {/* ── Provider info dropdown (Gemini / OpenRouter) ── */}
      {providerInfoOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setProviderInfoOpen(null)} />
          <div className="absolute left-5 right-5 bottom-24 z-50 rounded-2xl p-4 animate-card-in"
            style={{ backgroundColor: "#252528", border: `1px solid ${C.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-pixel text-[9px]" style={{ color: C.text }}>{PROVIDER_INFO[providerInfoOpen].title}</p>
              <button onClick={() => setProviderInfoOpen(null)} aria-label="Close"
                className="text-[13px]" style={{ color: C.textDim }}>✕</button>
            </div>
            <ul className="space-y-1 mb-3">
              {PROVIDER_INFO[providerInfoOpen].points.map(p => (
                <li key={p} className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>• {p}</li>
              ))}
            </ul>
            <a href={PROVIDER_INFO[providerInfoOpen].url} target="_blank" rel="noreferrer"
              className="text-[11px] underline" style={{ color: C.mint }}>
              {PROVIDER_INFO[providerInfoOpen].cta}
            </a>
          </div>
        </>
      )}
    </div>
  )
}

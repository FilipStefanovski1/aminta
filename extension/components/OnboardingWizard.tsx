import { useEffect, useRef, useState } from "react"

import { getStore } from "~lib/storage"
import type { AmintaStore, VoiceProfile } from "~lib/storage"
import { C } from "~lib/theme"
import { isGoogleKey, isGroqKey } from "~lib/ai"
import { backendGenerate, dispatchGenerate } from "~lib/backendGenerate"
import { canUseByok, shouldUseIncludedAi } from "~lib/entitlements"
import { FORMS } from "~lib/evolution"
import { parseExamples, serializeExamples } from "~lib/trainingExamples"
import { fetchRecentXPosts, startXConnect, type RecentXPost } from "~lib/voiceRefresh"
import { focusOrCreateXTab } from "~lib/xTab"
import { normalizePersonalContext } from "~lib/personalContext"
import AiKeyInput from "~components/AiKeyInput"
import DemonMascot from "~components/DemonMascot"
import PersonalContextField from "~components/PersonalContextField"
import { Card, PrimaryButton, SectionLabel, Sprite, SpeechBubble } from "~components/ui"
import VoiceRefreshCard from "~components/VoiceRefreshCard"

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
  { id: "posts",   label: "Write posts",   desc: "Create something from scratch.",   seed: "a bold, specific take on why most people never actually start building the thing they talk about" },
  { id: "replies", label: "Reply to posts", desc: "Respond to conversations.",        seed: "a sharp, quotable thought about why persistence beats talent for people trying to grow online" },
  { id: "grow",    label: "Grow on X",      desc: "Ideas, strategy and consistency.", seed: "a contrarian but true insight about what actually makes posts take off on X" },
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

// A key that's present but clearly malformed (too short / has whitespace) —
// not a full validity check (that happens server-side on first generation),
// just enough to catch an obvious copy/paste mistake with a friendly nudge.
function looksMalformed(key: string): boolean {
  const k = key.trim()
  if (!k) return false
  if (detectProvider(k) !== "unknown") return false
  return k.length < 20 || /\s/.test(k)
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
//   7 Teach Aminta about you (Personal Context — WHO they are, placed after
//     the two quick chip pickers and before the writing-sample step, so the
//     two text-heavy steps sit together and the whole "about me" half of
//     the flow reads as one idea. Skippable, never blocks.)
//   8 Examples ("what sounds exactly like you")
//   9 Learning (auto-advancing transition — now makes sense: real voice data exists)
//  10 Payoff — confirms progress, no XP/progression framing (that's an
//     in-product mechanic users discover later, not an onboarding concept)
const TOTAL = 11

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

  const [examples, setExamples] = useState<string[]>(() => parseExamples(store.voice?.examples))

  // ── Personal context (step 7) ──
  // Seeded from any already-saved value so re-running onboarding (or going
  // Back) never silently wipes what the user previously wrote.
  const [personalContext, setPersonalContext] = useState(() =>
    normalizePersonalContext(store.voice?.personalContext)
  )

  // Local, refetchable copy of the store for VoiceRefreshCard (step 7) —
  // startXConnect()/runVoiceRefresh() write straight to chrome.storage.local
  // via lib/voiceRefresh.ts's own setStore() calls, entirely outside this
  // wizard's onDone()/onSave() flow (that only fires once, at the very end,
  // with the topics/tone/examples patch). Re-fetching into local state on
  // VoiceRefreshCard's onRefreshed is what makes "Connect X" / "Refresh my
  // voice" reflect immediately without waiting for onboarding to finish.
  const [voiceStore, setVoiceStore] = useState<AmintaStore>(store)
  const refetchVoiceStore = async () => setVoiceStore(await getStore())

  // ── Recent X posts (manual-training picker, step 7) ──
  // Deliberately NOT Voice Refresh: fetchRecentXPosts() has no plan gate, no
  // Gemini call, no allowance/cooldown, no credit cost — see
  // lib/voiceRefresh.ts's own doc comment and landing/app/api/x/recent-
  // posts/route.ts. Fetched once when X is connected; nothing here writes
  // to voice.examples until the user explicitly clicks "+ Add" on a card.
  const [recentXPosts, setRecentXPosts] = useState<RecentXPost[]>([])
  const [recentXLoading, setRecentXLoading] = useState(false)
  const [recentXError, setRecentXError] = useState("")
  const recentXFetchedFor = useRef<string | null>(null)

  useEffect(() => {
    if (step !== 8 || !voiceStore.xConnected) return
    if (recentXFetchedFor.current === voiceStore.xUsername) return // already fetched for this connection
    recentXFetchedFor.current = voiceStore.xUsername
    setRecentXLoading(true)
    setRecentXError("")
    fetchRecentXPosts()
      .then(setRecentXPosts)
      .catch((e) => setRecentXError(e instanceof Error ? e.message : "Couldn't load your recent posts."))
      .finally(() => setRecentXLoading(false))
  }, [step, voiceStore.xConnected, voiceStore.xUsername])

  const addRecentPost = (post: RecentXPost) => {
    if (examples.includes(post.text)) return // already added — no duplicates
    const next = [...examples, post.text]
    setExamples(next)
  }

  // Connecting X benefits a Free account too (the recent-posts picker
  // above), even though Voice Refresh itself stays Pro-only — VoiceRefreshCard's
  // own Free branch is a Pro upsell only and deliberately has no Connect
  // action, so Free + not-connected otherwise has no way to connect at all.
  const [connectingX, setConnectingX] = useState(false)

  const [draft, setDraft] = useState("")
  const [apiKey, setApiKey] = useState(store.apiKey || "")
  const [finishing, setFinishing] = useState(false)
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
    if (current === 10) return 8
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
  const malformed  = looksMalformed(apiKey)
  const canGenerate = includedAi || (canUseByok(store) && !!apiKey.trim())

  // Auto-advance the "learning" screen into the payoff step
  useEffect(() => {
    if (step !== 9) return
    const t = setTimeout(() => setStep(10), 2200)
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
      // This is a demo generation the product triggers, not one the user
      // explicitly asked for by pressing Generate — it must not consume a
      // normal content-generation credit (same principle as style_profile
      // being free). Included AI routes through the dedicated
      // "onboarding_demo" mode, which the server prices at 0 (see
      // landing/lib/ai/credits.ts) but otherwise builds the exact same
      // tweet-shaped prompt. BYOK has no credit concept to protect either
      // way, so it keeps using dispatchGenerate's normal "tweet" path.
      const text = includedAi
        ? await backendGenerate({
            generationMode: "onboarding_demo",
            input: seed,
            voice,
            styleProfile: null,
            tone: "witty",
            length: "medium",
          })
        : await dispatchGenerate(
            { ...store, apiKey },
            {
              generationMode: "tweet",
              input: seed,
              voice,
              styleProfile: null,
              tone: "witty",
              length: "medium",
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
      examples: serializeExamples(examples),
      voiceInspiration: store.voice?.voiceInspiration || "",
      customRules: store.voice?.customRules || "",
      // Skipped (or left empty) resolves to "" — a normal, valid state, not
      // a missing field. Multiline text is stored exactly as typed; only
      // trimmed and capped (see normalizePersonalContext).
      personalContext: normalizePersonalContext(personalContext),
    }
    if (openX) focusOrCreateXTab()
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
            Fixed, non-personalized copy — this used to greet by first name
            from store.displayName, which is sourced from whatever the X/
            Google OAuth metadata happened to contain (see ensureProfile()
            in landing/lib/auth/profileDefaults.ts) and isn't guaranteed to
            be a real human name. A raw, unvalidated value in a one-line
            greeting is exactly how something that reads as internal/broken
            (a handle, an id-like string) can end up in front of the user
            on their very first screen — simplest fix is not depending on
            it here at all. */}
        {step === 0 && (
          <div className="animate-slide-up flex flex-col items-center text-center pt-6">
            <SpeechBubble text="hey, I'm Aminta." />
            <div className="mt-4">
              <Sprite xp={0} size={96} />
            </div>
            <h2 className="font-pixel text-[11px] mt-8 leading-relaxed" style={{ color: C.text }}>
              Let&apos;s show you<br />what I can do.
            </h2>
          </div>
        )}

        {/* ── 1 · Intent ── */}
        {step === 1 && (
          <div className="animate-slide-up space-y-5">
            <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
              What do you want<br />my help with?
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
            ) : !canUseByok(store) ? (
              // Free account, not yet synced as aiIncluded (transient —
              // every Free account gets ai_included:true from the server,
              // see app/api/sync/route.ts) — never offer the BYOK key form
              // here: BYOK is Pro/Founder only, and a Free user typing a key
              // in this step would just hit a silent dead end once
              // dispatchGenerate's entitlement check drops it anyway.
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
                    Before we start...
                  </h2>
                  <p className="text-[12px] mt-3 leading-relaxed" style={{ color: C.textDim }}>
                    Pick the AI model you&apos;d like me to use. It&apos;s free, takes 30 seconds, and keeps your prompts completely private. You can use:
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

                  <div className="mt-1">
                    <AiKeyInput
                      value={apiKey}
                      onChange={setApiKey}
                      tint={C.mint}
                      autoFocus
                      belowInput={malformed && (
                        <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "#f5b50a" }}>
                          That doesn't look like a complete API key. Double check you copied the whole thing.
                        </p>
                      )}
                    />
                  </div>

                  {/* Collapsible FAQ — its own quiet section at the bottom */}
                  <div className="mt-6 pt-4" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
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
                  I&apos;d post this.
                </h2>
                <Card className="w-full text-left mt-5">
                  <p className="text-[13px] leading-relaxed" style={{ color: C.text }}>{firstPost}</p>
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
              A few quick questions, and I&apos;ll sound just like you.
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

        {/* ── 7 · Teach Aminta about you (Personal Context) ──
            Background knowledge that usually isn't visible in someone's
            posts — what they do, what they're building, what they care
            about. Deliberately ONE conversational field rather than a form
            of required sub-questions: people describe themselves in
            paragraphs, not in labelled boxes. Never blocks (see the Skip
            action in the footer) and costs 0 credits — nothing here calls
            a model, including the mic (browser speech API) and the helper
            prompt (local text + clipboard). */}
        {step === 7 && (
          <div className="animate-slide-up space-y-5">
            <div>
              <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                Teach Aminta<br />about you.
              </h2>
              <p className="text-[12px] mt-3 leading-relaxed" style={{ color: C.textDim }}>
                Anything that helps me understand you — what you do, what you&apos;re
                working on, what you care about, what you like talking about.
              </p>
            </div>
            <Card>
              <SectionLabel>About you</SectionLabel>
              <PersonalContextField
                value={personalContext}
                onChange={setPersonalContext}
                autoFocus
              />
              <p className="text-[11px] mt-3 leading-relaxed" style={{ color: C.textDim }}>
                I&apos;ll only use this when it&apos;s actually relevant to what you&apos;re writing.
              </p>
            </Card>
          </div>
        )}

        {/* ── 8 · Examples ──
            Two paths, both leading to the same StyleProfile: teach Aminta
            by pasting posts yourself (below), or let it learn from recent X
            posts via the existing Voice Refresh card (same component, same
            entitlement/eligibility logic Train already uses — see
            components/VoiceRefreshCard.tsx). Free users see its own inline
            upsell there, never a block on finishing onboarding. */}
        {step === 8 && (
          <div className="animate-slide-up space-y-5">
            <div>
              <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
                How should I learn<br />how you write?
              </h2>
              <p className="text-[12px] mt-3" style={{ color: C.textDim }}>Two ways — use either, or both. Add more anytime after onboarding.</p>
            </div>

            <VoiceRefreshCard store={voiceStore} onRefreshed={refetchVoiceStore} variant="onboarding" />

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ backgroundColor: C.border }} />
              <span className="text-[9px] uppercase tracking-widest" style={{ color: C.textDim }}>Or add it yourself</span>
              <div className="flex-1 h-px" style={{ backgroundColor: C.border }} />
            </div>

            {/* Free + not connected: VoiceRefreshCard's own Free branch is a
                Pro upsell only (no Connect action), but connecting X still
                helps a Free account here — it unlocks the recent-posts
                picker below, independent of Voice Refresh's own paid gate. */}
            {!voiceStore.xConnected && !voiceStore.aiIncludedPaid && (
              <Card>
                <p className="text-[11px] leading-snug" style={{ color: C.text }}>
                  Connect X to quickly add a few of your own recent posts.
                </p>
                <button
                  onClick={connectingX ? undefined : () => {
                    setConnectingX(true)
                    startXConnect().finally(() => setConnectingX(false))
                  }}
                  disabled={connectingX}
                  className="w-full rounded-lg py-2.5 mt-3 text-[11px] font-semibold text-black transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: C.mint }}>
                  {connectingX ? "Opening X…" : "Connect X"}
                </button>
              </Card>
            )}

            {/* Recent X posts — manual-training picker, not Voice Refresh.
                Only shown when X is actually connected (never fake/sample
                posts) and only while there's something worth showing.
                Fetching costs 0 Aminta credits; nothing here is saved as a
                training example until the user clicks + Add. */}
            {voiceStore.xConnected && (recentXLoading || recentXPosts.length > 0 || recentXError) && (
              <Card>
                <SectionLabel>Recent posts from your X</SectionLabel>
                {recentXLoading && (
                  <p className="text-[10px] mt-2" style={{ color: C.textDim }}>Loading your recent posts…</p>
                )}
                {!recentXLoading && recentXError && (
                  <p className="text-[10px] mt-2" style={{ color: C.textDim }}>{recentXError}</p>
                )}
                {!recentXLoading && recentXPosts.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {recentXPosts.map((post) => {
                      const added = examples.includes(post.text)
                      return (
                        <div key={post.id} className="flex items-start gap-2.5 rounded-xl p-2.5" style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
                          <p className="flex-1 text-[11px] leading-relaxed break-words min-w-0 whitespace-pre-line" style={{ color: C.text }}>
                            {post.text}
                          </p>
                          <button
                            onClick={() => addRecentPost(post)}
                            disabled={added}
                            className="shrink-0 text-[10px] font-semibold disabled:opacity-60"
                            style={{ color: added ? C.textDim : C.mint }}>
                            {added ? "Added ✓" : "+ Add"}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )}

            <Card>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>Your posts</SectionLabel>
                <span className="text-[11px] font-medium" style={{ color: examples.length >= 1 ? C.mint : C.textDim }}>{examples.length} added</span>
              </div>
              <div className="space-y-2">
                {examples.map((p, i) => (
                  <div key={i} className="group flex gap-2 rounded-xl p-2.5" style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
                    <p className="flex-1 text-[11px] leading-relaxed break-words min-w-0" style={{ color: C.text }}>{p}</p>
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
        {step === 9 && (
          <div className="animate-slide-up flex flex-col items-center text-center pt-10">
            <SpeechBubble text="learning your voice…" />
            <div className="mt-4">
              <Sprite xp={0} size={96} animClass="sprite-react aminta-glow" />
            </div>
            <p className="text-[12px] mt-8" style={{ color: C.textDim }}>Getting ready to write with you.</p>
          </div>
        )}

        {/* ── 9 · Payoff — orients toward the one next action (open X), no
            XP/progression framing and no feature checklist. The old bullet
            box ("Generate appears under the composer" / "Polish improves
            your draft") looked unfinished and explained nothing visually —
            removed rather than replaced with a different list. */}
        {step === 10 && (
          <div className="animate-slide-up flex flex-col items-center justify-center text-center min-h-full">

            <h2 className="font-pixel text-[11px] leading-relaxed" style={{ color: C.text }}>
              Nice.
            </h2>

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

            <h3 className="font-pixel text-[10px] mt-6 leading-relaxed" style={{ color: C.text }}>
              You&apos;re ready.
            </h3>

            <p className="text-[12px] mt-3 leading-relaxed max-w-[260px]" style={{ color: C.textDim }}>
              Open X and start writing. Aminta will appear right inside the composer.
            </p>
          </div>
        )}

      </div>

      {/* ── Footer action ── */}
      <div className="shrink-0 pt-4 space-y-2">
        {step === 0 && <PrimaryButton onClick={next}>Meet Aminta</PrimaryButton>}
        {step === 1 && <PrimaryButton onClick={next} disabled={!intent}>Continue</PrimaryButton>}
        {step === 2 && (
          includedAi || !canUseByok(store) ? (
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
            {generating ? "Writing…" : "Make it sound like me"}
          </PrimaryButton>
        )}
        {step === 4 && <PrimaryButton onClick={next}>Continue</PrimaryButton>}
        {step === 5 && <PrimaryButton onClick={next} disabled={topics.length === 0}>Continue</PrimaryButton>}
        {step === 6 && <PrimaryButton onClick={next} disabled={tones.length === 0}>Continue</PrimaryButton>}
        {step === 7 && (
          <>
            {/* Never a gate — an empty personal context is a completely
                normal state (and the default for every existing user). */}
            <PrimaryButton onClick={next}>Continue</PrimaryButton>
            <button onClick={next} className="w-full text-center text-[11px] py-1 transition-colors"
              style={{ color: C.textDim }}>Skip for now</button>
          </>
        )}
        {step === 8 && (
          <>
            {/* Either path satisfies this step — a completed Voice Refresh
                (voiceStore.styleProfile) counts exactly the same as a
                manually added example, so a Pro/Founder user who used the
                card above never has to also paste a post just to proceed. */}
            <PrimaryButton onClick={next} disabled={examples.length < 1 && !voiceStore.styleProfile}>Continue</PrimaryButton>
            <button onClick={next} className="w-full text-center text-[11px] py-1 transition-colors"
              style={{ color: C.textDim }}>Skip for now</button>
          </>
        )}
        {step === 10 && (
          <>
            {/* One clear primary action — finish(true) both completes
                onboarding AND opens X (focusOrCreateXTab, the existing
                safe focus-or-create-tab behavior); there is no longer a
                separate "Enter Aminta" that does something different. */}
            <PrimaryButton onClick={() => finish(true)} disabled={finishing}
              className="hover:shadow-[0_0_24px_rgba(116,247,181,0.45)]">
              {finishing ? "Saving…" : "Open X"}
            </PrimaryButton>
            <p className="text-[11px] text-center py-1.5" style={{ color: C.textGhost }}>
              You can keep teaching Aminta from Train anytime.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

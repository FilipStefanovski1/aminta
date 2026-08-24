import { useEffect, useRef, useState } from "react"

import { generate as runAI, generateFromImage, isGroqKey } from "~lib/ai"
import { backendGenerate, dispatchGenerate, runThreadGenerate } from "~lib/backendGenerate"
import type { CompanionEvent } from "~lib/companion"
import { todayLocal } from "~lib/dates"
import { getStageTint } from "~lib/evolution"
import { canUseByok, effectiveApiKey, shouldUseIncludedAi } from "~lib/entitlements"
import { fetchImageAsDataUrl } from "~lib/images"
import { findNextReplyTarget, readActivePost } from "~lib/messaging"
import { incrementMissionGenerates } from "~lib/missions"
import type { Mode, OutputLength, Platform, ThreadOption, ThreadPostCount, Tone } from "~lib/prompts"
import { generateReply } from "~lib/replyGeneration"
import { getOrBuildStyleProfile } from "~lib/styleProfile"
import type { AmintaStore, TemplateMode } from "~lib/storage"
import type { RunTemplateContext } from "~lib/templates"
import { C } from "~lib/theme"
import { PRICING_URL } from "~lib/webUrl"
import { incrementGenerations } from "~lib/xp"

import OutputCard from "~components/OutputCard"
import TemplatesModal from "~components/TemplatesModal"
import ThreadResults from "~components/ThreadResults"

// UI-level mode — "thread" is not part of lib/prompts.ts's Mode (tweet/
// reply/polish), which every single-post call site (XP, dispatchGenerate,
// OutputCard) is typed against. Keeping it a separate UI union means none
// of that shared plumbing has to special-case a 4th value it was never
// designed for.
type UiMode = Mode | "thread"

// ─── Mode config ───────────────────────────────────────────────────────────────

const MODE_CONFIG: { id: UiMode; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    id: "tweet",
    label: "Post",
    sub: "Create a new post",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    id: "reply",
    label: "Reply",
    sub: "Reply to someone",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "polish",
    label: "Polish",
    sub: "Improve your draft",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
  {
    id: "thread",
    label: "Thread",
    sub: "3 thread options",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="12" r="2.2" />
        <path d="M6 8.2V15.8M8 6.8l8 4M8 17.2l8-4" />
      </svg>
    ),
  },
]

// X is the only supported platform — kept as an explicit constant (rather
// than React state) purely so call sites that still expect a `Platform`
// value (buildMessages, readActivePost, OutputCard, template run context)
// don't need a separate single-value special case.
const PLATFORM: Platform = "x"

// ─── Tone config ──────────────────────────────────────────────────────────────

const TONE_CONFIG: { id: Tone; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: "direct",
    label: "Direct",
    desc: "Short. Clear.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    id: "witty",
    label: "Witty",
    desc: "Clever. Playful.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="9" cy="10.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10.5" r="1" fill="currentColor" stroke="none" />
        <path d="M8.5 15 Q12 17.5 15.5 15" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "analytical",
    label: "Analytical",
    desc: "Logical. Data.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 20V14" />
        <path d="M10 20V8" />
        <path d="M15 20V11" />
        <path d="M20 20V4" />
        <path d="M2 20h20" />
      </svg>
    ),
  },
  {
    id: "inspiring",
    label: "Inspiring",
    desc: "Bold. Vision.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l2.2 5.6 5.8 1.9-4.3 4 1 5.9L12 16.5l-4.7 2.9 1-5.9-4.3-4 5.8-1.9L12 2z"
          stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="4.5" cy="19.5" r="1.1" fill="currentColor" opacity="0.45" />
        <circle cx="19.5" cy="5" r="0.9" fill="currentColor" opacity="0.45" />
      </svg>
    ),
  },
]

// ─── Length config ────────────────────────────────────────────────────────────

const LENGTH_CONFIG: { id: OutputLength; label: string; desc: string }[] = [
  { id: "short",  label: "Short",  desc: "1 sentence"   },
  { id: "medium", label: "Medium", desc: "2 paragraphs" },
  { id: "long",   label: "Long",   desc: "3 paragraphs" },
]

// ─── Post count config (Thread Creator only) ───────────────────────────────
// How many posts — independent from Length (per-post depth, above).
const POST_COUNT_CONFIG: { id: ThreadPostCount; label: string }[] = [
  { id: 2,    label: "2"  },
  { id: 3,    label: "3"  },
  { id: 4,    label: "4"  },
  { id: 5,    label: "5"  },
  { id: "6+", label: "6+" },
]

// ─── Placeholder map ─────────────────────────────────────────────────────────

const TOPIC_PLACEHOLDER: Record<UiMode, string> = {
  tweet:  "A topic, angle, or spark…",
  reply:  "Paste the tweet you're replying to…",
  polish: "Paste your rough draft…",
  thread: "A topic, angle, or spark for the whole thread…",
}

// ─── Rotating topic-field examples (tweet mode only) ───────────────────────
// The empty topic field's whole job is to convince someone they don't need
// a finished thought to use Aminta — a static instruction ("a topic, angle,
// or spark") describes that bar without ever showing it. These are the
// fragments that actually clear that bar: short, notes-style, the kind of
// half-thing a founder/builder/active X user has lying around, never a
// polished sentence. Curated on purpose, not padded to a round number.
const TOPIC_EXAMPLES: string[] = [
  // startup
  "cap table", "fundraising", "burn rate", "co-founder split",
  // AI
  "AI thought", "prompt engineering", "context windows", "hallucinations",
  // building
  "shipping fast", "technical debt", "refactor", "side project",
  // growth
  "growth loop", "viral moment", "referral program", "weird growth spike",
  // product
  "feature idea", "roadmap", "onboarding drop-off", "product-market fit",
  // bugs
  "bug", "timezone bug", "flaky test",
  // users
  "users", "support tickets", "churn",
  // pricing
  "pricing", "free tier", "discount",
  // marketing
  "marketing", "cold outreach", "content calendar",
  // random observations
  "coffee", "meeting", "startup lesson", "late night thoughts",
]

// Fisher-Yates — used as a shuffle-bag (consume front-to-back, reshuffle
// once exhausted) so the rotation shows every fragment once before any
// repeat, instead of plain Math.random() risking the same word twice in a
// row.
function shuffledCopy<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  store: AmintaStore
  onTeach?: () => void
  onOpenSettings?: () => void
  onContext?: (event: CompanionEvent) => void
  onTemplatesChanged?: () => void
  /** Anti-spam: ms-epoch when Aminta will allow another post/reply insert. */
  publishCooldownUntil?: number | null
}

// Resize image to max 1024px on longest side and return as JPEG data URL
async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1024
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

export default function GeneratorPanel({ store, onTeach, onOpenSettings, onContext, onTemplatesChanged, publishCooldownUntil }: Props) {
  const [mode,     setMode]     = useState<UiMode>("tweet")
  const [threadOptions, setThreadOptions] = useState<ThreadOption[] | null>(null)
  const [threadError,   setThreadError]   = useState("")
  const [tone,     setTone]     = useState<Tone>("direct")
  const [length,   setLength]   = useState<OutputLength>("medium")
  // Thread Creator only. Independent from `length` — this is post COUNT,
  // length is per-post DEPTH. No stored preference (matches `length`'s own
  // per-session default), so 4 is simply the initial value.
  const [postCount, setPostCount] = useState<ThreadPostCount>(4)
  const [hoveredTone, setHoveredTone] = useState<Tone | null>(null)
  const [topic,    setTopic]    = useState("")
  const [context,  setContext]  = useState("")
  const [output,   setOutput]   = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")
  // Set only while an automatic Gemini retry is in flight (see
  // lib/gemini.ts's onRetry) — shown instead of leaving a raw provider
  // error like "Gemini error 503..." on screen mid-retry.
  const [retrying, setRetrying] = useState(false)
  const [genKey,   setGenKey]   = useState(0)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [outputImage, setOutputImage]   = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  // Images pulled from the post being replied to (distinct from
  // `imageDataUrl`, which is a user-uploaded photo for tweet mode) — see
  // pull() and lib/replyGeneration.ts.
  const [postImageUrls, setPostImageUrls]   = useState<string[]>([])
  const [analyzingImage, setAnalyzingImage] = useState(false)
  const [jumping, setJumping] = useState(false)
  // Only ever set by "Find a post worth replying to" — one short, plain-
  // language reason the ranked candidate was chosen (see lib/replyTargets.ts).
  // Cleared whenever the topic is filled some other way, so it never sticks
  // around describing a post that's no longer what's in the box.
  const [replyReason, setReplyReason] = useState("")

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templatesPrefill, setTemplatesPrefill] = useState<{ content: string; mode: TemplateMode } | undefined>(undefined)

  // ── Rotating topic-field placeholder (tweet mode only) ──────────────────
  // See the CSS comment on .topic-placeholder in style.css for the fade
  // mechanism itself. State/refs here only track WHICH fragment is shown
  // and WHETHER it's mid-fade; the actual opacity animation is CSS-driven.
  const [rotatingPlaceholder, setRotatingPlaceholder] = useState(
    () => TOPIC_EXAMPLES[Math.floor(Math.random() * TOPIC_EXAMPLES.length)]
  )
  const [placeholderDim, setPlaceholderDim] = useState(false)
  const [topicFocused, setTopicFocused] = useState(false)
  // Computed once — this component's lifetime is a single side-panel
  // session, no need to react to the preference changing mid-session
  // (matches the landing app's existing prefers-reduced-motion checks).
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
  // Shuffle-bag: consumed front-to-back so every fragment shows once
  // before any repeat, reshuffled once exhausted. Refs, not state — the
  // bag itself never needs to trigger a render, only the currently
  // displayed fragment does.
  const placeholderBagRef = useRef<string[]>([])
  const placeholderBagIndexRef = useRef(0)
  const placeholderTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  // Reset: fires once whenever the topic field becomes empty (including on
  // mount) — draws a fresh shuffled bag (or, under reduced motion, a
  // single fresh random fragment) so each "empty again" moment starts from
  // a genuinely new random point instead of resuming a stale sequence.
  useEffect(() => {
    if (mode !== "tweet" || topic.length !== 0) return
    if (reducedMotion) {
      setRotatingPlaceholder(TOPIC_EXAMPLES[Math.floor(Math.random() * TOPIC_EXAMPLES.length)])
      return
    }
    const bag = shuffledCopy(TOPIC_EXAMPLES)
    placeholderBagRef.current = bag
    placeholderBagIndexRef.current = 1
    setPlaceholderDim(false)
    setRotatingPlaceholder(bag[0])
  }, [mode, topic, reducedMotion])

  // Rotation loop: fixed 3.5s hold, fade out (380ms) -> swap the complete
  // placeholder text while invisible -> fade back in (380ms). Paused
  // (nothing scheduled) while focused, while non-empty, outside tweet
  // mode, or under reduced motion — resumes with a fresh 3.5s hold once
  // those conditions clear again.
  useEffect(() => {
    if (mode !== "tweet" || topic.length !== 0 || topicFocused || reducedMotion) return

    const HOLD_MS = 3_500
    const FADE_MS = 380
    let cancelled = false

    const scheduleNext = () => {
      placeholderTimeoutRef.current = setTimeout(() => {
        if (cancelled) return
        setPlaceholderDim(true)
        placeholderTimeoutRef.current = setTimeout(() => {
          if (cancelled) return
          if (placeholderBagIndexRef.current >= placeholderBagRef.current.length) {
            placeholderBagRef.current = shuffledCopy(TOPIC_EXAMPLES)
            placeholderBagIndexRef.current = 0
          }
          setRotatingPlaceholder(placeholderBagRef.current[placeholderBagIndexRef.current])
          placeholderBagIndexRef.current += 1
          setPlaceholderDim(false)
          scheduleNext()
        }, FADE_MS)
      }, HOLD_MS)
    }

    scheduleNext()

    return () => {
      cancelled = true
      clearTimeout(placeholderTimeoutRef.current)
    }
  }, [mode, topic, topicFocused, reducedMotion])

  const xp   = store.xp ?? 0
  const tint = getStageTint(xp)

  // Credit gating replaces the old client-side free counter entirely. The
  // backend is authoritative (it reserves atomically per request); these
  // values are display/UX only, synced from /api/sync. Deliberately NOT
  // derived from missionGenerates — that counter lives in chrome.storage
  // and is trivially editable, which was harmless when free meant BYOK
  // (the user's own money) but must never gate Aminta-funded generations.
  //
  // shouldUseIncludedAi() here, not aiIncluded: a user who has switched to
  // BYOK is paying their own provider, so their Aminta credit balance is
  // irrelevant and must not block or be displayed.
  const usingIncluded = shouldUseIncludedAi(store)
  const creditsExhausted = usingIncluded && store.creditsAllowance > 0 && store.creditsBalance <= 0
  const creditResetLabel =
    store.creditsPeriodKind === "day" ? " today" : ""

  const reset = () => {
    setError(""); setOutput(""); setOutputImage(null); setRetrying(false)
    setThreadOptions(null); setThreadError("")
  }

  // Passed to dispatchGenerate()/generateReply() as onRetry — fires before
  // each automatic retry of a transient Gemini error (429/500/502/503/504).
  const handleGeminiRetry = () => setRetrying(true)

  const pull = async () => {
    setError("")
    setReplyReason("")
    const res = await readActivePost(PLATFORM)
    if (res.ok) {
      if (res.text) setTopic(res.text)
      setPostImageUrls(res.imageUrls ?? [])
    } else {
      setError(res.error ?? "Couldn't read the post.")
    }
  }

  // "Post worth a reply" is a product concept — this ranks currently-loaded
  // timeline posts (relevance to the user's Topics, conversation potential,
  // a small engagement signal) and picks the best one, not just the next
  // post in the timeline. Entirely local/deterministic — no model call, so
  // this never costs a generation credit (see lib/replyTargets.ts).
  const jumpToNextReplyTarget = async () => {
    setError("")
    setJumping(true)
    try {
      const res = await findNextReplyTarget(PLATFORM)
      if (res.ok) {
        if (res.text) setTopic(res.text)
        setPostImageUrls(res.imageUrls ?? [])
        setReplyReason(res.reason ?? "")
      } else {
        setReplyReason("")
        setError(res.error ?? "Couldn't find a reply opportunity.")
      }
    } finally {
      setJumping(false)
    }
  }

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return }
    try {
      const dataUrl = await resizeImage(file)
      setImageDataUrl(dataUrl)
      setError("")
    } catch {
      setError("Couldn't load image.")
    }
  }

  const removeImage = () => {
    setImageDataUrl(null)
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  // Built lazily, right before a template is actually used — StyleProfile is
  // only fetched here (Exact/Fill templates never need it, so they never pay
  // for it), and the combined topic/context mirrors the normal generate() input.
  const getTemplateRunContext = async (): Promise<RunTemplateContext> => {
    const combined = topic.trim() + (context.trim() ? `\n\nAdditional context: ${context.trim()}` : "")
    const styleProfile = await getOrBuildStyleProfile(store)
    return {
      apiKey: effectiveApiKey(store),
      model: store.model,
      voice: store.voice,
      styleProfile,
      platform: PLATFORM,
      mode: mode === "thread" ? "tweet" : mode,
      tone,
      length,
      topic: combined || "Write a post about this.",
    }
  }

  const openSaveAsTemplate = (draftText: string) => {
    setTemplatesPrefill({ content: draftText, mode: "exact" })
    setTemplatesOpen(true)
  }

  const generate = async () => {
    reset()
    if (!navigator.onLine) { setError("You're offline. Check your connection and try again."); return }
    if (!effectiveApiKey(store) && !shouldUseIncludedAi(store)) { setError("Add your AI key in Settings first."); return }
    if (!store.voice)  { setError("Teach Aminta your voice first. Go to Teach."); return }
    const combined = topic.trim() + (context.trim() ? `\n\nAdditional context: ${context.trim()}` : "")
    const hasPostImages = mode === "reply" && postImageUrls.length > 0
    if (!combined && !imageDataUrl && !hasPostImages) { setError("Give Aminta something to work with."); return }
    setLoading(true)
    onContext?.("generate_start")

    // Thread Creator — separate flow entirely: one call, 3 options, no
    // image support (not part of the spec), never touches OutputCard/XP
    // pending-insert plumbing (posts are inserted individually from
    // ThreadResults, each insert queues its own XP the normal way).
    if (mode === "thread") {
      try {
        const styleProfile = await getOrBuildStyleProfile(store)
        const threads = await runThreadGenerate(store, { input: combined, voice: store.voice, styleProfile, tone, length, postCount })
        if (threads.length === 0) {
          // Genuinely nothing usable came back — a provider hiccup or a
          // fully malformed/empty response, never "the topic was too
          // short." A sparse premise like "solana summit serbia" is
          // expected to work; blaming the topic here would be wrong (see
          // lib/prompts.ts's premise-development rule and
          // lib/backendGenerate.ts's THREAD_MAX_OUTPUT_TOKENS).
          setThreadError("Couldn't generate a thread right now. Try again in a moment.")
        } else {
          setThreadOptions(threads)
        }
        await incrementGenerations()
        await incrementMissionGenerates()
        onContext?.("generate_end")
      } catch (e) {
        setThreadError(e instanceof Error ? e.message : "Something went wrong.")
        onContext?.("api_error")
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      const styleProfile = await getOrBuildStyleProfile(store)

      // Reply to a post with attached images — routes through the
      // image-aware orchestrator (lib/replyGeneration.ts), which decides
      // whether the provider supports vision, fetches/converts the images,
      // and falls back to a normal text-only reply on any failure. The
      // generateText/generateFromImages deps below ignore the pre-built
      // `messages` array replyGeneration.ts passes them and instead close
      // over the structured fields already in scope here — for Included-AI
      // users that means the backend rebuilds the prompt itself server-side
      // (never trusting a client-built prompt string) rather than being
      // handed replyGeneration.ts's local buildMessages() output.
      if (hasPostImages) {
        setAnalyzingImage(true)
        const result = await generateReply(
          effectiveApiKey(store), store.model, store.voice, combined, postImageUrls,
          styleProfile, tone, length,
          {
            isGroqKey,
            fetchImageAsDataUrl,
            generateText: (apiKey, model, messages) =>
              shouldUseIncludedAi(store)
                ? backendGenerate({ generationMode: "reply", input: combined, voice: store.voice!, styleProfile, tone, length })
                : runAI(apiKey, model, messages, { structuredText: true, generationType: "reply", onRetry: handleGeminiRetry }),
            generateFromImages: (apiKey, model, messages, images) =>
              shouldUseIncludedAi(store)
                ? backendGenerate({ generationMode: "reply", input: combined, voice: store.voice!, styleProfile, tone, length, images, hasImages: true })
                : generateFromImage(apiKey, model, messages, images, { structuredText: true, generationType: "reply", onRetry: handleGeminiRetry }),
          }
        )
        setOutput(result.text)
        setOutputImage(null)
        setGenKey(k => k + 1)
        await incrementGenerations()
        await incrementMissionGenerates()
        onContext?.("generate_end")
        return
      }

      const topicInput = combined || "Write a post about this image."
      const text = await dispatchGenerate(
        store,
        {
          generationMode: mode,
          input: topicInput,
          voice: store.voice,
          styleProfile,
          tone,
          length,
          images: imageDataUrl ? [imageDataUrl] : undefined,
        },
        handleGeminiRetry
      )
      setOutput(text)
      setOutputImage(imageDataUrl)
      setGenKey(k => k + 1)
      await incrementGenerations()
      await incrementMissionGenerates()
      onContext?.("generate_end")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
      onContext?.("api_error")
    } finally {
      setRetrying(false)
      setLoading(false)
      setAnalyzingImage(false)
    }
  }

  const canGenerate = (!!effectiveApiKey(store) || shouldUseIncludedAi(store)) && !!store.voice && (!!topic.trim() || !!imageDataUrl || postImageUrls.length > 0) && !creditsExhausted
  const topicLabel =
    mode === "reply"  ? "Who are we replying to?" :
    mode === "polish" ? "Your draft"               :
                        "What's this about?"

  return (
    // Overrides the --mint CSS var (used by .input-pixel:focus in style.css)
    // to the current evolution tint, just within this panel — everything
    // else here (mode circles, tone card, Generate button) already themes
    // to `tint`, so the textarea focus ring was the one thing still hardcoded
    // to mint regardless of level/color. Scoped locally so Settings/Train/
    // Templates keep the real mint default.
    <div className="space-y-4 pt-1 pb-4" style={{ "--mint": tint } as React.CSSProperties}>

      {/* ── Mode + Templates, icon-only circular buttons in a row ── */}
      <div className="flex items-center justify-between px-2">
        {MODE_CONFIG.map((m) => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              onClick={() => { if (mode !== m.id) { setMode(m.id); reset(); setPostImageUrls([]); setReplyReason("") } }}
              title={m.label}
              className="flex items-center justify-center rounded-full transition-all"
              style={{
                width: 48,
                height: 48,
                backgroundColor: active ? tint : C.card,
                border: `1.5px solid ${active ? tint : C.border}`,
                color: active ? "#000" : C.textFaint,
              }}>
              {m.icon}
            </button>
          )
        })}
        <button
          onClick={() => { setTemplatesPrefill(undefined); setTemplatesOpen(true) }}
          title="Templates"
          className="flex items-center justify-center rounded-full transition-colors"
          style={{ width: 48, height: 48, backgroundColor: C.card, border: `1.5px solid ${C.border}`, color: C.textFaint }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
      </div>

      {/* ── Image upload ── (hidden for Groq keys — Groq has no vision support) */}
      {mode === "tweet" && !isGroqKey(effectiveApiKey(store)) && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>
            Photo{" "}
            <span style={{ color: C.textGhost, fontWeight: 400 }}>(optional, AI will write about it)</span>
          </p>
          {imageDataUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-line/50">
              <img src={imageDataUrl} alt="Selected" className="w-full max-h-28 object-cover" />
              <button
                onClick={removeImage}
                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => imageInputRef.current?.click()}
              className="w-full rounded-xl py-3 text-[11px] font-medium border-dashed transition-colors flex items-center justify-center gap-2"
              style={{ border: `1.5px dashed ${C.border}`, color: C.textFaint }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageFile(f) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              Add photo
            </button>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }}
          />
        </div>
      )}

      {/* ── Topic input ── */}
      <div className="space-y-1.5">
        <label htmlFor="topic-input" className="block text-[11px] font-medium" style={{ color: C.textFaint }}>{topicLabel}</label>
        <div className="relative">
          <textarea
            id="topic-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onFocus={() => setTopicFocused(true)}
            onBlur={() => setTopicFocused(false)}
            rows={3}
            placeholder={mode === "tweet" ? rotatingPlaceholder : TOPIC_PLACEHOLDER[mode]}
            className={`input-pixel topic-placeholder w-full rounded-xl px-3 py-2.5 text-sm resize-none${mode === "tweet" && placeholderDim ? " placeholder-dim" : ""}`}
            style={{ paddingBottom: "22px" }}
          />
          <span className="absolute bottom-2 right-3 text-[9px]" style={{ color: C.textGhost }}>
            {topic.length} / 120
          </span>
        </div>
        {mode === "reply" && (
          <button
            onClick={pull}
            className="w-full rounded-lg py-2 text-[11px] font-medium transition-colors"
            style={{ border: `1px solid ${C.border}`, color: C.textFaint }}>
            ↑ Pull from page
          </button>
        )}
        {mode === "reply" && (
          <button
            onClick={jumpToNextReplyTarget}
            disabled={jumping}
            className="w-full rounded-lg py-2 text-[11px] font-medium transition-colors disabled:opacity-60"
            style={{ border: `1px solid ${C.border}`, color: C.textFaint }}>
            {jumping ? "Looking for a reply opportunity…" : "Find a post worth replying to"}
          </button>
        )}
        {mode === "reply" && postImageUrls.length > 0 && (
          <p className="text-[10px] animate-fade-in" style={{ color: tint }}>
            {postImageUrls.length} image{postImageUrls.length > 1 ? "s" : ""} found on this post — Aminta will look at {postImageUrls.length > 1 ? "them" : "it"} too.
          </p>
        )}
        {mode === "reply" && replyReason && (
          <p className="text-[10px] animate-fade-in" style={{ color: tint }}>
            {replyReason}
          </p>
        )}
      </div>

      {/* ── Context input ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>
          {mode === "polish" ? "Polishing instructions" : "Additional context"}{" "}
          <span style={{ color: C.textGhost, fontWeight: 400 }}>(optional)</span>
        </p>
        <div className="relative">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            placeholder={mode === "polish" ? "e.g. make it punchier, add a hook…" : "Add key points, ideas, or notes…"}
            className="input-pixel w-full rounded-xl px-3 py-2.5 text-sm resize-none"
            style={{ paddingBottom: "22px" }}
          />
          <span className="absolute bottom-2 right-3 text-[9px]" style={{ color: C.textGhost }}>
            {context.length} / 300
          </span>
        </div>
      </div>

      {/* ── Tone ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>Tone</p>
        <div className="grid grid-cols-4 gap-1.5">
          {TONE_CONFIG.map((t) => {
            const active  = tone === t.id
            const hovered = hoveredTone === t.id && !active
            return (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                onMouseEnter={() => setHoveredTone(t.id)}
                onMouseLeave={() => setHoveredTone(null)}
                title={t.desc}
                className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl"
                style={{
                  backgroundColor: active ? tint + "14" : C.card,
                  border: `1.5px solid ${active ? tint : hovered ? tint + "55" : C.border}`,
                  transform: active ? "translateY(-2px)" : hovered ? "scale(1.02)" : "none",
                  boxShadow: active ? `0 4px 18px ${tint}22, 0 2px 6px rgba(0,0,0,0.35)` : "none",
                  transition: "transform 0.13s ease, box-shadow 0.13s ease, border-color 0.13s ease, background-color 0.13s ease",
                }}>
                <span style={{
                  color: active ? "#fff" : hovered ? tint + "cc" : C.textDim,
                  transition: "color 0.13s ease",
                  lineHeight: 1,
                }}>
                  {t.icon}
                </span>
                <span
                  className="font-semibold text-[10px] leading-none"
                  style={{ color: active ? tint : hovered ? C.text : C.textDim }}>
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Length ── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>Length</p>
          {mode === "tweet" && store.styleProfile?.lengthProfile && (
            <span className="text-[9px]" style={{ color: C.textGhost }}>· based on how you normally write</span>
          )}
        </div>
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.border}` }}>
          {LENGTH_CONFIG.map((l, i) => {
            const active = length === l.id
            return (
              <button
                key={l.id}
                onClick={() => setLength(l.id)}
                className="flex-1 flex items-center justify-center py-2.5 transition-all"
                style={{
                  backgroundColor: active ? tint + "18" : "transparent",
                  borderRight: i < LENGTH_CONFIG.length - 1 ? `1px solid ${C.border}` : undefined,
                  color: active ? tint : C.textGhost,
                }}>
                <span className="text-[10px] font-semibold" style={{ color: active ? tint : C.textDim }}>
                  {l.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Posts (Thread Creator only) — how many posts, independent from
          Length above (per-post depth). ── */}
      {mode === "thread" && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium" style={{ color: C.textFaint }}>Posts</p>
          <div className="flex rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.border}` }}>
            {POST_COUNT_CONFIG.map((p, i) => {
              const active = postCount === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setPostCount(p.id)}
                  className="flex-1 flex items-center justify-center py-2.5 transition-all"
                  style={{
                    backgroundColor: active ? tint + "18" : "transparent",
                    borderRight: i < POST_COUNT_CONFIG.length - 1 ? `1px solid ${C.border}` : undefined,
                    color: active ? tint : C.textGhost,
                  }}>
                  <span className="text-[10px] font-semibold" style={{ color: active ? tint : C.textDim }}>
                    {p.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Generate ── */}
      <button
        onClick={generate}
        disabled={loading || !canGenerate}
        className={`btn-pixel w-full rounded-xl py-3.5 font-pixel text-[10px] text-black transition-opacity ${
          loading ? "cursor-wait opacity-80" : !canGenerate ? "opacity-40 cursor-not-allowed" : ""
        }`}
        style={{ backgroundColor: tint }}>
        {analyzingImage ? "Analyzing image…" : loading ? (
          <span className="dot-wave flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-black/60" />
            <span className="w-1.5 h-1.5 rounded-full bg-black/60" />
            <span className="w-1.5 h-1.5 rounded-full bg-black/60" />
          </span>
        ) : "Generate"}
      </button>

      {/* Included AI credit balance — server-authoritative (store.creditsBalance
          is synced from /api/sync, never decremented locally). Only shown when
          the user is actually generating through Included AI; on BYOK their own
          provider is paying, so credits are irrelevant. */}
      {!loading && usingIncluded && creditsExhausted === false && !!store.voice && (
        <p className="text-[10px] text-center animate-fade-in" style={{ color: C.textGhost }}>
          {store.creditsBalance} / {store.creditsAllowance} credits remaining{creditResetLabel}
        </p>
      )}

      {/* Zero-credit state. BYOK stays the escape hatch for plans that
          actually have it (Pro/Founder); Free users can't BYOK anymore, so
          they only ever get the upgrade path here, never a dead-end
          "Use my API key" button that leads to a locked Settings card. */}
      {!loading && creditsExhausted && (
        <div className="animate-fade-in rounded-xl px-4 py-3 space-y-2" style={{ backgroundColor: tint + "12", border: `1px solid ${tint}30` }}>
          <p className="font-pixel text-[8px]" style={{ color: tint }}>
            {store.aiIncludedPaid
              ? "You've used your 1,000 Included AI credits for this billing period."
              : "You're out of free credits for today."}
          </p>
          <p className="text-[11px] leading-snug" style={{ color: C.textFaint }}>
            {store.aiIncludedPaid
              ? "Your credits renew at the start of your next billing period."
              : "Credits reset tomorrow."}
          </p>
          <div className="flex flex-col gap-1.5 pt-0.5">
            {!store.aiIncludedPaid && (
              <a
                href={PRICING_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-pixel w-full py-1.5 rounded-lg font-pixel text-[8px] text-center"
                style={{ backgroundColor: tint, color: "#000", border: "2px solid #000", boxShadow: "2px 2px 0 #000" }}>
                Upgrade to Pro
              </a>
            )}
            {canUseByok(store) && (
              <button
                onClick={onOpenSettings}
                className="w-full py-1.5 rounded-lg font-pixel text-[8px]"
                style={{ backgroundColor: "transparent", color: C.textFaint, border: `1px solid ${C.border}` }}>
                Use my API key
              </button>
            )}
          </div>
        </div>
      )}
      {!loading && !creditsExhausted && !effectiveApiKey(store) && !shouldUseIncludedAi(store) && (
        <p className="text-[11px] animate-fade-in px-1" style={{ color: C.textFaint }}>
          {canUseByok(store) ? (
            <>
              Add your AI key in{" "}
              <button onClick={onOpenSettings} className="underline" style={{ color: C.text }}>Settings</button>
              {" "}to start generating.
            </>
          ) : (
            <>
              You're out of free credits.{" "}
              <a href={PRICING_URL} target="_blank" rel="noreferrer" className="underline" style={{ color: C.text }}>
                Upgrade to Pro
              </a>
              {" "}to use your own AI key.
            </>
          )}
        </p>
      )}
      {!loading && !creditsExhausted && (!!effectiveApiKey(store) || shouldUseIncludedAi(store)) && !store.voice && (
        <p className="text-[11px] animate-fade-in px-1" style={{ color: C.textFaint }}>
          Go to{" "}
          <button onClick={onTeach} className="underline" style={{ color: C.text }}>Train</button>
          {" "}to teach Aminta your voice first.
        </p>
      )}

      {/* Shown instead of a raw provider error while lib/gemini.ts is silently
          retrying a transient failure (429/500/502/503/504) in the
          background — error stays empty until every retry is exhausted. */}
      {retrying && !error && (
        <p className="text-[11px] animate-fade-in px-1" style={{ color: C.textFaint }}>
          AI is experiencing high demand. Retrying automatically…
        </p>
      )}

      {/* Generate button itself already re-enables the instant loading
          clears (see the deadline-bounded finally in generate()) — this is
          just an explicit, visible affordance for "the AI failed, try the
          exact same thing again" so the user isn't left reading an error
          with no obvious next step. */}
      {error && (
        <p className="text-[11px] text-red-400 animate-fade-in px-1">
          {error}{" "}
          <button onClick={generate} className="underline" style={{ color: "inherit" }}>Try again</button>
        </p>
      )}

      {threadError && (
        <p className="text-[11px] text-red-400 animate-fade-in px-1">
          {threadError}{" "}
          <button onClick={generate} className="underline" style={{ color: "inherit" }}>Try again</button>
        </p>
      )}
      {threadOptions && (
        <ThreadResults threads={threadOptions} tint={tint} />
      )}

      {output && mode !== "thread" && (
        <OutputCard
          key={genKey}
          text={output}
          mode={mode}
          platform={PLATFORM}
          imageDataUrl={outputImage}
          onRegenerate={generate}
          onSaveAsTemplate={openSaveAsTemplate}
          publishCooldownUntil={publishCooldownUntil}
        />
      )}

      {templatesOpen && (
        <TemplatesModal
          store={store}
          onClose={() => { setTemplatesOpen(false); setTemplatesPrefill(undefined) }}
          onChanged={onTemplatesChanged}
          getRunContext={getTemplateRunContext}
          initialView={templatesPrefill ? "editor" : "list"}
          prefill={templatesPrefill}
        />
      )}

    </div>
  )
}

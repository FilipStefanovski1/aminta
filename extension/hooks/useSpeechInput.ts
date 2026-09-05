import { useCallback, useEffect, useRef, useState } from "react"

// Speech-to-text over the browser's built-in Web Speech API — no audio file
// is ever created, nothing is uploaded by Aminta, no recording is stored,
// and no Aminta generation credit is spent. Chrome performs the recognition
// itself; we only ever receive text.
//
// Deliberately NOT getUserMedia + a transcription API: that would mean
// capturing raw audio, shipping it somewhere, and paying per minute. The
// native API needs no manifest permission of its own (Chrome prompts for
// the mic on first use) and degrades to "unsupported" cleanly everywhere
// else, which is why every caller must keep typing available regardless.

type SpeechErrorCode =
  | "not-allowed"      // user denied, or policy blocked the mic
  | "service-not-allowed"
  | "audio-capture"    // no mic hardware
  | "network"
  | "no-speech"
  | "aborted"
  | "unknown"

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [i: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionErrorEventLike { error?: string }
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort?(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// User-facing copy per failure mode. Never surfaces a raw error code —
// every one of these ends with "you can keep typing", because losing the
// mic must never read as losing the step.
const ERROR_MESSAGE: Record<SpeechErrorCode, string> = {
  "not-allowed":         "Microphone access is off. Allow it in your browser settings, or just type instead.",
  "service-not-allowed": "Microphone access is off. Allow it in your browser settings, or just type instead.",
  "audio-capture":       "No microphone found. You can type instead.",
  network:               "Voice input needs a connection right now. You can type instead.",
  "no-speech":           "Didn't catch that. Try again, or type instead.",
  aborted:               "",
  unknown:               "Voice input didn't work. You can type instead.",
}

export interface SpeechInput {
  /** False when the browser has no Web Speech API — hide the mic entirely. */
  supported: boolean
  listening: boolean
  /** Human-readable, already-safe copy. "" when there's nothing to show. */
  error: string
  start: () => void
  stop: () => void
  toggle: () => void
}

/**
 * `onTranscript` fires once per FINAL recognized chunk (interim results are
 * used only to keep `listening` honest, never emitted) — callers append it
 * to whatever the user has already typed rather than replacing.
 */
export function useSpeechInput(onTranscript: (chunk: string) => void): SpeechInput {
  const [supported] = useState(() => getRecognitionCtor() !== null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState("")
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  // Kept in a ref so the recognition instance's handlers always call the
  // latest callback without needing to be torn down and rebuilt mid-session.
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  const stop = useCallback(() => {
    const rec = recRef.current
    recRef.current = null
    setListening(false)
    if (!rec) return
    try { rec.stop() } catch { /* already stopped — nothing to clean up */ }
  }, [])

  const start = useCallback(() => {
    if (recRef.current) return // already listening
    const Ctor = getRecognitionCtor()
    if (!Ctor) { setError(ERROR_MESSAGE.unknown); return }

    setError("")
    let rec: SpeechRecognitionLike
    try {
      rec = new Ctor()
    } catch {
      setError(ERROR_MESSAGE.unknown)
      return
    }

    rec.continuous = true
    rec.interimResults = true
    rec.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US"

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (!result?.isFinal) continue // interim text is never committed
        const text = result[0]?.transcript ?? ""
        if (text.trim()) onTranscriptRef.current(text)
      }
    }
    rec.onerror = (e) => {
      const code = (e?.error ?? "unknown") as SpeechErrorCode
      const message = ERROR_MESSAGE[code] ?? ERROR_MESSAGE.unknown
      if (message) setError(message)
      // "aborted" is what a normal user-initiated stop() reports — not a
      // failure, so it clears state without ever showing a message.
      recRef.current = null
      setListening(false)
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
    }

    try {
      rec.start()
    } catch {
      setError(ERROR_MESSAGE.unknown)
      return
    }
    recRef.current = rec
    setListening(true)
  }, [])

  const toggle = useCallback(() => {
    if (recRef.current) stop()
    else start()
  }, [start, stop])

  // Never leave the mic live when the screen goes away (step change,
  // onboarding finishing, Train unmounting).
  useEffect(() => () => {
    const rec = recRef.current
    recRef.current = null
    if (rec) { try { rec.stop() } catch { /* noop */ } }
  }, [])

  return { supported, listening, error, start, stop, toggle }
}

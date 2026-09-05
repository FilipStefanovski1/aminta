import { useState } from "react"

import { useSpeechInput } from "~hooks/useSpeechInput"
import {
  HELPER_PROMPT,
  MAX_PERSONAL_CONTEXT_CHARS,
  appendTranscript,
} from "~lib/personalContext"
import { C } from "~lib/theme"
import { T } from "~lib/typography"

// One shared implementation for both places this field appears — the
// onboarding step and Train's "About you" section — so the textarea, the
// mic and the helper prompt can't drift apart between them.

function MicIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ display: "block", imageRendering: "pixelated" }}>
      {/* capsule head */}
      <rect x="4" y="1" width="4" height="6" fill={color} />
      {/* stand */}
      <rect x="2" y="6" width="1" height="2" fill={color} />
      <rect x="9" y="6" width="1" height="2" fill={color} />
      <rect x="3" y="8" width="6" height="1" fill={color} />
      <rect x="5" y="9" width="2" height="2" fill={color} />
    </svg>
  )
}

interface Props {
  value: string
  onChange: (next: string) => void
  tint?: string
  rows?: number
  placeholder?: string
  autoFocus?: boolean
}

export default function PersonalContextField({
  value,
  onChange,
  tint = C.mint,
  rows = 7,
  placeholder = "Tell Aminta about yourself, what you do, what you're building, what you're interested in…",
  autoFocus = false,
}: Props) {
  const [helperOpen, setHelperOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  // Speech chunks APPEND — whatever is already typed is never replaced, and
  // the user can keep editing the transcript afterwards like any other text.
  const speech = useSpeechInput((chunk) => onChange(appendTranscript(value, chunk)))

  const copyHelperPrompt = async () => {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(HELPER_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be unavailable/denied — the prompt text stays visible
      // and selectable above, so this is a nudge, never a dead end.
      setCopyFailed(true)
    }
  }

  const remaining = MAX_PERSONAL_CONTEXT_CHARS - value.length

  return (
    <div>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: C.cardInner,
          border: `1px solid ${speech.listening ? tint : C.border}`,
        }}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_PERSONAL_CONTEXT_CHARS))}
          rows={rows}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="About you"
          className={`w-full bg-transparent resize-none outline-none px-3 py-3 ${T.control}`}
          style={{ color: C.text }}
        />

        <div
          className="flex items-center gap-2 px-2.5 py-2"
          style={{ borderTop: `1px solid ${C.borderSoft}` }}>

          {/* Mic — hidden entirely when the browser has no speech API, so
              there's never a control that can only fail. */}
          {speech.supported && (
            <button
              type="button"
              onClick={speech.toggle}
              aria-label={speech.listening ? "Stop recording" : "Speak instead of typing"}
              aria-pressed={speech.listening}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-all active:scale-[0.97]"
              style={{
                border: `1px solid ${speech.listening ? tint : C.border}`,
                backgroundColor: speech.listening ? tint + "16" : "transparent",
                color: speech.listening ? tint : C.textDim,
              }}>
              <MicIcon color={speech.listening ? tint : C.textDim} />
              <span className={T.buttonSm}>
                {speech.listening ? "Stop" : "Speak"}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setHelperOpen((v) => !v)}
            className={`rounded-lg px-2 py-1.5 transition-colors whitespace-nowrap ${T.buttonSm}`}
            style={{ border: `1px solid ${C.border}`, color: C.textDim }}>
            Help me answer
          </button>

          <span className={`ml-auto tabular-nums ${T.meta}`} style={{ color: remaining < 120 ? tint : C.textGhost }}>
            {value.length > 0 ? `${remaining}` : ""}
          </span>
        </div>
      </div>

      {/* Listening / error state — one line, never a layout shift that
          pushes the textarea around. */}
      {speech.listening && (
        <p className={`${T.meta} mt-2 flex items-center gap-1.5`} style={{ color: tint }}>
          <span
            className="inline-block rounded-full animate-pulse"
            style={{ width: 6, height: 6, backgroundColor: tint }}
          />
          Listening — speak naturally, then press Stop.
        </p>
      )}
      {!speech.listening && speech.error && (
        <p className={`${T.bodySm} mt-2`} style={{ color: C.textFaint }}>{speech.error}</p>
      )}

      {/* Helper prompt — pure local text. No AI call, no credits. */}
      {helperOpen && (
        <div
          className="mt-2 rounded-xl p-3"
          style={{ backgroundColor: C.cardInner, border: `1px solid ${C.border}` }}>
          <p className={`${T.bodySm} mb-2`} style={{ color: C.textFaint }}>
            Not sure what to write? Copy this into ChatGPT, Claude or whichever AI you use,
            answer its questions, then paste the paragraph it gives you back here.
          </p>
          <pre
            className={`whitespace-pre-wrap break-words max-h-40 overflow-y-auto rounded-lg p-2.5 m-0 ${T.bodySm}`}
            style={{ backgroundColor: C.bg, color: C.textDim, fontFamily: "inherit" }}>
            {HELPER_PROMPT}
          </pre>
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={copyHelperPrompt}
              className={`${T.buttonSm} transition-colors`}
              style={{ color: copied ? tint : C.text }}>
              {copied ? "Copied ✓" : "Copy prompt"}
            </button>
            <button
              type="button"
              onClick={() => setHelperOpen(false)}
              className={T.buttonSm}
              style={{ color: C.textDim }}>
              Close
            </button>
            {copyFailed && (
              <span className={T.meta} style={{ color: C.textFaint }}>
                Couldn&apos;t copy — select the text above instead.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from "react"

import { insertImage, insertText } from "~lib/messaging"
import type { Mode, Platform } from "~lib/prompts"
import { cooldownSecondsRemaining } from "~lib/publishCooldown"
import { C } from "~lib/theme"
import { hashText, queuePendingXP, XP_PER_MODE } from "~lib/xp"

const X_CHAR_LIMIT = 280

interface Props {
  text: string
  mode: Mode
  platform: Platform
  imageDataUrl?: string | null
  onRegenerate?: () => void
  onSaveAsTemplate?: (text: string) => void
  /** Anti-spam: ms-epoch when Aminta will allow another post/reply insert. */
  publishCooldownUntil?: number | null
  /**
   * How many active Instincts were supplied to this generation — purely a
   * "these were given to the model" fact, not a claim that all of them are
   * verifiably followed (no second call to check that). 0/undefined shows
   * nothing.
   */
  instinctCount?: number
}

export default function OutputCard({ text, mode, platform, imageDataUrl, onRegenerate, onSaveAsTemplate, publishCooldownUntil, instinctCount }: Props) {
  const [copied, setCopied] = useState(false)
  const [insertStatus, setInsertStatus] = useState("")

  // Only posts/replies are ever gated — Polish never publishes on its own,
  // and Generate/editing/browsing are never touched by this at all.
  const cooldownApplies = mode === "tweet" || mode === "reply"
  const [cooldownSecs, setCooldownSecs] = useState(() =>
    cooldownApplies ? cooldownSecondsRemaining(publishCooldownUntil ?? null, Date.now()) : 0
  )
  useEffect(() => {
    if (!cooldownApplies || !publishCooldownUntil) { setCooldownSecs(0); return }
    const tick = () => setCooldownSecs(cooldownSecondsRemaining(publishCooldownUntil, Date.now()))
    tick()
    const iv = setInterval(tick, 500)
    return () => clearInterval(iv)
  }, [cooldownApplies, publishCooldownUntil])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setInsertStatus("Copy failed. Select manually.")
      setTimeout(() => setInsertStatus(""), 3000)
    }
  }

  const insert = async () => {
    setInsertStatus("")

    const res = await insertText(platform, text)
    if (res.ok) {
      // Text actually reached X's composer — queue it for XP. It only
      // becomes real XP once twitter-publish-detector.ts confirms the post
      // was actually published, not just inserted.
      queuePendingXP(hashText(text), XP_PER_MODE[mode], mode)

      if (imageDataUrl) {
        setInsertStatus("Inserting image…")
        const imgRes = await insertImage(platform, imageDataUrl)
        if (!imgRes.ok) {
          setInsertStatus("Text inserted. Image failed, attach manually.")
          setTimeout(() => setInsertStatus(""), 4000)
        } else {
          setInsertStatus("Inserted into X. Publish to earn XP.")
          setTimeout(() => setInsertStatus(""), 3000)
        }
      } else {
        setInsertStatus("Inserted into X. Publish to earn XP.")
        setTimeout(() => setInsertStatus(""), 3000)
      }
    } else {
      // Clipboard fallback so the user is never stuck — but Aminta can't
      // reliably associate a manual paste with the eventual post, so this
      // never queues XP. Only an actual composer insert does.
      try {
        await navigator.clipboard.writeText(text)
        setInsertStatus(`${res.error ? res.error + " " : ""}Copied. Open an X composer and paste it manually.`)
      } catch {
        setInsertStatus("Insert failed. Use Copy and paste it manually.")
      }
      setTimeout(() => setInsertStatus(""), 6000)
    }
  }

  const charLimit = X_CHAR_LIMIT
  const charCount = text.length
  const charColor = charCount > charLimit ? "#f87171" : charCount > charLimit * 0.9 ? "#fbbf24" : C.textGhost

  return (
    <div className="animate-card-in bg-[#111318] border border-[#1e2028] rounded-xl p-3 space-y-3">
      {imageDataUrl && (
        <img
          src={imageDataUrl}
          alt="Attached"
          className="w-full rounded-lg object-cover max-h-36"
        />
      )}
      <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: C.text }}>{text}</p>

      {/* Character count + how many active Instincts fed this generation */}
      <div className="flex items-center justify-between">
        {instinctCount ? (
          <span className="text-[10px]" style={{ color: C.textFaint }}>
            Following {instinctCount} instinct{instinctCount === 1 ? "" : "s"}
          </span>
        ) : <span />}
        <span className="font-pixel text-[8px]" style={{ color: charColor }}>
          {charCount}/{charLimit}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={copy}
          className="flex-1 border border-[#1e2028] rounded py-2 text-[10px] hover:border-[#333] transition-colors active:scale-[0.97]"
          style={{ color: C.textFaint }}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <button
          onClick={cooldownSecs > 0 ? undefined : insert}
          disabled={cooldownSecs > 0}
          className="btn-pixel flex-1 bg-mint text-black rounded py-2 font-pixel text-[8px] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          title={cooldownSecs > 0 ? "Anti-spam protection — avoids accidental duplicate posts." : undefined}>
          {cooldownSecs > 0 ? `Post again in ${cooldownSecs}s` : "Insert into X"}
        </button>
      </div>

      <div className="flex gap-2">
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="flex-1 border border-[#1e2028] rounded py-1.5 text-[10px] hover:border-[#333] transition-colors"
            style={{ color: C.textFaint }}>
            ↻ Try again
          </button>
        )}
        {onSaveAsTemplate && (
          <button
            onClick={() => onSaveAsTemplate(text)}
            className="flex-1 border border-[#1e2028] rounded py-1.5 text-[10px] hover:border-[#333] transition-colors"
            style={{ color: C.textFaint }}>
            + Save as template
          </button>
        )}
      </div>

      <div className="space-y-0.5">
        {insertStatus && (
          <p className="text-[10px] animate-fade-in" style={{ color: C.textFaint }}>{insertStatus}</p>
        )}
      </div>
    </div>
  )
}

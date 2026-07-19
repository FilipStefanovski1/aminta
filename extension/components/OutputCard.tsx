import { useState } from "react"

import { insertImage, insertText } from "~lib/messaging"
import type { Mode, Platform } from "~lib/prompts"
import { hashText, queuePendingXP, XP_PER_MODE } from "~lib/xp"

const X_CHAR_LIMIT = 280

interface Props {
  text: string
  mode: Mode
  platform: Platform
  imageDataUrl?: string | null
  onRegenerate?: () => void
  onSaveAsTemplate?: (text: string) => void
}

export default function OutputCard({ text, mode, platform, imageDataUrl, onRegenerate, onSaveAsTemplate }: Props) {
  const [copied, setCopied] = useState(false)
  const [insertStatus, setInsertStatus] = useState("")

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
  const charColor = charCount > charLimit ? "#f87171" : charCount > charLimit * 0.9 ? "#fbbf24" : "#444"

  return (
    <div className="animate-card-in bg-[#111318] border border-[#1e2028] rounded-xl p-3 space-y-3">
      {imageDataUrl && (
        <img
          src={imageDataUrl}
          alt="Attached"
          className="w-full rounded-lg object-cover max-h-36"
        />
      )}
      <p className="text-sm whitespace-pre-wrap leading-relaxed text-[#e7e7ef]">{text}</p>

      {/* Character count */}
      <div className="flex justify-end">
        <span className="font-pixel text-[8px]" style={{ color: charColor }}>
          {charCount}/{charLimit}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={copy}
          className="flex-1 border border-[#1e2028] rounded py-2 text-[10px] text-[#666] hover:border-[#333] hover:text-[#888] transition-colors active:scale-[0.97]">
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <button
          onClick={insert}
          className="btn-pixel flex-1 bg-mint text-black rounded py-2 font-pixel text-[8px] active:scale-[0.97]">
          Insert into X
        </button>
      </div>

      <div className="flex gap-2">
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="flex-1 border border-[#1e2028] rounded py-1.5 text-[10px] text-[#555] hover:border-[#333] hover:text-[#888] transition-colors">
            ↻ Try again
          </button>
        )}
        {onSaveAsTemplate && (
          <button
            onClick={() => onSaveAsTemplate(text)}
            className="flex-1 border border-[#1e2028] rounded py-1.5 text-[10px] text-[#555] hover:border-[#333] hover:text-[#888] transition-colors">
            + Save as template
          </button>
        )}
      </div>

      <div className="space-y-0.5">
        {insertStatus && (
          <p className="text-[10px] text-[#555] animate-fade-in">{insertStatus}</p>
        )}
      </div>
    </div>
  )
}

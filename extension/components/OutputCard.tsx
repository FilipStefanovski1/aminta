import { useState } from "react"

import { getForm, getLevel } from "~lib/evolution"
import { insertImage, insertText } from "~lib/messaging"
import { incrementMissionPublished, recordStreak } from "~lib/missions"
import type { Mode, Platform } from "~lib/prompts"
import { hashText, tryAwardXP, XP_PER_MODE } from "~lib/xp"

const CHAR_LIMITS: Record<Platform, number> = {
  x: 280,
  linkedin: 3000,
  threads: 500,
}

interface Props {
  text: string
  mode: Mode
  platform: Platform
  currentXP: number
  imageDataUrl?: string | null
  onRegenerate?: () => void
  onXPAwarded: (amount: number, levelUp?: { level: number; stage: string }) => void
}

export default function OutputCard({ text, mode, platform, currentXP, imageDataUrl, onRegenerate, onXPAwarded }: Props) {
  const [copied, setCopied] = useState(false)
  const [insertStatus, setInsertStatus] = useState("")
  const [xpStatus, setXpStatus] = useState("")
  const [xpEarned, setXpEarned] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setInsertStatus("Copy failed — select manually.")
      setTimeout(() => setInsertStatus(""), 3000)
    }
  }

  const insert = async () => {
    setInsertStatus("")
    setXpStatus("")

    const res = await insertText(platform, text)
    if (!res.ok) {
      // Clipboard fallback so the user is never stuck
      try {
        await navigator.clipboard.writeText(text)
        setInsertStatus("Copied — paste it into the composer.")
      } catch {
        setInsertStatus("Insert failed — copy manually.")
      }
      setTimeout(() => setInsertStatus(""), 5000)
      return
    }

    // Insert image after text if one was provided
    if (imageDataUrl && platform === "x") {
      setInsertStatus("Inserting image…")
      const imgRes = await insertImage(platform, imageDataUrl)
      if (!imgRes.ok) {
        setInsertStatus("Text inserted. Image failed — attach manually.")
        setTimeout(() => setInsertStatus(""), 4000)
      } else {
        setInsertStatus("Inserted ✓")
        setTimeout(() => setInsertStatus(""), 2000)
      }
    } else {
      setInsertStatus("Inserted ✓")
      setTimeout(() => setInsertStatus(""), 2000)
    }

    const hash = hashText(text)
    const xpRes = await tryAwardXP(hash, XP_PER_MODE[mode])

    if ("error" in xpRes) {
      setXpStatus(
        xpRes.error === "already_claimed"
          ? "XP already claimed for this post."
          : "Daily XP limit reached. Come back tomorrow."
      )
    } else {
      setXpStatus(`+${xpRes.awarded} XP`)
      setXpEarned(true)

      const prevXP = currentXP
      const newXP = xpRes.total
      const oldLevel = getLevel(prevXP)
      const newLevel = getLevel(newXP)

      await recordStreak()
      await incrementMissionPublished()

      if (newLevel > oldLevel) {
        onXPAwarded(xpRes.awarded, { level: newLevel, stage: getForm(newXP).name })
      } else {
        onXPAwarded(xpRes.awarded)
      }
    }

    setTimeout(() => setXpStatus(""), 3000)
  }

  const insertLabel = platform === "linkedin" ? "Insert into LinkedIn" : "Insert into X"
  const charLimit = CHAR_LIMITS[platform]
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
          {insertLabel}
        </button>
      </div>

      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className="w-full border border-[#1e2028] rounded py-1.5 text-[10px] text-[#555] hover:border-[#333] hover:text-[#888] transition-colors">
          ↻ Try again
        </button>
      )}

      <div className="space-y-0.5">
        {insertStatus && (
          <p className="text-[10px] text-[#555] animate-fade-in">{insertStatus}</p>
        )}
        {xpStatus && (
          <p className={`text-[10px] font-pixel animate-fade-in ${xpEarned ? "text-mint" : "text-[#555]"}`}>
            {xpStatus}
          </p>
        )}
      </div>
    </div>
  )
}

// "Delete learned data" — a Train-tab privacy control, deliberately separate
// from Disconnect X (keeps the connection), Sign out (reversible), and
// Delete account (removes everything). See lib/learnedData.ts for exactly
// what is and isn't removed, and why Instincts survive.
import { useState } from "react"

import { clearLearnedData, hasLearnedData } from "~lib/learnedData"
import type { AmintaStore } from "~lib/storage"
import { pushToCloud } from "~lib/sync"
import { C } from "~lib/theme"

interface Props {
  store: AmintaStore
  /** Re-read the store so Train reflects the reset immediately, with no reload. */
  onCleared: () => void
}

export default function DeleteLearnedDataCard({ store, onCleared }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const anythingLearned = hasLearnedData(store)

  const run = async () => {
    if (busy) return
    setBusy(true)
    setError("")
    const res = await clearLearnedData(pushToCloud)
    // Local state is already cleared either way — refresh so Train can't
    // keep showing a profile that no longer exists.
    onCleared()
    if (!res.ok) {
      setError(res.error ?? "Cleared on this device, but couldn't reach the server. It'll retry on the next sync.")
      setBusy(false)
      return
    }
    setBusy(false)
    setOpen(false)
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#262628", border: "1px solid #404048" }}>
      <div className="px-4 py-4">
        <p className="font-pixel text-[10px] uppercase tracking-widest" style={{ color: C.text }}>Learned data</p>

        {!open ? (
          <>
            <p className="text-[10px] leading-snug mt-2" style={{ color: C.textFaint }}>
              Removes your saved writing examples and learned voice profile. Your account and X
              connection stay active.
            </p>
            <button
              onClick={() => setOpen(true)}
              disabled={!anythingLearned}
              className="text-[10px] mt-3 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: anythingLearned ? "#f87171" : C.textGhost }}>
              {anythingLearned ? "Delete learned data" : "Nothing learned yet"}
            </button>
          </>
        ) : (
          <div className="mt-2 space-y-2.5">
            <p className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>
              Aminta will forget your writing examples, imported Tweet DNA, and the voice profile it
              learned from them.
            </p>
            <p className="text-[10px] leading-relaxed" style={{ color: C.textFaint }}>
              Your account, X connection, Instincts, templates, and recent creations are not
              affected. You can retrain or run Voice Refresh again right away.
            </p>
            {error && <p className="text-[10px] leading-snug text-red-400">{error}</p>}
            <div className="flex gap-2 pt-0.5">
              <button
                onClick={() => { setOpen(false); setError("") }}
                disabled={busy}
                className="flex-1 rounded-lg py-2 text-[11px] font-medium disabled:opacity-40"
                style={{ border: `1px solid ${C.border}`, color: C.textFaint }}>
                Cancel
              </button>
              <button
                onClick={run}
                disabled={busy}
                className="flex-1 rounded-lg py-2 text-[11px] font-semibold disabled:opacity-40 disabled:cursor-wait"
                style={{ backgroundColor: "#2a1616", color: "#f87171", border: "1px solid #4a2226" }}>
                {busy ? "Deleting…" : "Delete learned data"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

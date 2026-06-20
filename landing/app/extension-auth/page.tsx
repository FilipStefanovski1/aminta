"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type Status = "sending" | "done" | "error"

export default function ExtensionAuthPage() {
  const [status, setStatus] = useState<Status>("sending")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const extId = params.get("ext_id")
    if (!extId) { setStatus("error"); return }

    const supabase = createClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setStatus("error"); return }

      const msg = {
        type: "AMINTA_AUTH",
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userId: session.user.id,
        email: session.user.email ?? "",
      }

      try {
        // @ts-ignore — chrome is available in Chrome extension context pages
        chrome.runtime.sendMessage(extId, msg, () => {
          // Background will close this tab; show done state as fallback
          setStatus("done")
        })
      } catch {
        setStatus("error")
      }
    })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111] px-4">
      <div className="text-center space-y-4">
        <svg width="32" height="26" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
          <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
          <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
          <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
          <rect x="4" y="6" width="2" height="2" fill="#111" />
          <rect x="10" y="6" width="2" height="2" fill="#111" />
        </svg>

        {status === "sending" && (
          <p className="font-pixel text-[9px] tracking-widest" style={{ color: "#74f7b5" }}>
            Connecting…
          </p>
        )}
        {status === "done" && (
          <>
            <p className="font-pixel text-[9px] tracking-widest" style={{ color: "#74f7b5" }}>
              Signed in!
            </p>
            <p className="text-xs text-[#555]">You can close this tab.</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="font-pixel text-[9px] tracking-widest text-red-400">
              Something went wrong
            </p>
            <p className="text-xs text-[#555]">Close this tab and try again.</p>
          </>
        )}
      </div>
    </div>
  )
}

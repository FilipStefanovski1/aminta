"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export const dynamic = "force-dynamic"

// Chrome extension IDs are exactly 32 chars, alphabet a-p (base-16 custom encoding).
const EXT_ID_RE = /^[a-p]{32}$/

// Allowlist of known Aminta extension IDs.
// NEXT_PUBLIC_AMINTA_EXTENSION_IDS is a comma-separated list set at build time.
// Leave empty to skip strict enforcement (dev/staging only).
const ALLOWED_IDS: Set<string> = new Set(
  (process.env.NEXT_PUBLIC_AMINTA_EXTENSION_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
)

function isAllowedExtId(id: string): boolean {
  // Must be a valid Chrome extension ID format.
  if (!EXT_ID_RE.test(id)) return false
  // If an allowlist is configured, the ID must be in it.
  if (ALLOWED_IDS.size > 0) return ALLOWED_IDS.has(id)
  // No allowlist configured — accept any well-formed ID (dev/staging).
  return true
}

type Status = "sending" | "done" | "error" | "forbidden"

export default function ExtensionAuthPage() {
  const [status, setStatus] = useState<Status>("sending")
  const [errorDetail, setErrorDetail] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const extId = params.get("ext_id") ?? ""

    // Security: validate the extension ID before sending any tokens.
    if (!isAllowedExtId(extId)) {
      console.error("[Aminta] extension-auth: rejected ext_id:", extId)
      setErrorDetail("Invalid extension ID.")
      setStatus("forbidden")
      return
    }

    const supabase = createClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setErrorDetail("No session — sign-in did not complete.")
        setStatus("error")
        return
      }

      const msg = {
        type: "AMINTA_AUTH",
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userId: session.user.id,
        email: session.user.email ?? "",
      }

      try {
        const cr = (window as any).chrome
        if (!cr?.runtime) {
          setErrorDetail("chrome.runtime not available.")
          setStatus("error")
          return
        }

        cr.runtime.sendMessage(extId, msg, () => {
          if (cr.runtime.lastError) {
            const msg = cr.runtime.lastError.message ?? "unknown"
            console.error("[Aminta] extension-auth: sendMessage failed:", msg)
            setErrorDetail(`Extension messaging failed: ${msg}`)
            setStatus("error")
          } else {
            localStorage.removeItem("aminta_ext_id")
            setStatus("done")
          }
        })
      } catch (e) {
        console.error("[Aminta] extension-auth: chrome.runtime unavailable:", e)
        setErrorDetail(`Exception: ${String(e)}`)
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
        {status === "forbidden" && (
          <>
            <p className="font-pixel text-[9px] tracking-widest text-red-400">
              Unauthorised extension
            </p>
            <p className="text-xs text-[#555]">{errorDetail}</p>
          </>
        )}
      </div>
    </div>
  )
}

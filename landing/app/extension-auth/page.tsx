"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import posthog from "posthog-js"

export const dynamic = "force-dynamic"

const isDev = process.env.NODE_ENV !== "production"

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
  const router = useRouter()
  const [status, setStatus] = useState<Status>("sending")
  const [errorDetail, setErrorDetail] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const extId = params.get("ext_id") ?? ""

    // Security: validate the extension ID before sending any tokens.
    if (!isAllowedExtId(extId)) {
      console.error("[Aminta] extension-auth: rejected ext_id:", extId)
      posthog.capture("extension_auth_failed", { reason: "invalid_extension_id" })
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

      // Allowlist: accept AMINTA_AUTH_ACK from both www and non-www origins.
      // Chrome content scripts post messages with the document origin of their
      // isolated world, which can be www even when the page URL omits it.
      const ALLOWED_ACK_ORIGINS = [
        "https://amintaapp.com",
        "https://www.amintaapp.com",
      ]

      // Listen for ACK from the content script (aminta-auth-bridge.ts).
      // The content script receives our postMessage, writes to chrome.storage.local,
      // then posts back AMINTA_AUTH_ACK. This avoids any ext_id dependency.
      let fallbackRedirectId: ReturnType<typeof setTimeout> | undefined
      function onAck(event: MessageEvent) {
        console.log("[ext-auth] HOP5 message received — event.origin:", event.origin,
          "| window.location.origin:", window.location.origin,
          "| type:", event.data?.type)
        if (!event.data || event.data.type !== "AMINTA_AUTH_ACK") return
        if (!ALLOWED_ACK_ORIGINS.includes(event.origin)) {
          console.warn("[ext-auth] HOP5 rejected — origin not in allowlist:", event.origin)
          return
        }
        window.removeEventListener("message", onAck)
        clearTimeout(timeoutId)
        if (isDev) console.log("[ext-auth] extension-auth ACK received — ok:", event.data.ok)
        if (event.data.ok) {
          localStorage.removeItem("aminta_ext_id")
          posthog.capture("extension_auth_completed")
          setStatus("done")

          // The extension itself closes this tab (background.ts calls
          // chrome.tabs.remove after AMINTA_AUTH_FROM_BRIDGE). That's the
          // expected path and usually wins this race. But if the tab is
          // still open after a short grace period — service worker was
          // asleep, chrome.tabs.remove failed, the user opened this URL
          // directly, etc. — never leave the user parked on a static
          // "Signed in!" screen. Redirect to the dashboard instead.
          fallbackRedirectId = setTimeout(() => {
            if (isDev) console.log("[ext-auth] final redirect target: /dashboard (tab still open after handoff)")
            router.replace("/dashboard")
          }, 1500)
        } else {
          posthog.capture("extension_auth_failed", { reason: "bridge_error", detail: event.data.error ?? "unknown" })
          setErrorDetail(`Bridge error: ${event.data.error ?? "unknown"}`)
          setStatus("error")
        }
      }

      // Timeout in case the content script isn't injected (extension not installed).
      const timeoutId = setTimeout(() => {
        window.removeEventListener("message", onAck)
        posthog.capture("extension_auth_failed", { reason: "timeout" })
        setErrorDetail("Extension not detected — make sure Aminta is installed and enabled.")
        setStatus("error")
      }, 5000)

      window.addEventListener("message", onAck)

      // Send tokens to the content script via postMessage.
      // The content script on amintaapp.com writes them to chrome.storage.local.
      console.log("[ext-auth] HOP3 sending AMINTA_AUTH_TOKENS")
      window.postMessage({
        type: "AMINTA_AUTH_TOKENS",
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userId: session.user.id,
        email: session.user.email ?? "",
      }, window.location.origin)
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
            <p className="text-xs text-[#555]">This tab will close, or redirect to your dashboard.</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="font-pixel text-[9px] tracking-widest text-red-400">
              Something went wrong
            </p>
            <p className="text-xs text-[#555]">{errorDetail || "Close this tab and try again."}</p>
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

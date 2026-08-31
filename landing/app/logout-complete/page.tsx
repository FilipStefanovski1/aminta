"use client"

// Opened silently (background tab, no focus) by the extension's own sign-out
// — see extension/lib/auth.ts's signOutEverywhere(). The extension can
// revoke its own session server-side and clear its own chrome.storage.local
// copy, but it has no access to amintaapp.com's browser-side Supabase
// session (createBrowserClient stores it in this origin's own cookies) —
// without this page, "Sign out" in the extension left the website itself
// still fully signed in, which is exactly what let a later "Connect with X"
// silently hand back that same stale account instead of authenticating fresh.
//
// This page's only job is to sign this browser out of amintaapp.com, tell
// the extension it's done (same content-script bridge pattern
// extension-auth uses for the opposite direction), and get out of the way.
// It never touches x.com.
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

const isDev = process.env.NODE_ENV !== "production"

export default function LogoutCompletePage() {
  const router = useRouter()
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false

    createClient().auth.signOut().finally(() => {
      if (cancelled) return
      if (isDev) console.log("[logout-complete] website session cleared")
      setDone(true)
      // Same-origin postMessage — the content script (aminta-auth-bridge.ts)
      // relays this to background.ts, which closes this (backgrounded) tab.
      window.postMessage({ type: "AMINTA_LOGOUT_COMPLETE" }, window.location.origin)

      // The extension normally closes this tab itself once it receives the
      // relay above. If it doesn't within a short grace period — service
      // worker was asleep, the bridge failed, the user opened this URL
      // directly — never leave a stray tab parked on a blank confirmation
      // screen; send it somewhere useful instead.
      setTimeout(() => {
        if (!cancelled) router.replace("/login")
      }, 1500)
    })

    return () => { cancelled = true }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#1a1a1a" }}>
      <p className="text-sm" style={{ color: "#888" }}>
        {done ? "Signed out." : "Signing out…"}
      </p>
    </div>
  )
}

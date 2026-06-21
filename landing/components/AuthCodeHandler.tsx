"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export default function AuthCodeHandler() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code")
    if (!code) return

    const supabase = createClient()
    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error || !data.session) return

      const extId = localStorage.getItem("aminta_ext_id")
      if (extId) {
        localStorage.removeItem("aminta_ext_id")
        const msg = {
          type: "AMINTA_AUTH",
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          userId: data.session.user.id,
          email: data.session.user.email ?? "",
        }
        try {
          // @ts-ignore
          chrome.runtime.sendMessage(extId, msg, () => {
            window.close()
          })
        } catch {
          window.location.replace("/welcome")
        }
      } else {
        window.location.replace("/welcome")
      }
    })
  }, [])

  return null
}

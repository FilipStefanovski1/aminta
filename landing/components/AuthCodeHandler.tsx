"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export default function AuthCodeHandler() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code")
    if (!code) return

    createClient().auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!error) {
        window.location.replace("/welcome")
      }
    })
  }, [])

  return null
}

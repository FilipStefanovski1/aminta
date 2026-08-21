// X redirects here after the user approves (or denies) the connection.
//
// SECURITY: the Aminta user is taken from the stored state row and from
// nowhere else. There is no user id in the query string to forge, and the
// state row is deleted before the code is exchanged, so a replayed callback
// finds nothing and is rejected. This is what prevents one signed-in user
// from attaching another user's X authorization.
//
// Renders a small self-closing page rather than JSON: the user is looking at
// a browser tab, not calling an API.
import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { exchangeCode } from "@/lib/x/oauth"
import { encryptToken } from "@/lib/x/crypto"
import { fetchMe } from "@/lib/x/client"

const X_HOME = "https://x.com/home"

// On success, redirect back to X rather than leaving the user on a dead-end
// tab — but only ever fired AFTER the connection row is actually persisted
// below, never before. The visible success message + fallback "Continue to
// X" link cover the case where the browser blocks the automatic redirect.
function page(title: string, message: string, ok: boolean, redirectTo?: string): NextResponse {
  const redirectScript = ok && redirectTo
    ? `setTimeout(function(){window.location.href=${JSON.stringify(redirectTo)}},1200)`
    : `setTimeout(function(){window.close()},2500)`
  const link = ok && redirectTo
    ? `<p style="margin-top:14px"><a href="${redirectTo}" style="color:#74f7b5">Continue to X →</a></p>`
    : ""
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{background:#1f1f1f;color:#e8e8ea;font:14px -apple-system,system-ui,sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.c{text-align:center;max-width:320px;padding:24px}
h1{font-size:15px;margin:0 0 8px;color:${ok ? "#74f7b5" : "#f87171"}}
p{color:#888896;line-height:1.5;margin:0}</style>
<div class="c"><h1>${title}</h1><p>${message}</p>${link}</div>
<script>${redirectScript}</script>`
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } })
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const denied = url.searchParams.get("error")

  if (denied) return page("Connection cancelled", "You can close this tab and try again any time.", false)
  if (!code || !state) return page("Connection failed", "Missing authorization details. Please try again.", false)

  const service = await createServiceClient()

  // Single-use: read then immediately delete, so a replayed callback finds
  // no row. Deleting before the exchange also means a failed exchange can't
  // leave a reusable state behind.
  const { data: stateRow } = await service
    .from("x_oauth_states")
    .select("user_id, code_verifier, expires_at")
    .eq("state", state)
    .single()

  await service.from("x_oauth_states").delete().eq("state", state)

  if (!stateRow) return page("Connection failed", "This link has already been used. Please try connecting again.", false)
  if (Date.parse(stateRow.expires_at) < Date.now()) {
    return page("Connection expired", "That took a little too long. Please try connecting again.", false)
  }

  let tokens
  try {
    tokens = await exchangeCode(code, stateRow.code_verifier)
  } catch (e) {
    // Status-only error; the message never carries the code or verifier.
    console.error("[Voice Refresh] token exchange failed", {
      reason: e instanceof Error ? e.message : "unknown",
    })
    return page("Connection failed", "X could not confirm the connection. Please try again.", false)
  }

  let me
  try {
    me = await fetchMe(tokens.accessToken)
  } catch {
    return page("Connection failed", "Could not read your X profile. Please try again.", false)
  }

  const { error } = await service.from("x_connections").upsert(
    {
      user_id: stateRow.user_id,
      x_user_id: me.id,
      x_username: me.username,
      x_display_name: me.name,
      x_avatar_url: me.profileImageUrl,
      access_token_cipher: encryptToken(tokens.accessToken),
      refresh_token_cipher: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      token_expires_at: tokens.expiresAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )

  if (error) {
    // The UNIQUE on x_user_id fires here when someone tries to attach an X
    // account that is already linked to a different Aminta account.
    const alreadyLinked = /x_connections_x_user_id_key|duplicate key/i.test(error.message)
    console.error("[Voice Refresh] could not save connection", { reason: error.message })
    return page(
      "Connection failed",
      alreadyLinked
        ? "That X account is already connected to another Aminta account."
        : "Could not save the connection. Please try again.",
      false
    )
  }

  return page("X connected", `Connected as @${me.username}. Taking you back to X…`, true, X_HOME)
}

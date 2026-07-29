// Centralized origin for the auth handoff the extension opens on
// amintaapp.com. lib/auth.ts's REFRESH_URL and lib/sync.ts/backendGenerate.ts's
// API_URL predate this file and are unrelated to the login-UI work this
// exists for, so they're left as their own constants rather than folded in
// here — this is scoped to the login URL only.
//
// Local-dev note: this deliberately does NOT switch to a localhost origin in
// dev builds. The content-script bridge (contents/aminta-auth-bridge.ts)
// only injects on https://amintaapp.com/* and https://www.amintaapp.com/*
// (its own `matches` config), and `externally_connectable` in package.json's
// manifest allows the same origin only. Pointing this at localhost without
// also widening both of those would silently break the handoff in dev — the
// tab would open, but no content script would be there to receive the
// tokens. Enabling true local-dev testing of this flow is a manifest change,
// out of scope here.
export const AMINTA_WEB_ORIGIN = "https://amintaapp.com"

export function loginUrl(extId: string): string {
  return `${AMINTA_WEB_ORIGIN}/login?ext_id=${extId}`
}

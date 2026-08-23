// The one reusable guard every X-composer-writing action must pass before
// it's allowed to touch the page. Centralized here so the check can never
// drift between call sites — see contents/twitter-bridge.ts for every place
// this is actually enforced.
import { getStore } from "~lib/storage"
import { getActiveXIdentity } from "~lib/activeXIdentity"
import { getConnectedXIdentity, xIdentitiesMatch } from "~lib/xIdentity"

// Not a discriminated union on purpose — this project builds with
// `strict: false` (inherited from Plasmo's base tsconfig), under which
// `if (!check.ok)` does not reliably narrow a `{ok:true}|{ok:false,error}`
// union at every call site. A plain optional field sidesteps that
// entirely: `error` is simply absent when `ok` is true.
export interface GuardResult {
  ok: boolean
  error?: string
}

/**
 * Blocks whenever Aminta is connected to one X account but the browser is
 * currently signed into a different one. Never switches identities and
 * never reconnects automatically — a mismatch (or an active account Aminta
 * can't identify at all) is always a hard, fail-safe block.
 *
 * Returns ok:true when Aminta has no connected X identity at all — there is
 * nothing to protect against in that case, and gating every insert on an
 * X connection that most users never set up would be a much bigger,
 * unrelated behavior change.
 */
export async function assertActiveXAccountMatchesConnectedAccount(): Promise<GuardResult> {
  const store = await getStore()
  const connected = getConnectedXIdentity(store)
  if (!connected) return { ok: true }

  const active = getActiveXIdentity()
  if (!active?.username) {
    return { ok: false, error: "Aminta couldn't verify which X account you're using." }
  }

  if (xIdentitiesMatch(connected, active)) return { ok: true }

  return {
    ok: false,
    error: `WRONG X ACCOUNT\n\nAminta is connected to @${connected.username}, but you're using @${active.username} on X.\n\nSwitch accounts on X and try again.`,
  }
}

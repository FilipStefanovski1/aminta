// Lightweight, unentitled preview of a connected user's own recent X posts —
// deliberately NOT Voice Refresh. No plan/entitlement gate (Free and paid
// users alike), no Gemini call, no allowance reservation, no cooldown, no
// ai_usage_log entry, no Aminta credit cost. This exists so onboarding's
// manual-training step can let a user pick from a few of their own real
// posts instead of only pasting text blind — reuses the exact same
// "eligible post" definition Voice Refresh itself uses (fetchOwnPosts +
// buildCorpus, see lib/x/client.ts and lib/x/filter.ts) rather than
// inventing a second filtering rule.
//
// "0 credits" here refers only to Aminta's own credit/entitlement system.
// fetchOwnPosts still makes one real, X-billed API read (see
// lib/x/client.ts's cost-discipline comment) — that cost cannot be avoided
// regardless of plan, so the batch size below is kept deliberately small.
//
// Nothing here is persisted: the fetched batch exists only as a local
// variable for the duration of this request, same lifecycle discipline as
// Voice Refresh's own corpus. Only whichever post(s) the user explicitly
// clicks "+ Add" for become part of their saved voice.examples — this
// endpoint has no write path of its own.
import { NextResponse, type NextRequest } from "next/server"
import { getRequestUser } from "@/lib/auth/requestUser"
import { fetchOwnPosts, XApiError } from "@/lib/x/client"
import { buildCorpus, type RawXPost } from "@/lib/x/filter"

// Small, fixed batch — above X's documented minimum for this endpoint,
// comfortably smaller than Voice Refresh's own 25-post read, since only 3
// eligible posts are ever shown.
const PREVIEW_FETCH = 10
const PREVIEW_LIMIT = 3

function fail(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

/**
 * Picks up to `limit` eligible posts (same rules as Voice Refresh's own
 * buildCorpus) and returns each with its ORIGINAL text, line breaks intact
 * — never buildCorpus's own prose-stripped `.text`, which collapses all
 * whitespace and is only appropriate for feeding a style-analysis prompt.
 * Exported for unit testing (pure, no I/O).
 */
export function selectPreviewPosts(posts: RawXPost[], limit: number): { id: string; text: string }[] {
  const { corpus } = buildCorpus(posts, limit)
  const rawById = new Map(posts.map((p) => [p.id, p.text]))
  return corpus.map((c) => ({ id: c.id, text: rawById.get(c.id) ?? c.text }))
}

/** Maps an X fetch failure to a user-facing error — exported for unit testing (no I/O). */
export function mapXFetchError(e: unknown): { error: string; code: string; status: number } {
  if (e instanceof XApiError) {
    if (e.code === "x_not_connected") return { error: "Connect your X account first.", code: "X_NOT_CONNECTED", status: 400 }
    if (e.code === "x_reauth_required") return { error: "Your X authorization expired. Please reconnect.", code: "X_REAUTH_REQUIRED", status: 409 }
    if (e.code === "x_rate_limited") return { error: "X is rate limiting requests. Try again shortly.", code: "X_RATE_LIMITED", status: 429 }
  }
  return { error: "Couldn't reach X right now.", code: "X_UNAVAILABLE", status: 502 }
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return fail("Sign in required.", "UNAUTHENTICATED", 401)

  try {
    const { posts } = await fetchOwnPosts(user.id, PREVIEW_FETCH)
    // Text only — no engagement metrics, no timestamps, nothing beyond
    // what a compact selectable card needs.
    return NextResponse.json({ posts: selectPreviewPosts(posts, PREVIEW_LIMIT) })
  } catch (e) {
    console.error("[X recent posts] fetch failed", { code: e instanceof XApiError ? e.code : "unknown" })
    const mapped = mapXFetchError(e)
    return fail(mapped.error, mapped.code, mapped.status)
  }
}

export const runtime = "nodejs"

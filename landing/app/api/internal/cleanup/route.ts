// Vercel Cron target — deletes stale Included-AI operational data so none
// of these tables grow unbounded:
//   - ai_rate_limit_counters: fixed-window rows older than their window
//     matters (24h — well past the 1h/1min windows actually used)
//   - ai_inflight_requests: expired concurrency leases (crash-safety net —
//     claim_inflight_slot already lazy-deletes these on every call, this is
//     just a backstop for a user who never generates again)
//   - ai_usage_log, in two distinct steps:
//       1. CONTENT SCRUB — `result_text` (the user's generated output) is
//          nulled once the row is older than CONTENT_TTL_MS. It only ever
//          existed to replay a duplicate requestId, and the API already
//          refuses to serve it past that TTL (see retention.ts's
//          resolveReplayState), so scrubbing loses nothing.
//       2. RECORD RETENTION — the whole row is deleted after
//          USAGE_LOG_RETENTION_DAYS. The surviving columns in between are
//          non-content operational data only (char/image counts, mode,
//          tokens, cost, latency, status, device id, hashed IP).
//
// Scheduled via vercel.json's `crons` array (daily) — see that file. Not
// wired up here alone: a route that only *can* be called isn't a cleanup
// job, it's dead code with a URL, until something actually calls it on a
// schedule.
//
// Protected by a shared secret (not user auth — this is a
// machine-to-machine internal endpoint) so it can't be triggered by an
// arbitrary caller.
import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { contentCutoff, usageLogCutoff } from "@/lib/ai/retention"

export const runtime = "nodejs"

const RATE_LIMIT_COUNTER_RETENTION_MS = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()
  const now = Date.now()

  const [counters, inflight, scrubbed, usageLog] = await Promise.all([
    service
      .from("ai_rate_limit_counters")
      .delete()
      .lt("window_start", new Date(now - RATE_LIMIT_COUNTER_RETENTION_MS).toISOString()),
    service
      .from("ai_inflight_requests")
      .delete()
      .lt("expires_at", new Date(now).toISOString()),
    // Content scrub. Nulls only the generated text; every other column on
    // the row survives until the 90-day delete below. `not(result_text,
    // is, null)` keeps this a no-op once everything is already scrubbed
    // instead of rewriting the whole table daily. This also sweeps up rows
    // written before the short-TTL policy existed.
    service
      .from("ai_usage_log")
      .update({ result_text: null })
      .lt("created_at", contentCutoff(now).toISOString())
      .not("result_text", "is", null),
    service
      .from("ai_usage_log")
      .delete()
      .lt("created_at", usageLogCutoff(now).toISOString()),
  ])

  const errors = [counters.error, inflight.error, scrubbed.error, usageLog.error].filter(Boolean)
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.map((e) => e!.message).join("; ") }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

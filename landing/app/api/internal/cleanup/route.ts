// Vercel Cron target — deletes stale Included-AI operational data so none
// of these tables grow unbounded:
//   - ai_rate_limit_counters: fixed-window rows older than their window
//     matters (24h — well past the 1h/1min windows actually used)
//   - ai_inflight_requests: expired concurrency leases (crash-safety net —
//     claim_inflight_slot already lazy-deletes these on every call, this is
//     just a backstop for a user who never generates again)
//   - ai_usage_log: retained USAGE_LOG_RETENTION_DAYS for audit/spend
//     history, then purged — this table holds `result_text` (the user's
//     generated content) and a hashed IP, so it shouldn't live forever
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

export const runtime = "nodejs"

const RATE_LIMIT_COUNTER_RETENTION_MS = 24 * 60 * 60 * 1000
const USAGE_LOG_RETENTION_DAYS = 90

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()
  const now = Date.now()

  const [counters, inflight, usageLog] = await Promise.all([
    service
      .from("ai_rate_limit_counters")
      .delete()
      .lt("window_start", new Date(now - RATE_LIMIT_COUNTER_RETENTION_MS).toISOString()),
    service
      .from("ai_inflight_requests")
      .delete()
      .lt("expires_at", new Date(now).toISOString()),
    service
      .from("ai_usage_log")
      .delete()
      .lt("created_at", new Date(now - USAGE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()),
  ])

  const errors = [counters.error, inflight.error, usageLog.error].filter(Boolean)
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.map((e) => e!.message).join("; ") }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

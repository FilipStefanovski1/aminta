// Retention policy for Included AI generation data.
//
// Two separate clocks, deliberately:
//
//   CONTENT_TTL_MS   — how long `ai_usage_log.result_text` (the generated
//                      text itself) stays readable/stored. Short.
//   Record retention — how long the surrounding non-content row (token
//                      counts, cost, latency, mode, hashed IP) lives. Long,
//                      owned by the cleanup cron, unchanged at 90 days.
//
// Why 15 minutes for content:
//
// `result_text` exists for exactly one reason — replaying the response when
// the same (user_id, request_id) arrives twice. The client generates
// requestId with crypto.randomUUID() once per user-initiated click and
// never persists it (see extension/lib/backendGenerate.ts), so once that
// call returns or throws the id is unrecoverable and can never be replayed.
// The only in-call reuse is a single immediate 401-refresh retry.
//
// Server-side, one generation is bounded by gemini.ts's TOTAL_DEADLINE_MS
// (15s) across MAX_ATTEMPTS (2), and the architecture's own "this request
// might still be running" bound is the concurrency lease TTL in
// rateLimit.ts's claimConcurrencySlot (70s).
//
// 15 minutes is ~13x that 70s bound — generous room for clock skew and slow
// networks — while keeping generated text out of the database ~96x sooner
// than the old 90-day behaviour. Nothing else in the codebase reads
// result_text, so no feature depends on it living longer.
export const CONTENT_TTL_MS = 15 * 60 * 1000

// Full-row retention for the non-content operational record. Unchanged —
// quota/spend/abuse auditing still needs the metadata columns.
export const USAGE_LOG_RETENTION_DAYS = 90

export function contentCutoff(now: number = Date.now()): Date {
  return new Date(now - CONTENT_TTL_MS)
}

export function usageLogCutoff(now: number = Date.now()): Date {
  return new Date(now - USAGE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

export function isContentExpired(createdAt: string | null, now: number = Date.now()): boolean {
  if (!createdAt) return true // unknown age — treat as expired, never serve it
  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) return true
  return now - t > CONTENT_TTL_MS
}

/** Minimal shape resolveReplayState needs — mirrors UsageLogRow in quota.ts. */
export interface ReplayCandidate {
  status: "pending" | "success" | "error"
  result_text: string | null
  created_at?: string | null
}

export type ReplayState = "success" | "error" | "in_progress" | "expired"

// The single decision for "a duplicate (user_id, request_id) arrived — what
// do we do with the existing row?" Pure so it can be tested without a
// database.
//
// `expired` is its own state rather than falling through to `in_progress`:
// after a content scrub the row is still status='success' with
// result_text=NULL, and reporting that as "still processing" would be both
// wrong and confusing. It must never be reported as success either — that
// would return a null/empty body to the client.
export function resolveReplayState(row: ReplayCandidate, now: number = Date.now()): ReplayState {
  if (row.status === "error") return "error"

  if (row.status === "success") {
    // Scrubbed (or past its TTL and not yet physically scrubbed) — either
    // way the content is gone as far as callers are concerned.
    if (!row.result_text) return "expired"
    if (isContentExpired(row.created_at ?? null, now)) return "expired"
    return "success"
  }

  // status === 'pending' — the original request is genuinely still running.
  return "in_progress"
}

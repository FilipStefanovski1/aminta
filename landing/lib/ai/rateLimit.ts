// Postgres-backed rate limiting + concurrency limiting for Included AI.
// No Redis/Upstash — atomic SQL functions in the existing Supabase project
// (a 20-50ms DB round-trip is negligible next to the 1-5s LLM call itself).
//
// Both checkAndIncrementRateLimits() and claimConcurrencySlot() below call a
// single atomic Postgres function (increment_rate_limit / claim_inflight_slot
// — see supabase-setup.sql section 10.2/10.3) rather than doing
// read-then-write in JavaScript. A prior version of this file did
// "read count -> increment" and "delete expired -> count -> insert" as
// separate round trips, each racy under concurrent requests — two requests
// could both read/count before either wrote, letting a burst past the
// limit. The SQL functions close that gap by making the whole
// check-and-mutate a single statement.
import { createServiceClient } from "@/lib/supabase/server"

function floorToWindow(date: Date, windowMs: number): string {
  const ms = date.getTime()
  return new Date(ms - (ms % windowMs)).toISOString()
}

const MINUTE = 60_000
const HOUR = 3_600_000

async function incrementAndCheck(key: string, windowMs: number, limit: number): Promise<boolean> {
  const service = await createServiceClient()
  const windowStart = floorToWindow(new Date(), windowMs)
  const { data, error } = await service
    .rpc("increment_rate_limit", { p_key: key, p_window_start: windowStart, p_limit: limit })
    .single()

  if (error || !data) {
    // Fail OPEN on a transient RPC hiccup rather than blocking all
    // Included-AI traffic on a counter-table error — concurrency, quota, and
    // the global spend cap still bound worst-case cost.
    return true
  }
  return (data as { allowed: boolean }).allowed
}

export interface RateLimitCheck {
  userId: string
  ip: string | null
  deviceId: string | null
}

const PER_USER_MIN_LIMIT = 6
const PER_USER_HOUR_LIMIT = 60
const PER_IP_MIN_LIMIT = 20
const PER_DEVICE_MIN_LIMIT = 6

// Every counter increments unconditionally and atomically, in parallel — an
// over-limit request still counts toward its window (previously it didn't
// under the read-then-increment design). That's intentional: it's the only
// way to make the check race-free without a cross-counter transaction, and
// it's strictly safer for abuse protection, not a regression.
export async function checkAndIncrementRateLimits(
  input: RateLimitCheck
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const userMinKey = `user:${input.userId}:min`
  const userHourKey = `user:${input.userId}:hour`
  const ipMinKey = input.ip ? `ip:${input.ip}:min` : null
  const deviceMinKey = input.deviceId ? `device:${input.deviceId}:min` : null

  const [userMinOk, userHourOk, ipOk, deviceOk] = await Promise.all([
    incrementAndCheck(userMinKey, MINUTE, PER_USER_MIN_LIMIT),
    incrementAndCheck(userHourKey, HOUR, PER_USER_HOUR_LIMIT),
    ipMinKey ? incrementAndCheck(ipMinKey, MINUTE, PER_IP_MIN_LIMIT) : Promise.resolve(true),
    deviceMinKey ? incrementAndCheck(deviceMinKey, MINUTE, PER_DEVICE_MIN_LIMIT) : Promise.resolve(true),
  ])

  if (!userMinOk) return { ok: false, reason: "You're generating too quickly. Wait a moment and try again." }
  if (!userHourOk) return { ok: false, reason: "Hourly generation limit reached. Try again later." }
  if (!ipOk) return { ok: false, reason: "Too many requests from this network. Try again shortly." }
  if (!deviceOk) return { ok: false, reason: "You're generating too quickly. Wait a moment and try again." }

  return { ok: true }
}

// ─── Concurrency limiting ───────────────────────────────────────────────────
// claim_inflight_slot atomically deletes expired leases, counts active ones,
// and inserts the new lease only if under the limit — all inside one
// Postgres function call, serialized per-user via pg_advisory_xact_lock (see
// supabase-setup.sql section 10.2). Returns false (no lease acquired) rather
// than throwing when at capacity.
export async function claimConcurrencySlot(
  requestId: string,
  userId: string,
  maxConcurrent: number,
  ttlMs = 70_000
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const service = await createServiceClient()
  const { data, error } = await service
    .rpc("claim_inflight_slot", {
      p_id: requestId,
      p_user_id: userId,
      p_max_concurrent: maxConcurrent,
      p_ttl_seconds: Math.round(ttlMs / 1000),
    })

  if (error) {
    // Fail closed here (unlike rate limits) — concurrency exists specifically
    // to bound simultaneous provider calls per user; silently allowing on
    // error would defeat that purpose during exactly the kind of DB trouble
    // it's meant to guard against.
    return { ok: false, reason: "Couldn't start generation right now. Try again in a moment." }
  }
  if (!data) {
    return { ok: false, reason: "You already have a generation in progress. Wait for it to finish." }
  }
  return { ok: true }
}

export async function clearInflight(requestId: string): Promise<void> {
  const service = await createServiceClient()
  await service.from("ai_inflight_requests").delete().eq("id", requestId)
}

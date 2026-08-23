// Single source of truth for the Founder (lifetime) seat cap. Every place
// that needs "50" — pricing copy, the availability check, tests — imports
// FOUNDER_LIMIT from here rather than hardcoding the number.
//
// A seat is consumed ONLY by a row in `users` with plan = 'lifetime'. That
// column is written in exactly one place today — app/api/webhooks/creem/
// route.ts, on a `subscription.active` / `checkout.completed` event for a
// one-time ("onetime" billing_type) product — which only fires after Creem
// has confirmed the $49 payment actually completed. Opening checkout,
// creating a checkout session, a failed/canceled/test checkout, a Free
// signup, or a Pro subscription never touch this column, so counting
// plan = 'lifetime' rows is already an accurate "successful Founder
// purchases" count with no new tracking needed.
import { createServiceClient } from "@/lib/supabase/server"

export const FOUNDER_LIMIT = 50

/** Real, DB-backed count of completed Founder/lifetime purchases. Server-only (service-role). */
export async function countFounderSeatsUsed(): Promise<number> {
  const supabase = await createServiceClient()
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("plan", "lifetime")
  if (error) throw error
  return count ?? 0
}

export async function founderSoldOut(): Promise<boolean> {
  return (await countFounderSeatsUsed()) >= FOUNDER_LIMIT
}

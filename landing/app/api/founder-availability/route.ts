// Public, unauthenticated: returns only an aggregate boolean + the fixed
// limit, never raw user rows or an exact remaining count — safe to expose
// to the pricing page for anyone, logged in or not.
import { NextResponse } from "next/server"

import { countFounderSeatsUsed, FOUNDER_LIMIT } from "@/lib/founder"

// Must stay dynamic — this reflects live purchase state and must never be
// baked in as a static result at build time.
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const used = await countFounderSeatsUsed()
    return NextResponse.json({ soldOut: used >= FOUNDER_LIMIT, limit: FOUNDER_LIMIT })
  } catch {
    // Fail OPEN on a transient DB error: showing the checkout CTA when we
    // couldn't verify availability is safer than falsely telling a real
    // buyer "sold out." A genuine sellout is enforced by the count query
    // itself succeeding, not by this catch path.
    return NextResponse.json({ soldOut: false, limit: FOUNDER_LIMIT })
  }
}

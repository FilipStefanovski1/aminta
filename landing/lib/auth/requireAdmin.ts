import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import type { User } from "@supabase/supabase-js"
import { getRequestUser } from "@/lib/auth/requestUser"
import { isAdminEmail } from "@/lib/auth/isAdmin"

// Shared guard for every /api/admin/* route. The page-level redirect in
// app/admin/page.tsx only protects page LOADS — a mutating API route is
// reachable directly regardless of what the page does, so every handler
// under /api/admin must re-check this itself.
export async function requireAdmin(request: NextRequest): Promise<User | NextResponse> {
  const user = await getRequestUser(request)
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 })
  }
  return user
}

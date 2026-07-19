import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { hasProAccess } from "@/lib/entitlements"

export default async function WelcomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("plan, subscription_status")
    .eq("id", user.id)
    .single()

  const plan = profile?.plan ?? "free"
  const entitled = hasProAccess(profile ?? {})

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111] px-4">
      <div className="w-full max-w-sm text-center space-y-6">

        <div className="flex flex-col items-center gap-3">
          <svg width="28" height="22" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
            <rect x="2" y="0" width="2" height="3" fill="#a78bfa" />
            <rect x="12" y="0" width="2" height="3" fill="#a78bfa" />
            <rect x="3" y="3" width="10" height="9" fill="#a78bfa" />
            <rect x="4" y="6" width="2" height="2" fill="#111" />
            <rect x="10" y="6" width="2" height="2" fill="#111" />
          </svg>
          <p className="font-pixel text-[10px] text-[#a78bfa] tracking-widest">Aminta</p>
        </div>

        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          {!entitled ? (
            <>
              <p className="text-white text-sm font-medium">You&apos;re signed in</p>
              <p className="text-[#555] text-xs leading-relaxed">
                Your account is active. Open the Aminta extension and log in to start syncing your progress.
              </p>
              <div className="bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3">
                <p className="text-[#444] text-xs mb-1">Signed in as</p>
                <p className="text-[#a78bfa] text-xs truncate">{user.email}</p>
              </div>
            </>
          ) : (
            <>
              <p className="text-white text-sm font-medium">Welcome to Aminta {plan === "lifetime" ? "Lifetime" : "Pro"}</p>
              <p className="text-[#555] text-xs leading-relaxed">
                Your account is active. Open the Aminta extension and log in to unlock all features.
              </p>
              <div className="bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3">
                <p className="text-[#444] text-xs mb-1">Signed in as</p>
                <p className="text-[#a78bfa] text-xs truncate">{user.email}</p>
              </div>
            </>
          )}
        </div>

        <a
          href="https://amintaapp.com"
          className="inline-block w-full py-3 rounded-xl text-xs font-semibold text-[#a78bfa] border border-[#2a2a2a] hover:border-[#a78bfa]/40 hover:bg-[#a78bfa]/5 transition-all duration-200"
        >
          Back to amintaapp.com
        </a>

        <p className="text-[#333] text-xs">
          You can close this tab and go back to the extension.
        </p>
      </div>
    </div>
  )
}

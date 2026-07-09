"use client"

// Shared chrome for /login, /signup and /reset-password.
// Keeps the auth pages visually identical: dark, pixel, minimal.

export function DemonIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 13 / 16)} viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
      <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
      <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
      <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
      <rect x="4" y="6" width="2" height="2" fill="#1f1f1f" />
      <rect x="10" y="6" width="2" height="2" fill="#1f1f1f" />
    </svg>
  )
}

function PixelFloat({ x, y, size, delay, color }: { x: string; y: string; size: number; delay: string; color: string }) {
  return (
    <div className="absolute animate-pixel-float opacity-30" style={{ left: x, top: y, animationDelay: delay }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ imageRendering: "pixelated" }}>
        <rect width={size} height={size} fill={color} />
      </svg>
    </div>
  )
}

export const CARD_STYLE: React.CSSProperties = {
  background: "rgba(36,36,36,0.85)",
  border: "1px solid #343438",
  boxShadow: "0 0 40px rgba(116,247,181,0.06), 0 20px 60px rgba(0,0,0,0.5)",
  backdropFilter: "blur(8px)",
}

export const INPUT_STYLE: React.CSSProperties = {
  background: "#1f1f1f",
  border: "1px solid #343438",
}

export function AuthShell({
  children,
  backHref = "/",
  onBack,
}: {
  children: React.ReactNode
  backHref?: string
  onBack?: () => void
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden">
      <PixelFloat x="8%"  y="12%" size={6} delay="0s"   color="#74f7b5" />
      <PixelFloat x="15%" y="70%" size={4} delay="1.2s" color="#74f7b5" />
      <PixelFloat x="80%" y="18%" size={8} delay="0.7s" color="#74f7b5" />
      <PixelFloat x="88%" y="65%" size={5} delay="2.1s" color="#74f7b5" />
      <PixelFloat x="72%" y="82%" size={4} delay="0.4s" color="#2f6b4f" />
      <PixelFloat x="25%" y="22%" size={5} delay="1.8s" color="#2f6b4f" />

      <div className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(116,247,181,0.07) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />

      <div className="relative z-10 w-full max-w-sm space-y-5">
        <a href={onBack ? "#" : backHref}
          onClick={onBack ? (e) => { e.preventDefault(); onBack() } : undefined}
          className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: "#aaa" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
          onMouseLeave={e => (e.currentTarget.style.color = "#aaa")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </a>

        <div className="flex justify-center">
          <div className="aminta-glow"><DemonIcon size={40} /></div>
        </div>

        {children}
      </div>
    </div>
  )
}

// Labelled input with inline validation error. Validation is app-level (not
// browser-level): callers validate and pass `error`.
export function Field({
  label,
  error,
  type = "text",
  value,
  onChange,
  onBlur,
  placeholder,
  autoComplete,
  optional,
}: {
  label: string
  error?: string
  type?: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  autoComplete?: string
  optional?: boolean
}) {
  return (
    <div>
      <label className="font-pixel text-[7px] text-[#555] mb-1.5 block tracking-widest">
        {label}
        {optional && <span className="ml-1.5 text-[#3a3a4a] normal-case">(optional)</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full px-3 py-2.5 rounded-lg text-sm placeholder-[#3a3a4a] text-white focus:outline-none transition-colors"
        style={{ ...INPUT_STYLE, borderColor: error ? "#f87171" : "#343438" }}
        onFocus={e => (e.currentTarget.style.borderColor = error ? "#f87171" : "#74f7b5")}
      />
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
    </div>
  )
}

export function SubmitButton({ children, loading, loadingText }: { children: React.ReactNode; loading: boolean; loadingText: string }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full py-3 rounded-lg font-pixel text-[9px] tracking-widest text-black transition-all disabled:opacity-50 hover:brightness-110 active:scale-[0.98]"
      style={{ background: "#74f7b5" }}>
      {loading ? loadingText : children}
    </button>
  )
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-[#343438]" />
      <span className="font-pixel text-[7px] text-[#3a3a4a]">or</span>
      <div className="flex-1 h-px bg-[#343438]" />
    </div>
  )
}

export function OAuthButtons({ onGoogle }: { onGoogle: () => void }) {
  return (
    <div className="space-y-2">
      <button onClick={onGoogle} type="button"
        className="rpg-btn-secondary w-full flex items-center justify-center gap-2 text-xs">
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>
    </div>
  )
}

const isDev = process.env.NODE_ENV !== "production"

// Shared ext_id plumbing: the extension opens auth pages with ?ext_id=…; we
// persist it so that after ANY auth method completes, the session is handed
// to the extension via /extension-auth. Do not break this.
export function persistExtId() {
  const extId = new URLSearchParams(window.location.search).get("ext_id")
  if (extId) {
    localStorage.setItem("aminta_ext_id", extId)
    if (isDev) console.log("[auth] login started from extension — ext_id:", extId)
  } else if (isDev) {
    console.log("[auth] normal web login — no ext_id")
  }
}

export function oauthCallbackUrl(): string {
  const base = `${location.origin}/auth/callback`
  const extId = localStorage.getItem("aminta_ext_id")
  return extId ? `${base}?ext_id=${encodeURIComponent(extId)}` : base
}

// Where to send a user who now has a live session in this browser.
export function postAuthDestination(): string {
  const extId = localStorage.getItem("aminta_ext_id")
  const dest = extId ? `/extension-auth?ext_id=${encodeURIComponent(extId)}` : "/dashboard"
  if (isDev) console.log("[auth] final redirect target:", dest)
  return dest
}

// Fire-and-forget: guarantee public.users + aminta_state exist for the
// signed-in user. Idempotent; never overwrites existing progress.
export async function ensureProfile(): Promise<void> {
  try {
    await fetch("/api/auth/ensure-profile", { method: "POST" })
  } catch { /* non-fatal — dashboard self-heals aminta_state too */ }
}

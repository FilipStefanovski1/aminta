import { useEffect, useRef, useState } from "react"

import "~style.css"

import ApiKeyForm from "~components/ApiKeyForm"
import DemonMascot from "~components/DemonMascot"
import GeneratorPanel from "~components/GeneratorPanel"
import HomeTab from "~components/HomeTab"
import LoginScreen from "~components/LoginScreen"
import SetupGate from "~components/SetupGate"
import VoiceProfileForm from "~components/VoiceProfileForm"
import { getForm, getStageTint } from "~lib/evolution"
import { C } from "~lib/theme"
import { getStore, setStore, type AmintaStore } from "~lib/storage"
import { getAuthSession, clearAuthSession, type AuthSession } from "~lib/auth"
import { pullFromCloud, pushToCloud } from "~lib/sync"
import type { Platform } from "~lib/prompts"
import { useCompanion } from "~hooks/useCompanion"

type Tab = "home" | "create" | "train"

function detectPlatform(url: string): Platform {
  if (url.includes("linkedin.com")) return "linkedin"
  if (url.includes("threads.net"))  return "threads"
  return "x"
}

// ─── Level-up modal ───────────────────────────────────────────────────────────

interface LevelUpData { level: number; stage: string }

// Pre-computed so particles are stable across re-renders
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  angle:  `${(i / 14) * 360}deg`,
  dist:   `${i % 2 === 0 ? 82 : 66}px`,
  size:   i % 3 === 0 ? 4 : 3,
  delay:  `${i * 0.028}s`,
  colorIdx: i % 5,
}))

function ParticleBurst({ tint }: { tint: string }) {
  const colors = [tint, "#74f7b5", "#fff", "#f5d060", "#3fe0c8"]
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: "inherit" }}>
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "38%",
            left: "50%",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: colors[p.colorIdx],
            animation: `particleFly 0.72s ease-out ${p.delay} both`,
            "--angle": p.angle,
            "--dist":  p.dist,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

const STAGE_DIALOGUE: Record<string, string> = {
  Curious:     "i'm starting to get you.",
  Happy:       "this feels good.",
  Excited:     "i want the next one.",
  Mischievous: "i've got tricks now.",
  Confident:   "i write like you on a good day.",
  Guardian:    "i've got your feed.",
  Mythic:      "few ever make it here.",
  Ascended:    "we've come a long way.",
}

function playLevelUpSound() {
  try {
    const ctx = new AudioContext()
    const freqs = [220, 330, 440, 660, 880]
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "square"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.09)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.18)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.09)
      osc.stop(ctx.currentTime + i * 0.09 + 0.2)
    })
  } catch { /* silent */ }
}

function LevelUpModal({ data, onDismiss }: { data: LevelUpData; onDismiss: () => void }) {
  const xp       = (data.level - 1) * 300
  const form     = getForm(xp)
  const tint     = form.color
  const dialogue = STAGE_DIALOGUE[data.stage] ?? "growing stronger."

  // Typewriter — starts 220ms after mount so the card-in animation finishes first
  const [typed, setTyped] = useState("")
  useEffect(() => {
    setTyped("")
    const delay = setTimeout(() => {
      let i = 0
      const iv = setInterval(() => {
        i++
        setTyped(dialogue.slice(0, i))
        if (i >= dialogue.length) clearInterval(iv)
      }, 38)
      return () => clearInterval(iv)
    }, 220)
    return () => clearTimeout(delay)
  }, [dialogue])

  useEffect(() => { playLevelUpSound() }, [])

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85">
      <div
        className="animate-card-in mx-4 bg-[#242424] border-2 rounded-2xl p-6 text-center space-y-4 w-full max-w-[260px]"
        style={{ borderColor: tint + "55", position: "relative", overflow: "hidden" }}>
        <ParticleBurst tint={tint} />
        <p className="font-pixel text-[8px] uppercase tracking-widest" style={{ color: tint }}>Level Up</p>
        <div className="mx-auto sprite-react aminta-glow flex justify-center">
          <DemonMascot skin={form.skin} size={64} />
        </div>
        <div>
          <p className="font-pixel text-2xl text-white">Lv.{data.level}</p>
          <p className="font-pixel text-[8px] mt-1" style={{ color: tint }}>{data.stage}</p>
          <p className="text-[11px] text-[#666] mt-2 italic" style={{ minHeight: "1.4em" }}>
            {typed ? `"${typed}"` : " "}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="btn-pixel w-full py-2.5 rounded-xl font-pixel text-[9px] text-black"
          style={{ backgroundColor: tint }}>
          Keep Going →
        </button>
      </div>
    </div>
  )
}

// ─── Settings overlay ─────────────────────────────────────────────────────────

function SettingsOverlay({
  store,
  onSave,
  onClose,
  onResetOnboarding,
  session,
  onSignOut,
}: {
  store: AmintaStore
  onSave: (patch: Partial<AmintaStore>) => Promise<void>
  onClose: () => void
  onResetOnboarding: () => void
  session: AuthSession | null
  onSignOut: () => void
}) {
  const plan = store.plan ?? "free"
  const planLabel = plan === "lifetime" ? "FOUNDER" : plan === "pro" ? "PRO" : "FREE"
  const planColor = plan === "lifetime" ? "#f5d060" : plan === "pro" ? "#74f7b5" : C.textGhost

  return (
    <div className="absolute inset-0 z-40 flex flex-col animate-slide-up" style={{ backgroundColor: C.bg }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <p className="font-pixel text-[9px]" style={{ color: C.text }}>Settings</p>
        <button onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: C.textFaint }}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── ACCOUNT ── */}
        <div className="px-4 pt-5 pb-4 space-y-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <p className="font-pixel text-[6px] uppercase tracking-widest" style={{ color: C.textGhost }}>Account</p>

          {session ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] truncate" style={{ color: C.text }}>{session.email}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="font-pixel text-[6px] px-1.5 py-0.5 rounded" style={{ backgroundColor: planColor + "22", color: planColor, border: `1px solid ${planColor}44` }}>
                      {planLabel}
                    </span>
                    {plan === "free" && (
                      <a href="https://amintaapp.com/#pricing" target="_blank" rel="noreferrer"
                        className="font-pixel text-[6px] underline" style={{ color: "#74f7b5" }}>
                        Upgrade →
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={onSignOut}
                  className="btn-pixel shrink-0 px-3 py-2 rounded-lg font-pixel text-[6px]"
                  style={{ backgroundColor: "#1a1a1a", color: "#f87171", borderColor: "#f87171" }}>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <p className="font-pixel text-[7px]" style={{ color: C.textFaint }}>Not signed in</p>
          )}
        </div>

        {/* ── AI PROVIDER ── */}
        <div className="px-4 pt-5 pb-4 space-y-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <p className="font-pixel text-[6px] uppercase tracking-widest" style={{ color: C.textGhost }}>AI Provider</p>
          <ApiKeyForm initial={store} onSave={onSave} />
        </div>

        {/* ── DANGER ZONE ── */}
        <div className="px-4 pt-5 pb-4 space-y-3">
          <p className="font-pixel text-[6px] uppercase tracking-widest" style={{ color: C.textGhost }}>App</p>
          <button
            onClick={() => { onClose(); onResetOnboarding() }}
            className="btn-pixel px-4 py-2 rounded-lg font-pixel text-[6px]"
            style={{ backgroundColor: "#1a1a1a", color: C.textFaint, borderColor: "#333" }}>
            ↺ Restart setup
          </button>
        </div>

      </div>

      {/* Footer */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderTop: `1px solid ${C.border}` }}>
        <p className="font-pixel text-[6px]" style={{ color: C.textGhost }}>v0.1</p>
        <div className="flex items-center gap-4">
          {[
            { label: "X",        href: "https://x.com/amintaapp" },
            { label: "LinkedIn", href: "https://www.linkedin.com/company/amintaapp/" },
            { label: "Help",     href: "https://amintaapp.com" },
          ].map(({ label, href }) => (
            <a key={href} href={href} target="_blank" rel="noreferrer"
              className="font-pixel text-[6px] hover:text-white transition-colors" style={{ color: C.textGhost }}>{label}</a>
          ))}
        </div>
      </div>

    </div>
  )
}

// ─── Bottom navigation ────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Tab; label: string; icon: () => React.ReactNode }[] = [
  {
    id: "home",
    label: "Home",
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 9L9 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 7.5V15h3v-4h2v4h3V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "create",
    label: "Create",
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 3.5L10.5 7l3.5.3-2.6 2.3.8 3.4L9 11.2l-3.2 1.8.8-3.4L4 7.3l3.5-.3L9 3.5z"
          stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        <path d="M9 1v1.2M9 15.8V17M1 9h1.2M15.8 9H17M3.05 3.05l.85.85M14.1 14.1l.85.85M3.05 14.95l.85-.85M14.1 3.9l.85-.85"
          stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "train",
    label: "Train",
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2C6.24 2 4 4.24 4 7c0 1.86 1.01 3.49 2.5 4.37V13h5v-1.63C13 10.49 14 8.86 14 7c0-2.76-2.24-5-5-5z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M6.5 13h5M7.5 15.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
]

function BottomNav({ active, onChange, tint }: { active: Tab; onChange: (t: Tab) => void; tint: string }) {
  return (
    <nav className="shrink-0 flex border-t border-[#343438] bg-[#1f1f1f]">
      {NAV_ITEMS.map(({ id, label, icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors"
            style={{ color: isActive ? tint : "#3a3a4a" }}>
            {icon()}
            <span className="font-pixel text-[8px] uppercase tracking-widest">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SPLASH_SKIN = { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" }

function SidePanel() {
  const [store, setLocalStore]          = useState<AmintaStore | null>(null)
  const [tab, setTab]                   = useState<Tab>("home")
  const [tabKey, setTabKey]             = useState(0)
  const [levelUpData, setLevelUpData]       = useState<LevelUpData | null>(null)
  const [newlyUnlockedLevel, setNewlyUnlockedLevel] = useState<number | null>(null)
  const newlyUnlockedTimer = useRef<ReturnType<typeof setTimeout>>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>("x")
  const [authChecked, setAuthChecked]   = useState(false)
  const [isLoggedIn, setIsLoggedIn]     = useState(false)
  const [session, setSession]           = useState<AuthSession | null>(null)

  const refresh = async () => setLocalStore(await getStore())

  const { speech, animClass, animKey, dispatch } = useCompanion(store)

  // Check auth + pull from cloud on startup
  useEffect(() => {
    getAuthSession().then(async (s) => {
      if (s) {
        setIsLoggedIn(true)
        setSession(s)
        await pullFromCloud()
      }
      setAuthChecked(true)
    })
  }, [])

  // Watch storage so the panel reacts immediately when OAuth completes,
  // even if the Google auth popup disrupted the sidepanel's callback flow.
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.auth_access_token?.newValue) {
        getAuthSession().then(async (s) => {
          if (!s) return
          setSession(s)
          setIsLoggedIn(true)
          setAuthChecked(true)
          await pullFromCloud()
          await refresh()
        })
      }
      if ("auth_access_token" in changes && !changes.auth_access_token.newValue) {
        setSession(null)
        setIsLoggedIn(false)
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  const handleSignOut = async () => {
    await clearAuthSession()
    setSession(null)
    setIsLoggedIn(false)
    setSettingsOpen(false)
  }

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? ""
      setDetectedPlatform(detectPlatform(url))
    })
    const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.url) setDetectedPlatform(detectPlatform(info.url))
    }
    chrome.tabs.onUpdated.addListener(listener)
    return () => chrome.tabs.onUpdated.removeListener(listener)
  }, [])

  useEffect(() => { refresh() }, [])
  useEffect(() => () => clearTimeout(newlyUnlockedTimer.current), [])

  const update = async (patch: Partial<AmintaStore>) => {
    await setStore(patch)
    await refresh()
  }

  const switchTab = (next: Tab) => {
    setTab(next)
    setTabKey(k => k + 1)
    if (next === "home") {
      refresh()
      dispatch("open")
    }
  }

  if (!authChecked || !store) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#1f1f1f]">
        <div className="sprite-jump" style={{ filter: "drop-shadow(0 0 12px #74f7b566)" }}>
          <DemonMascot skin={SPLASH_SKIN} size={64} />
        </div>
        <p className="font-pixel text-[7px] text-[#74f7b5]/40 tracking-widest">AMINTA</p>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen onSignedIn={async () => {
        await pullFromCloud()
        setIsLoggedIn(true)
        await refresh()
      }} />
    )
  }

  const tint = getStageTint(store.xp ?? 0)

  return (
    <SetupGate store={store} onSave={update}>
      <div className="absolute inset-0 flex flex-col bg-[#1f1f1f] overflow-hidden">

        {/* ── Modals / overlays ── */}
        {levelUpData && (
          <LevelUpModal data={levelUpData} onDismiss={() => {
            const level = levelUpData.level
            setLevelUpData(null)
            refresh()
            clearTimeout(newlyUnlockedTimer.current)
            setNewlyUnlockedLevel(level)
            newlyUnlockedTimer.current = setTimeout(() => setNewlyUnlockedLevel(null), 8_000)
          }} />
        )}
        {settingsOpen && (
          <SettingsOverlay
            store={store}
            onSave={update}
            onClose={() => setSettingsOpen(false)}
            onResetOnboarding={async () => { await update({ onboardingDone: false }) }}
            session={session}
            onSignOut={handleSignOut}
          />
        )}

        {/* ── Header ── */}
        <header className="shrink-0 flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="13" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
              <rect x="2" y="0" width="2" height="3" fill={tint} />
              <rect x="12" y="0" width="2" height="3" fill={tint} />
              <rect x="3" y="3" width="10" height="9" fill={tint} />
              <rect x="4" y="6" width="2" height="2" fill="#1f1f1f" />
              <rect x="10" y="6" width="2" height="2" fill="#1f1f1f" />
            </svg>
            <span className="font-pixel text-[8px]" style={{ color: tint }}>Aminta</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-7 h-7 flex items-center justify-center text-[#444] hover:text-[#888] transition-colors rounded-lg hover:bg-white/5"
            title="Settings">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5.8 1.5 5.5 3.05c-.35.13-.67.3-.96.51L3.1 3.05 1.7 5.45l1.08.88C2.74 6.55 2.72 6.77 2.72 7s.02.45.06.67L1.7 8.55l1.4 2.4 1.44-.51c.29.21.61.38.96.51l.3 1.55h2.4l.3-1.55c.35-.13.67-.3.96-.51l1.44.51 1.4-2.4-1.08-.88c.04-.22.06-.44.06-.67s-.02-.45-.06-.67l1.08-.88-1.4-2.4-1.44.51c-.29-.21-.61-.38-.96-.51L8.2 1.5H5.8z"
                stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <circle cx="7" cy="7" r="1.7" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </header>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div key={tabKey} className="px-4 py-3 animate-slide-up">

            {tab === "home" && (
              <HomeTab
                store={store}
                onCreate={() => switchTab("create")}
                onTrain={() => switchTab("train")}
                onUpdate={refresh}
                animClass={animClass}
                animKey={animKey}
                speech={speech}
                onContext={dispatch}
                newlyUnlockedLevel={newlyUnlockedLevel}
              />
            )}

            {tab === "create" && (
              <GeneratorPanel
                store={store}
                initialPlatform={detectedPlatform}
                onXPAwarded={async () => { await refresh(); pushToCloud(); dispatch("insert") }}
                onLevelUp={(level, stage) => { setLevelUpData({ level, stage }); dispatch("level_up") }}
                onTeach={() => switchTab("train")}
                onOpenSettings={() => setSettingsOpen(true)}
                onContext={dispatch}
              />
            )}

            {tab === "train" && (
              <VoiceProfileForm
                store={store}
                initial={store.voice}
                onSave={(voice) => update({ voice })}
                dnaCount={store.tweetDNA?.length ?? 0}
              />
            )}

          </div>
        </main>

        {/* ── Bottom nav ── */}
        <BottomNav active={tab} onChange={switchTab} tint={tint} />

      </div>
    </SetupGate>
  )
}

export default SidePanel

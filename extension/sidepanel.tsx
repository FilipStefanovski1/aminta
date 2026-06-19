import { useEffect, useState } from "react"
import lvl1Src from "data-base64:~/assets/lvl1-aminta.png"
import lvl2Src from "data-base64:~/assets/lvl2-aminta.png"
import lvl3Src from "data-base64:~/assets/lvl3-aminta.png"

import "~style.css"

import ApiKeyForm from "~components/ApiKeyForm"
import EvolutionsTab from "~components/EvolutionsTab"
import GeneratorPanel from "~components/GeneratorPanel"
import HomeTab from "~components/HomeTab"
import SetupGate from "~components/SetupGate"
import VoiceProfileForm from "~components/VoiceProfileForm"
import { getStageTint } from "~lib/evolution"
import { C } from "~lib/theme"
import { getStore, setStore, type AmintaStore } from "~lib/storage"
import type { Platform } from "~lib/prompts"

type Tab = "home" | "write" | "train" | "evolutions"

function detectPlatform(url: string): Platform {
  if (url.includes("linkedin.com")) return "linkedin"
  if (url.includes("threads.net"))  return "threads"
  return "x"
}

// ─── Level-up modal ───────────────────────────────────────────────────────────

interface LevelUpData { level: number; stage: string }

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
  const tint    = getStageTint((data.level - 1) * 300)
  const imgSrc  = data.level === 1 ? lvl1Src : data.level === 2 ? lvl2Src : data.level === 3 ? lvl3Src : null
  const dialogue = STAGE_DIALOGUE[data.stage] ?? "growing stronger."
  useEffect(() => { playLevelUpSound() }, [])
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85">
      <div
        className="animate-card-in mx-4 bg-[#111318] border-2 rounded-2xl p-6 text-center space-y-4 w-full max-w-[260px]"
        style={{ borderColor: tint + "55" }}>
        <p className="font-pixel text-[8px] uppercase tracking-widest" style={{ color: tint }}>Level Up</p>
        <div className="mx-auto sprite-react aminta-glow" style={{ width: 56, height: 56, display: "inline-block" }}>
          {imgSrc ? (
            <img src={imgSrc} alt={`Aminta Lv.${data.level}`}
              style={{ imageRendering: "pixelated", objectFit: "contain", display: "block", width: "100%", height: "100%" }} />
          ) : (
            <svg width="56" height="46" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
              <rect x="2" y="0" width="2" height="3" fill={tint} />
              <rect x="12" y="0" width="2" height="3" fill={tint} />
              <rect x="3" y="3" width="10" height="9" fill={tint} />
              <rect x="4" y="6" width="2" height="2" fill="#0d0d0f" />
              <rect x="10" y="6" width="2" height="2" fill="#0d0d0f" />
            </svg>
          )}
        </div>
        <div>
          <p className="font-pixel text-2xl text-white">Lv.{data.level}</p>
          <p className="font-pixel text-[8px] mt-1" style={{ color: tint }}>{data.stage}</p>
          <p className="text-[11px] text-[#666] mt-2 italic">"{dialogue}"</p>
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
}: {
  store: AmintaStore
  onSave: (patch: Partial<AmintaStore>) => Promise<void>
  onClose: () => void
  onResetOnboarding: () => void
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col animate-slide-up" style={{ backgroundColor: C.bg }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <p className="font-pixel text-[9px]" style={{ color: C.text }}>Settings</p>
        <button onClick={onClose}
          className="w-7 h-7 flex items-center justify-center transition-colors rounded-lg hover:bg-white/5"
          style={{ color: C.textFaint }}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <ApiKeyForm initial={store} onSave={onSave} />

        <div className="space-y-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={() => { onClose(); onResetOnboarding() }}
            className="w-full text-left px-3 py-2.5 rounded-xl font-pixel text-[7px] transition-colors"
            style={{ border: `1px solid ${C.border}`, color: C.textFaint }}>
            ↺ Restart setup
          </button>

          <div className="flex items-center justify-center gap-5 pt-1">
            {[
              { label: "X",        href: "https://x.com/amintaapp" },
              { label: "LinkedIn", href: "https://www.linkedin.com/company/amintaapp/" },
              { label: "Help",     href: "https://amintaapp.com" },
            ].map(({ label, href }) => (
              <a key={href} href={href} target="_blank" rel="noreferrer"
                className="font-pixel text-[7px] transition-colors" style={{ color: C.textGhost }}>{label}</a>
            ))}
          </div>
          <p className="text-[9px] text-center" style={{ color: C.textGhost }}>Aminta · v0.1</p>
        </div>
      </div>
    </div>
  )
}

// ─── Bottom navigation ────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Tab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    id: "home",
    label: "Home",
    icon: (active) => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 9L9 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 7.5V15h3v-4h2v4h3V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "write",
    label: "Write",
    icon: (active) => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M13 2l3 3-9 9H4v-3L13 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M11 4l3 3" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: "train",
    label: "Teach",
    icon: (active) => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2C6.24 2 4 4.24 4 7c0 1.86 1.01 3.49 2.5 4.37V13h5v-1.63C13 10.49 14 8.86 14 7c0-2.76-2.24-5-5-5z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M6.5 13h5M7.5 15.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "evolutions",
    label: "Evolve",
    icon: (active) => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2l1.8 3.6L15 6.6l-3 2.92.7 4.08L9 11.4l-3.7 2.2.7-4.08L3 6.6l4.2-.99L9 2z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

function BottomNav({ active, onChange, tint }: { active: Tab; onChange: (t: Tab) => void; tint: string }) {
  return (
    <nav className="shrink-0 flex border-t border-[#1e2028] bg-[#0d0d0f]">
      {NAV_ITEMS.map(({ id, label, icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors"
            style={{ color: isActive ? tint : "#3a3a4a" }}>
            {icon(isActive)}
            <span className="font-pixel text-[5px] uppercase tracking-widest">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function SidePanel() {
  const [store, setLocalStore]        = useState<AmintaStore | null>(null)
  const [tab, setTab]                 = useState<Tab>("home")
  const [tabKey, setTabKey]           = useState(0)
  const [levelUpData, setLevelUpData] = useState<LevelUpData | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>("x")

  const refresh = async () => setLocalStore(await getStore())

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

  const update = async (patch: Partial<AmintaStore>) => {
    await setStore(patch)
    await refresh()
  }

  const switchTab = (next: Tab) => {
    setTab(next)
    setTabKey(k => k + 1)
    if (next === "home") refresh()
  }

  if (!store) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0f]">
        <p className="font-pixel text-[8px] text-[#333]">loading...</p>
      </div>
    )
  }

  const tint = getStageTint(store.xp ?? 0)

  return (
    <SetupGate store={store} onSave={update}>
      <div className="absolute inset-0 flex flex-col bg-[#0d0d0f] overflow-hidden">

        {/* ── Modals / overlays ── */}
        {levelUpData && (
          <LevelUpModal data={levelUpData} onDismiss={() => { setLevelUpData(null); refresh() }} />
        )}
        {settingsOpen && (
          <SettingsOverlay
            store={store}
            onSave={update}
            onClose={() => setSettingsOpen(false)}
            onResetOnboarding={async () => { await update({ onboardingDone: false }) }}
          />
        )}

        {/* ── Header ── */}
        <header className="shrink-0 flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="13" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
              <rect x="2" y="0" width="2" height="3" fill={tint} />
              <rect x="12" y="0" width="2" height="3" fill={tint} />
              <rect x="3" y="3" width="10" height="9" fill={tint} />
              <rect x="4" y="6" width="2" height="2" fill="#0d0d0f" />
              <rect x="10" y="6" width="2" height="2" fill="#0d0d0f" />
            </svg>
            <span className="font-pixel text-[8px]" style={{ color: tint }}>Aminta</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-7 h-7 flex items-center justify-center text-[#444] hover:text-[#888] transition-colors rounded-lg hover:bg-white/5"
            title="Settings">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div key={tabKey} className="px-4 py-3 animate-slide-up">

            {tab === "home" && (
              <HomeTab
                store={store}
                onWrite={() => switchTab("write")}
                onTeach={() => switchTab("train")}
                onEvolve={() => switchTab("evolutions")}
                onUpdate={refresh}
              />
            )}

            {tab === "write" && (
              <GeneratorPanel
                store={store}
                initialPlatform={detectedPlatform}
                onXPAwarded={refresh}
                onLevelUp={(level, stage) => setLevelUpData({ level, stage })}
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

            {tab === "evolutions" && (
              <EvolutionsTab store={store} />
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

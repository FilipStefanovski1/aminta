import { C } from "~lib/theme"

interface Props {
  onSignedIn: () => void
}

export default function LoginScreen({ onSignedIn }: Props) {
  function openLogin() {
    const extId = chrome.runtime.id
    chrome.tabs.create({
      url: `https://amintaapp.com/login?source=extension&ext_id=${extId}`,
    })
  }

  // Listen for auth success message from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "AMINTA_AUTH_SUCCESS") {
      onSignedIn()
    }
  })

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6"
      style={{ backgroundColor: C.bg }}
    >
      {/* Pixel demon */}
      <svg width="32" height="26" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
        <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
        <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
        <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
        <rect x="4" y="6" width="2" height="2" fill={C.bg} />
        <rect x="10" y="6" width="2" height="2" fill={C.bg} />
      </svg>

      <div className="text-center space-y-1.5">
        <p className="font-pixel text-[9px] tracking-widest" style={{ color: "#74f7b5" }}>
          Sign in to sync
        </p>
        <p className="text-xs" style={{ color: C.textFaint }}>
          Keep your XP &amp; streak safe across devices
        </p>
      </div>

      <button
        onClick={openLogin}
        className="w-full py-3 rounded-xl font-pixel text-[8px] tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98]"
        style={{ backgroundColor: "#74f7b5" }}
      >
        Sign in
      </button>

      <button
        onClick={onSignedIn}
        className="font-pixel text-[7px] tracking-widest transition-colors"
        style={{ color: C.textGhost }}
      >
        Skip for now
      </button>
    </div>
  )
}

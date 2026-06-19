import DemonMascot from "./DemonMascot";
import HeaderAminta from "./HeaderAminta";

// Mint, near-monochrome demon used only as a small supporting detail.
const PANEL_DEMON = { body: "#74f7b5", horn: "#2f6b4f", eye: "#1f1f1f" };

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 md:pt-36 md:pb-28">

      <div className="relative z-10 mx-auto max-w-7xl px-5 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        {/* Left: copy */}
        <div>
          <h1 className="font-pixel text-3xl sm:text-4xl lg:text-[3.4rem] leading-[1.2] text-white break-words">
            Feed Aminta.
            <br />
            <span className="text-accent">Grow your socials.</span>
          </h1>

          <p className="mt-7 max-w-md text-base sm:text-lg text-muted leading-relaxed">
            Most tools help you write. Aminta makes posting addictive. Every tweet feeds your demon,
            every reply gives XP, and every day keeps the streak alive.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row gap-4">
            <a href="#pricing" className="rpg-btn-primary">
              Get Aminta
            </a>
            <a href="#how" className="rpg-btn-secondary">
              See how it works
            </a>
          </div>

          {/* Compatible with */}
          <div className="mt-8">
            <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-muted">
              Compatible with
            </p>
            <div className="mt-3 flex items-start gap-3">
              {/* X — available now, emphasized */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="grid place-items-center w-11 h-11 rounded-lg bg-accent text-black shadow-[0_0_18px_rgba(116,247,181,0.3)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.9 2H22l-7.5 8.6L23 22h-6.9l-5.4-7-6.2 7H1.4l8-9.2L1 2h7l4.9 6.5L18.9 2Zm-2.4 18h1.9L7.6 4H5.6l10.9 16Z" />
                  </svg>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-medium text-accent">
                  ✓ now
                </span>
              </div>

              {/* LinkedIn — coming soon */}
              <div className="flex flex-col items-center gap-1.5 opacity-50">
                <div className="grid place-items-center w-11 h-11 rounded-lg bg-accent/10 border border-accent/30 text-accent">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
                  </svg>
                </div>
                <span className="text-[10px] text-muted">soon</span>
              </div>

              {/* Reddit — coming soon */}
              <div className="flex flex-col items-center gap-1.5 opacity-50">
                <div className="grid place-items-center w-11 h-11 rounded-lg bg-accent/10 border border-accent/30 text-accent">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.74c.69 0 1.25.56 1.25 1.25a1.25 1.25 0 0 1-2.5.06l-2.6-.55-.8 3.75c1.83.07 3.48.63 4.68 1.49.3-.31.73-.49 1.2-.49.97 0 1.76.79 1.76 1.76 0 .72-.43 1.33-1.01 1.61a3.1 3.1 0 0 1 .04.52c0 2.69-3.13 4.87-7 4.87-3.88 0-7-2.18-7-4.87 0-.18.01-.36.04-.53A1.75 1.75 0 0 1 4.03 12c0-.97.79-1.76 1.76-1.76.46 0 .9.2 1.2.49 1.2-.86 2.88-1.43 4.74-1.49l.9-4.18a.35.35 0 0 1 .14-.2.35.35 0 0 1 .24-.04l2.9.62a1.21 1.21 0 0 1 1.1-.7zM9.25 12a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm5.5 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm-5.47 3.99a.33.33 0 0 0-.23.56c.84.84 2.48.91 2.96.91.48 0 2.11-.06 2.96-.91a.33.33 0 1 0-.46-.47c-.55.54-1.69.73-2.51.73-.83 0-1.98-.2-2.51-.73a.33.33 0 0 0-.23-.1z" />
                  </svg>
                </div>
                <span className="text-[10px] text-muted">soon</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: product mockup + small demon card */}
        <div className="relative lg:-mr-10">
          {/* small demon side-panel card (supporting detail) */}
          <div className="hidden sm:block absolute -top-6 -right-2 z-20 w-44 rounded-xl border border-accent/40 bg-panel p-3 shadow-xl">
            <div className="flex items-center justify-between text-[10px] text-muted">
              <span className="text-accent">Lv.4 Awakened</span>
              <span>NRG 67%</span>
            </div>
            <div className="my-2 flex justify-center">
              <div className="aminta-float aminta-glow">
                <DemonMascot skin={PANEL_DEMON} size={56} />
              </div>
            </div>
            <div className="flex justify-between text-[9px] text-muted mb-1">
              <span>EXP</span>
              <span>400 / 800</span>
            </div>
            <div className="h-1.5 rounded-full bg-panel2 overflow-hidden">
              <div className="h-full bg-accent rounded-full" style={{ width: "58%" }} />
            </div>
            <p className="mt-2 text-center text-[9px] text-muted">POST +50 · REPLY +25</p>
          </div>

          {/* HeaderAminta — animated SVG companion, bottom-left corner of browser mockup */}
          <div className="hidden lg:block absolute -bottom-4 -left-4 z-20">
            <HeaderAminta />
          </div>

          {/* browser mockup */}
          <div className="rounded-2xl border border-line bg-panel/90 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] overflow-hidden">
            <div className="flex items-center gap-3 px-4 h-10 border-b border-line bg-panel2/60">
              <div className="flex gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]" />
              </div>
              <div className="mx-auto flex items-center gap-2 rounded-md bg-ink/70 px-3 py-1 text-[11px] text-muted">
                <span className="text-accent/70">▪</span> x.com/home
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
              {/* X feed */}
              <div className="hidden sm:block p-4 border-r border-line">
                <div className="flex gap-6 text-xs border-b border-line pb-2.5 mb-4">
                  <span className="text-white font-medium border-b-2 border-white pb-2.5 -mb-2.5">
                    For you
                  </span>
                  <span className="text-muted">Following</span>
                </div>
                <div className="flex gap-2.5 pb-4 mb-4 border-b border-line/70">
                  <div className="w-8 h-8 rounded-full bg-panel2 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-white font-medium">building in public</span>
                      <span className="text-[10px] text-muted">@indiehacker · 2h</span>
                    </div>
                    <p className="mt-1 text-xs text-white/75 leading-relaxed">
                      the hardest part of growing on X isn&apos;t the writing. It&apos;s showing up
                      every day.
                    </p>
                  </div>
                </div>
                {[0, 1].map((i) => (
                  <div key={i} className="flex gap-2.5 py-3 border-b border-line/50">
                    <div className="w-8 h-8 rounded-full bg-panel2 shrink-0" />
                    <div className="flex-1 space-y-1.5 pt-1">
                      <div className="h-2 w-20 rounded bg-panel2" />
                      <div className="h-1.5 w-full rounded bg-panel2/70" />
                      <div className="h-1.5 w-3/4 rounded bg-panel2/70" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Aminta panel */}
              <div className="p-3 bg-panel">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-pixel text-[11px] text-white">Aminta</span>
                  <span className="text-muted text-xs">⚙</span>
                </div>
                <div className="flex gap-1 rounded-md bg-ink p-1 mb-2.5 text-[10px]">
                  <span className="flex-1 text-center rounded bg-accent text-black font-semibold py-1">
                    Tweet
                  </span>
                  <span className="flex-1 text-center text-muted py-1">Reply</span>
                  <span className="flex-1 text-center text-muted py-1">Polish</span>
                </div>
                <div className="rounded-md border border-line bg-ink p-2 text-[11px] text-white/75 min-h-[38px]">
                  showing up daily on X
                </div>
                <div className="mt-2.5 rounded-md bg-accent text-black text-[11px] font-semibold text-center py-1.5">
                  Generate
                </div>
                <div className="mt-2.5 rounded-md border border-line bg-ink p-2">
                  <p className="text-[11px] text-white/85 leading-relaxed">
                    consistency &gt; talent on this app. the people winning just never miss a day.
                  </p>
                  <div className="mt-2 rounded bg-accent/15 text-accent text-[10px] font-medium text-center py-1">
                    Insert into X · +50 XP
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import Reveal from "./Reveal";

export default function ProductDemo() {
  return (
    <section className="relative py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">The side panel</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Lives right next to your timeline
          </h2>
          <p className="mt-4 text-muted">
            No new tab. No copy-paste. Aminta docks into X as a side panel — generate, polish,
            and drop straight into the composer.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-12">
          <div className="relative mx-auto max-w-5xl rounded-2xl border border-line bg-panel/60 p-3 sm:p-4 shadow-2xl">
            <div className="absolute -inset-0.5 -z-10 rounded-2xl bg-accent/15 blur-2xl" />
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)] gap-3">
              {/* X timeline mock */}
              <div className="rounded-xl border border-line bg-ink/80 p-4 hidden md:block">
                <div className="flex items-center gap-2 text-xs text-muted mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3a3a3a]" />
                  <span className="ml-2">x.com / home</span>
                </div>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3 py-3 border-b border-line/60">
                    <div className="w-9 h-9 rounded-full bg-panel2 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2.5 w-28 rounded bg-panel2" />
                      <div className="h-2 w-full rounded bg-panel2/70" />
                      <div className="h-2 w-4/5 rounded bg-panel2/70" />
                      <div className="flex gap-6 pt-1 text-muted/50 text-xs">
                        <span>♡</span>
                        <span>↻</span>
                        <span>↗</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Aminta side panel mock */}
              <div className="rounded-xl border border-accent/30 bg-panel p-4 shadow-[0_0_40px_rgba(116,247,181,0.08)]">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-pixel text-sm text-accent">Aminta</span>
                  <span className="text-muted text-xs">⚙</span>
                </div>
                <div className="flex gap-4 text-xs border-b border-line pb-2 mb-3">
                  <span className="text-accent border-b-2 border-accent pb-2 -mb-2 font-medium">Write</span>
                  <span className="text-muted">Voice</span>
                  <span className="text-muted">Settings</span>
                </div>

                <div className="flex gap-1 rounded-lg bg-ink p-1 mb-3 text-xs">
                  <span className="flex-1 text-center rounded bg-accent text-black font-semibold py-1.5">
                    Tweet
                  </span>
                  <span className="flex-1 text-center text-muted py-1.5">Reply</span>
                  <span className="flex-1 text-center text-muted py-1.5">Polish</span>
                </div>

                <div className="rounded-lg border border-line bg-ink p-3 text-sm text-white/90 min-h-[64px]">
                  shipping Aminta this weekend
                </div>

                <div className="mt-3 rounded-lg bg-accent text-black text-sm font-semibold text-center py-2.5">
                  Generate
                </div>

                <div className="mt-3 rounded-lg border border-line bg-ink p-3">
                  <p className="text-sm text-white/90 leading-relaxed">
                    building in public hits different when your demon eats every commit. shipping
                    Aminta tonight. 🔥
                  </p>
                  <div className="mt-3 flex gap-2">
                    <span className="flex-1 text-center text-xs rounded-md border border-line py-1.5 text-muted">
                      Copy
                    </span>
                    <span className="flex-1 text-center text-xs rounded-md bg-accent text-black font-semibold py-1.5">
                      Insert into X
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] font-pixel text-accent">+50 XP</span>
                    <span className="text-[11px] text-muted">demon fed ✓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function Hero() {
  return (
    <section id="top" className="relative overflow-x-hidden pt-32 pb-32 md:pt-40 md:pb-40">

      <div className="relative z-10 mx-auto max-w-7xl px-5 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        {/* Left: copy */}
        <div>
          <h1 className="font-pixel text-3xl sm:text-4xl lg:text-[3.4rem] leading-[1.2] text-white break-words">
            Feed Aminta.
            <br />
            <span className="text-accent">Grow on X</span>
            <span className="block mt-1 text-[0.22em] font-pixel text-white/30 tracking-wide">(for now)</span>
          </h1>

          <div className="mt-9 flex flex-col sm:flex-row gap-4">
            <a href="#pricing" className="rpg-btn-primary">
              Get Aminta
            </a>
            <a href="#how-it-works" className="rpg-btn-secondary">
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

        {/* Right: product screenshots — layered on desktop, single image on mobile */}
        <div className="relative">
          {/* Mobile: just the composite */}
          <img
            src="/composite.png"
            alt="Aminta extension panel"
            className="lg:hidden w-full max-w-sm md:max-w-md mx-auto h-auto rounded-2xl"
          />

          {/* Desktop: layered layout */}
          <div className="hidden lg:block relative h-[600px] overflow-visible">
            {/* X tab — back layer, demon anchored to its bottom-left */}
            <div className="absolute left-0 top-8 w-[72%] z-10">
              <div className="relative rounded-xl overflow-hidden border border-accent/20 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)]">
                <img
                  src="/youhaveanidea%20(1).png"
                  alt="X timeline"
                  className="w-full h-auto block"
                  style={{ maxHeight: 380, objectFit: "cover", objectPosition: "top" }}
                />
              </div>
            </div>

            {/* Extension — front layer, tilted */}
            <img
              src="/composite.png"
              alt="Aminta extension panel"
              className="absolute right-0 top-0 z-20 w-[46%] h-auto rounded-2xl border border-accent/30 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)]"
              style={{ transform: "perspective(800px) rotateY(-12deg) rotateX(2deg)" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

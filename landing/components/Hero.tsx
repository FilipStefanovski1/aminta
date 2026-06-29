export default function Hero() {
  return (
    <section id="top" className="relative overflow-clip pt-32 pb-32 md:pt-40 md:pb-40">

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

        </div>

        {/* Right: layered product screenshots — same composition at every breakpoint */}
        <div className="relative w-full" style={{ aspectRatio: "15 / 16", overflowX: "clip" }}>
          {/* X compose — back layer */}
          <div className="absolute left-[3%] top-[5%] w-[69%] z-10" style={{ height: "60%" }}>
            <div className="h-full rounded-xl overflow-hidden border border-accent/20 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)]">
              <img
                src="/youhaveanidea%20(1).png"
                alt="X timeline"
                className="w-full h-full object-cover object-left-top"
              />
            </div>
          </div>

          {/* Extension panel — front layer, tilted */}
          <img
            src="/composite.png"
            alt="Aminta extension panel"
            className="absolute right-[1%] top-0 z-20 w-[46%] h-auto rounded-2xl border border-accent/30 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)]"
            style={{ transform: "perspective(800px) rotateY(-12deg) rotateX(2deg)" }}
          />
        </div>
      </div>
    </section>
  );
}

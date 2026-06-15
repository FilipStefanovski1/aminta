import Reveal from "./Reveal";

const STEPS = [
  {
    n: "01",
    title: "Set your voice",
    desc: "Drop your niche, tone, and a few of your best tweets. Takes 60 seconds — done forever.",
    accent: "text-accent",
    border: "border-line",
  },
  {
    n: "02",
    title: "Generate inside X",
    desc: "Open the side panel. Tweet, reply, or polish in your voice and insert with one click.",
    accent: "text-accent",
    border: "border-line",
  },
  {
    n: "03",
    title: "Feed Aminta",
    desc: "Every post stacks XP and levels up your demon. Keep your streak alive and watch it evolve.",
    accent: "text-accent",
    border: "border-line",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">The loop</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            How It Works
          </h2>
          <p className="mt-4 text-muted">Three steps. Then you just keep feeding it.</p>
        </Reveal>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div className={`relative h-full rounded-2xl border ${s.border} bg-panel p-7 overflow-hidden`}>
                <span className="font-pixel text-5xl text-white/5 absolute top-4 right-5 select-none">
                  {s.n}
                </span>
                <span className={`font-pixel text-sm ${s.accent}`}>{s.n}</span>
                <h3 className="mt-4 font-pixel text-base text-white">{s.title}</h3>
                <p className="mt-3 text-sm text-muted leading-relaxed">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

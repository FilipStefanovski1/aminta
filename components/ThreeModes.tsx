import Reveal from "./Reveal";

interface Mode {
  tag: string;
  xp: string;
  input: string;
  output: string;
}

const MODES: Mode[] = [
  {
    tag: "Tweet",
    xp: "+50 XP",
    input: "topic — shipping at 2am",
    output:
      "2am commits hit different. shipped the thing nobody asked for and somehow i feel unstoppable. who needs sleep.",
  },
  {
    tag: "Reply",
    xp: "+25 XP",
    input: 'replying to — "how do you stay consistent?"',
    output:
      "i don't run on motivation. i run on a streak i refuse to break. that's the whole trick, honestly.",
  },
  {
    tag: "Polish",
    xp: "+15 XP",
    input: "draft — just launched my thing go check it out pls",
    output:
      "just shipped something i'm genuinely proud of. would mean a lot if you took a look 👇",
  },
];

export default function ThreeModes() {
  return (
    <section className="acc-cyan relative py-20 md:py-28 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="relative mx-auto max-w-7xl px-5">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">Inside X</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Tweet. Reply. Polish.
          </h2>
          <p className="mt-4 text-muted">
            Three one-click modes — in your voice, dropped straight into the composer.
          </p>
        </Reveal>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {MODES.map((m, i) => (
            <Reveal key={m.tag} delay={i * 80}>
              <div className="h-full rounded-2xl border border-line bg-panel p-5 hover:border-accent/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-md bg-accent text-black text-xs font-semibold">
                    {m.tag}
                  </span>
                  <span className="font-pixel text-[10px] text-accent">{m.xp}</span>
                </div>

                <p className="mt-4 text-xs text-muted">{m.input}</p>

                <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted/60">
                  <span className="h-px flex-1 bg-line" />
                  generate
                  <span className="h-px flex-1 bg-line" />
                </div>

                <div className="rounded-lg border border-line bg-ink p-3">
                  <p className="text-sm text-white/90 leading-relaxed">{m.output}</p>
                  <div className="mt-3 rounded bg-accent/15 text-accent text-[11px] font-medium text-center py-1.5">
                    Insert into X
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

import DemonMascot from "./DemonMascot";
import DemonPlayground from "./DemonPlayground";
import Reveal from "./Reveal";
import { LEVELS } from "./demon-data";

export default function FeedTheDemon() {
  return (
    <section id="demon" className="py-20 md:py-28 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5">
        <Reveal className="text-center max-w-3xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">
            The retention mechanic
          </p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-4xl text-white leading-snug">
            Feed Aminta
          </h2>
          <p className="mt-5 text-lg text-muted">
            “The demon gets stronger every time you post.”
          </p>
        </Reveal>

        {/* Interactive playground */}
        <Reveal delay={120} className="mt-14">
          <DemonPlayground />
        </Reveal>

        {/* Level progression grid */}
        <Reveal className="mt-20 text-center">
          <h3 className="font-pixel text-base text-white">9 levels of corruption</h3>
          <p className="mt-3 text-muted text-sm">From dead-asleep to absolute ruler.</p>
        </Reveal>

        <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
          {LEVELS.map((lvl, i) => (
            <Reveal key={lvl.lv} delay={i * 50}>
              <div
                className="group relative h-full rounded-2xl border border-line bg-panel p-5 text-center overflow-hidden hover:border-white/25 transition-colors"
                style={{ boxShadow: `inset 0 0 40px ${lvl.skin.body}10` }}
              >
                <div
                  className="absolute inset-x-0 -top-10 h-24 blur-2xl opacity-25"
                  style={{ background: lvl.skin.body }}
                />
                <div className="relative flex justify-center">
                  <DemonMascot
                    skin={lvl.skin}
                    size={84}
                    className="group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <div className="relative mt-4">
                  <span className="font-pixel text-[10px] text-muted">LV.{lvl.lv}</span>
                  <p
                    className="mt-1 font-pixel text-[11px] leading-tight"
                    style={{ color: lvl.skin.eye }}
                  >
                    {lvl.name}
                  </p>
                  <p className="mt-2 text-[11px] text-muted">{lvl.xp.toLocaleString()} XP</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Streak + warning */}
        <Reveal className="mt-12 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6">
            <div className="flex items-center gap-2 font-pixel text-sm text-accent">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2c0 0-5 5.5-5 10a5 5 0 0 0 10 0C17 7.5 12 2 12 2zm0 14a3 3 0 0 1-3-3c0-2.5 3-6 3-6s3 3.5 3 6a3 3 0 0 1-3 3z"/>
              </svg>
              Daily Streak = +100 XP
            </div>
            <p className="mt-3 text-sm text-muted leading-relaxed">
              Post every day and the streak bonus stacks on top of everything. Consistency is the
              cheat code. The demon rewards the grind.
            </p>
          </div>
          <div className="rounded-2xl border border-ember/30 bg-ember/5 p-6">
            <div className="flex items-center gap-2 font-pixel text-sm text-ember">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Miss a day and it starts to fade
            </div>
            <p className="mt-3 text-sm text-muted leading-relaxed">
              Ghost the demon and it goes hungry. Your streak breaks and it starts losing its glow.
              Don&apos;t let it fade. Feed it daily.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

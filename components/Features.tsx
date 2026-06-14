import Reveal from "./Reveal";

interface Feature {
  title: string;
  desc: string;
  xp?: string;
  accent: string;
  icon: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: "Tweet Generator",
    desc: "Drop a topic, get a scroll-stopping post in your voice. No blank-box paralysis.",
    xp: "+50 XP",
    accent: "text-accent",
    icon: (
      <path d="M3 12h18M12 3v18" strokeWidth="2" strokeLinecap="round" />
    ),
  },
  {
    title: "Reply Generator",
    desc: "Pull any tweet, fire back an in-voice reply that actually adds something. Reply-guy, evolved.",
    xp: "+25 XP",
    accent: "text-accent",
    icon: (
      <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" strokeWidth="2" strokeLinejoin="round" />
    ),
  },
  {
    title: "Tweet Polisher",
    desc: "Rough draft in, crisp banger out. Keeps your meaning and voice — just sharper.",
    xp: "+15 XP",
    accent: "text-accent",
    icon: (
      <path d="m12 3 2.2 5 5.3.4-4 3.5 1.2 5.2L12 19.7 7.3 22.6l1.2-5.2-4-3.5 5.3-.4L12 3Z" strokeWidth="2" strokeLinejoin="round" />
    ),
  },
  {
    title: "Voice Profile",
    desc: "Teach it your niche, tone, and best tweets once. Everything it writes sounds like you.",
    accent: "text-accent",
    icon: (
      <path d="M12 3a9 9 0 0 0-9 9v4a3 3 0 0 0 3 3h1v-7H5v-0a7 7 0 0 1 14 0v0h-2v7h1a3 3 0 0 0 3-3v-4a9 9 0 0 0-9-9Z" strokeWidth="1.6" strokeLinejoin="round" />
    ),
  },
  {
    title: "Insert into X",
    desc: "One click drops the result straight into the X composer. Zero copy-paste, zero tab-switching.",
    accent: "text-accent",
    icon: (
      <path d="M5 12h12m0 0-5-5m5 5-5 5M19 4v16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: "BYOK API Support",
    desc: "Bring your own key — Groq (free tier), OpenRouter, or Gemini. You only pay us for the app.",
    accent: "text-accent",
    icon: (
      <path d="M14 7a4 4 0 1 0-3.8 5.2L4 18.5V21h3l1-1h2v-2h2l1.5-1.5A4 4 0 0 0 14 7Zm2-1.5a.6.6 0 1 1-.001.001Z" strokeWidth="1.7" strokeLinejoin="round" />
    ),
  },
];

export default function Features() {
  return (
    <section id="features" className="acc-violet relative py-20 md:py-28 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">Loadout</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Everything you need to post
          </h2>
          <p className="mt-4 text-muted">
            Six tools, one side panel. Each action you take feeds the demon and stacks XP.
          </p>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 70}>
              <div className="group h-full rounded-2xl border border-line bg-panel p-6 hover:border-accent/40 hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <span className={`grid place-items-center w-11 h-11 rounded-xl bg-ink border border-line ${f.accent}`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      {f.icon}
                    </svg>
                  </span>
                  {f.xp && (
                    <span className="font-pixel text-[10px] rounded-md border border-accent/40 bg-accent/10 text-accent px-2 py-1">
                      {f.xp}
                    </span>
                  )}
                </div>
                <h3 className="mt-5 font-pixel text-sm text-white">{f.title}</h3>
                <p className="mt-3 text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import Reveal from "./Reveal";
import AmintaSprite from "./AmintaSprite";
import { LEVELS } from "./demon-data";

interface Feature {
  title: string;
  desc: string;
  feedback: string;
  icon: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: "Tweet Generator",
    desc: "Type a topic. Get a post in your voice. No blank-box paralysis. Just output.",
    feedback: "Aminta gains 50 XP.",
    icon: <path d="M12 5v14M5 12h14" strokeWidth="2.2" strokeLinecap="round" />,
  },
  {
    title: "Reply Generator",
    desc: "Pull any tweet, fire back an in-voice reply that adds something. Every reply feeds the demon.",
    feedback: "Reply sent. Demon feeds.",
    icon: <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" strokeWidth="2.2" strokeLinejoin="round" />,
  },
  {
    title: "Tweet Polisher",
    desc: "Rough draft in, sharp banger out. Keeps your voice, just tighter.",
    feedback: "Voice refined.",
    icon: <path d="m12 3 2.2 5 5.3.4-4 3.5 1.2 5.2L12 19.7 7.3 22.6l1.2-5.2-4-3.5 5.3-.4L12 3Z" strokeWidth="2.2" strokeLinejoin="round" />,
  },
  {
    title: "Voice Profile",
    desc: "Teach Aminta your niche, tone, and best tweets once. Everything it writes sounds like you.",
    feedback: "Voice locked in.",
    icon: <path d="M12 3a9 9 0 0 0-9 9v4a3 3 0 0 0 3 3h1v-7H5v-0a7 7 0 0 1 14 0v0h-2v7h1a3 3 0 0 0 3-3v-4a9 9 0 0 0-9-9Z" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  {
    title: "Insert into X",
    desc: "One click drops the result straight into the X composer. Post it. Collect the XP.",
    feedback: "Frictionless. Post it now.",
    icon: <path d="M5 12h12m0 0-5-5m5 5-5 5M19 4v16" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: "BYOK API Support",
    desc: "Bring your own key: Groq, OpenRouter, or Gemini. Your key, your cost, your demon.",
    feedback: "Your key. Full control.",
    icon: <path d="M14 7a4 4 0 1 0-3.8 5.2L4 18.5V21h3l1-1h2v-2h2l1.5-1.5A4 4 0 0 0 14 7Z" strokeWidth="1.9" strokeLinejoin="round" />,
  },
];

function AmintaWidget() {
  const level = LEVELS[2];
  const next  = LEVELS[3];
  const demoXp = 520;
  const pct = Math.round(((demoXp - level.xp) / (next.xp - level.xp)) * 100);

  return (
    <div
      className="flex items-center gap-4 mx-auto w-fit px-5 py-3"
      style={{
        background: "#1f1f1f",
        border: "2px solid #74f7b5",
        boxShadow: "3px 3px 0 #000, 0 0 18px rgba(116,247,181,0.15)",
      }}
    >
      <AmintaSprite level={level.lv} size={40} interactive={false} />
      <div>
        <div className="flex items-center gap-2">
          <span className="font-pixel text-[10px] text-accent">LV.{level.lv}</span>
          <span className="font-pixel text-[10px] text-white">{level.name.toUpperCase()}</span>
          <span className="font-pixel text-[8px]" style={{ color: "#74f7b5", opacity: 0.5 }}>+50 XP</span>
        </div>
        <div className="mt-1.5 h-2 w-36 overflow-hidden" style={{ background: "#111", border: "1px solid #333" }}>
          <div className="h-full bg-accent" style={{ width: `${pct}%`, boxShadow: "0 0 6px #74f7b5" }} />
        </div>
        <p className="mt-1 font-pixel text-[8px]" style={{ color: "#74f7b5", opacity: 0.6 }}>
          {next.xp - demoXp} XP TO LV.{next.lv}
        </p>
      </div>
    </div>
  );
}

export default function Features() {
  return (
    <section id="features" className="relative py-20 md:py-28 scroll-mt-20" style={{ background: "#111" }}>
      <div className="mx-auto max-w-7xl px-5">

        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">Training System</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Every action trains your demon.
          </h2>
          <p className="mt-4 text-muted">
            Six tools. One side panel. Every action earns XP and levels your Aminta.
          </p>
        </Reveal>

        <Reveal className="mt-8" delay={80}>
          <AmintaWidget />
        </Reveal>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60}>
              <div
                className="group h-full p-5 transition-all duration-150 cursor-default
                           hover:-translate-y-0.5 active:translate-y-0.5"
                style={{
                  background: "#1a1a1a",
                  border: "2px solid #2a2a2a",
                  boxShadow: "3px 3px 0 #000",
                  position: "relative",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "#74f7b5"
                  ;(e.currentTarget as HTMLElement).style.boxShadow = "3px 3px 0 #000, 0 0 16px rgba(116,247,181,0.12)"
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "#2a2a2a"
                  ;(e.currentTarget as HTMLElement).style.boxShadow = "3px 3px 0 #000"
                }}
              >
                {/* top-left highlight strip */}
                <div className="pointer-events-none absolute inset-0"
                  style={{ boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.05)" }} />

                <span
                  className="inline-flex items-center justify-center w-10 h-10 text-accent"
                  style={{
                    background: "rgba(116,247,181,0.08)",
                    border: "2px solid rgba(116,247,181,0.25)",
                    boxShadow: "2px 2px 0 #000",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    {f.icon}
                  </svg>
                </span>

                <h3 className="mt-4 font-pixel text-sm text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{f.desc}</p>
                <p className="mt-3 font-pixel text-[9px] text-accent opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  ◈ {f.feedback}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

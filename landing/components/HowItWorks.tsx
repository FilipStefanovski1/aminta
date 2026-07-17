import { Fragment } from "react";
import Reveal from "./Reveal";
import AmintaSprite from "./AmintaSprite";

const STEPS = [
  {
    n: "01",
    title: "Train Aminta",
    desc: "Teach your niche, tone, and best posts once. Everything it writes sounds like you.",
    reward: "Voice locked in",
    level: 1,
  },
  {
    n: "02",
    title: "Generate & post",
    desc: "Open the side panel, write replies or posts in your voice, insert into X with one click.",
    reward: "+50 XP per post",
    level: 3,
  },
  {
    n: "03",
    title: "Feed & evolve",
    desc: "Publishing earns XP, keeps your streak alive, and levels up your demon.",
    reward: "Streak secured",
    level: 5,
  },
];

function StepCard({ step, index }: { step: (typeof STEPS)[0]; index: number }) {
  return (
    <Reveal delay={index * 120} className="h-full">
      <div className="flex flex-col h-full px-6 py-8 border border-line/50 bg-panel/40 hover:border-accent/30 hover:bg-panel/60 transition-colors duration-300">
        <span className="font-pixel text-[9px] text-accent/40 tracking-widest">{step.n}</span>

        <div className="mt-6 flex justify-center">
          <AmintaSprite level={step.level} interactive={false} size={56} />
        </div>

        <h3 className="mt-6 font-pixel text-[13px] text-white text-center leading-snug">
          {step.title}
        </h3>

        <p className="mt-3 text-sm text-muted text-center leading-relaxed flex-1">
          {step.desc}
        </p>

        <p className="mt-6 font-pixel text-[9px] text-accent/60 text-center tracking-wide">
          ◈ {step.reward}
        </p>
      </div>
    </Reveal>
  );
}

function Connector() {
  return (
    <div className="hidden md:flex items-center justify-center px-2 shrink-0">
      <div className="flex gap-1.5">
        {[0.2, 0.35, 0.5, 0.35, 0.2].map((o, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent" style={{ opacity: o }} />
        ))}
      </div>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 scroll-mt-20">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal className="text-center max-w-xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">The loop</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            How it works
          </h2>
        </Reveal>

        <div className="mt-14 grid md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 md:gap-0 items-stretch">
          {STEPS.map((s, i) => (
            <Fragment key={s.n}>
              <StepCard step={s} index={i} />
              {i < STEPS.length - 1 && <Connector />}
            </Fragment>
          ))}
        </div>

        <Reveal delay={360} className="mt-10 text-center">
          <p className="text-xs text-muted">
            Bring your own AI key (Groq, Gemini, or OpenRouter).{" "}
            <span className="text-white/50">Better privacy, lower cost, full control.</span>
          </p>
        </Reveal>

      </div>
    </section>
  );
}

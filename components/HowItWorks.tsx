import { Fragment } from "react";
import Reveal from "./Reveal";
import AmintaSprite from "./AmintaSprite";

const STEPS = [
  {
    n: "01",
    title: "Train Aminta",
    desc: "Teach your niche, tone, and best posts once.",
    reward: "VOICE LOCKED IN",
    level: 1,
  },
  {
    n: "02",
    title: "Generate inside X",
    desc: "Open the side panel, write replies or posts, insert with one click.",
    reward: "+50 XP · POST",
    level: 3,
  },
  {
    n: "03",
    title: "Feed & evolve",
    desc: "Publishing earns XP, keeps your streak alive, and levels up Aminta.",
    reward: "STREAK ALIVE",
    level: 5,
  },
];

function PixelTrail({ vertical = false }: { vertical?: boolean }) {
  const opacities = [0.18, 0.28, 0.38, 0.48, 0.38, 0.28];
  return vertical ? (
    <div className="flex flex-col items-center py-4 gap-[7px]">
      {opacities.map((o, i) => (
        <div
          key={i}
          style={{ width: 5, height: 5, background: `rgba(116,247,181,${o})` }}
        />
      ))}
    </div>
  ) : (
    <div className="flex items-center gap-[7px] px-3 shrink-0">
      {opacities.map((o, i) => (
        <div
          key={i}
          style={{ width: 5, height: 5, background: `rgba(116,247,181,${o})` }}
        />
      ))}
    </div>
  );
}

function QuestCard({ step }: { step: (typeof STEPS)[0] }) {
  return (
    <div className="group relative h-full flex flex-col rounded-xl border border-line bg-panel overflow-hidden hover:border-accent/40 transition-colors duration-300">
      {/* Top accent rule */}
      <div
        className="h-px shrink-0"
        style={{
          background:
            "linear-gradient(to right, transparent, rgba(116,247,181,0.35), transparent)",
        }}
      />

      <div className="flex flex-col flex-1 p-5">
        {/* Quest label */}
        <p className="font-pixel text-[9px] text-accent/60 tracking-[0.18em] mb-5">
          QUEST {step.n}
        </p>

        {/* Aminta state for this step */}
        <div className="flex justify-center mb-4">
          <AmintaSprite level={step.level} interactive={false} size={52} />
        </div>

        {/* Title */}
        <h3 className="font-pixel text-sm text-white text-center mb-3">
          {step.title}
        </h3>

        {/* Description */}
        <p className="text-sm text-muted leading-relaxed text-center flex-1">
          {step.desc}
        </p>

        {/* Reward badge */}
        <div className="mt-5 flex justify-center">
          <span
            className="inline-flex items-center gap-1.5 font-pixel text-[9px] text-accent px-3 py-1.5 border border-accent/20"
            style={{ background: "rgba(116,247,181,0.07)" }}
          >
            <span>&#9670;</span>
            {step.reward}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 scroll-mt-20">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">
            The loop
          </p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            How It Works
          </h2>
          <p className="mt-4 text-muted">
            Three steps. Then you just keep feeding it.
          </p>
        </Reveal>

        {/* Desktop: cards in a row with pixel trail connectors */}
        <div className="mt-14 hidden md:grid items-stretch grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STEPS.map((s, i) => (
            <Fragment key={s.n}>
              <Reveal delay={i * 130} className="h-full">
                <QuestCard step={s} />
              </Reveal>
              {i < STEPS.length - 1 && (
                <div className="flex items-center self-stretch">
                  <PixelTrail />
                </div>
              )}
            </Fragment>
          ))}
        </div>

        {/* Mobile: stacked cards with vertical pixel trail */}
        <div className="mt-10 md:hidden flex flex-col">
          {STEPS.map((s, i) => (
            <Fragment key={s.n}>
              <Reveal delay={i * 100}>
                <QuestCard step={s} />
              </Reveal>
              {i < STEPS.length - 1 && <PixelTrail vertical />}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

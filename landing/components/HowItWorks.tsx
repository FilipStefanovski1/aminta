import { Fragment } from "react";
import Reveal from "./Reveal";
import AmintaSprite from "./AmintaSprite";

function XLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-label="X logo">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.213 5.567 5.95-5.567zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Train Aminta",
    desc: "Teach your niche, tone, and best posts once.",
    reward: "VOICE LOCKED IN",
    level: 1,
    platformBadge: null as string | null,
    disclaimer: null as string | null,
  },
  {
    n: "02",
    title: "Generate on X",
    desc: "Open the side panel, write replies or posts, insert with one click.",
    reward: "+50 XP · POST",
    level: 3,
    platformBadge: "X PLATFORM",
    disclaimer: "X is a trademark of X Corp. Aminta is not affiliated with or endorsed by X.",
  },
  {
    n: "03",
    title: "Feed & evolve",
    desc: "Publishing earns XP, keeps your streak alive, and levels up Aminta.",
    reward: "STREAK ALIVE",
    level: 5,
    platformBadge: null as string | null,
    disclaimer: null as string | null,
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
        <p className="font-pixel text-[9px] text-accent/60 tracking-[0.18em] mb-4">
          QUEST {step.n}
        </p>

        {/* Platform badge — only on step 02 */}
        {step.platformBadge && (
          <div className="flex justify-center mb-3">
            <span
              className="inline-flex items-center gap-1.5 font-pixel text-[8px] tracking-[0.14em] px-2.5 py-1 rounded-sm"
              style={{
                color: "rgba(255,255,255,0.35)",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.4)" }}>
                <XLogo size={11} />
              </span>
              {step.platformBadge}
            </span>
          </div>
        )}

        {/* Aminta mascot */}
        <div className="flex justify-center mb-4">
          <AmintaSprite level={step.level} interactive={false} size={52} />
        </div>

        {/* Title — inline X logo for step 02 */}
        <h3 className="font-pixel text-sm text-white text-center mb-3 flex items-center justify-center gap-2 flex-wrap">
          {step.platformBadge ? (
            <>
              Generate on{" "}
              <span className="inline-flex items-center gap-1">
                <XLogo size={14} />
              </span>
            </>
          ) : (
            step.title
          )}
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

        {/* Disclaimer — only on step 02 */}
        {step.disclaimer && (
          <p
            className="mt-3 text-center leading-snug"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.18)" }}
          >
            {step.disclaimer}
          </p>
        )}
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

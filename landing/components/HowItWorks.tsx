import { Fragment } from "react";
import Reveal from "./Reveal";
import { LearningIcon, PublishIcon, WritingIcon } from "./HowItWorksIcons";

const STEPS = [
  {
    n: "1",
    title: "Learn Your Voice",
    desc: "Connect your X account once. Aminta studies how you write and builds a voice profile from your tone, vocabulary, and opinions.",
    Icon: LearningIcon,
  },
  {
    n: "2",
    title: "Write Like You",
    desc: "Generate tweets, replies, and threads that sound like you, not generic AI. Every suggestion matches your writing style.",
    Icon: WritingIcon,
  },
  {
    n: "3",
    title: "Publish Faster",
    desc: "Make small edits if you want, then publish straight to X. Spend less time writing and more time growing your audience.",
    Icon: PublishIcon,
  },
];

function StepCard({ step, index }: { step: (typeof STEPS)[0]; index: number }) {
  const { Icon } = step;
  return (
    <Reveal delay={index * 120} className="h-full">
      <div className="how-card group flex h-full flex-col items-center px-8 py-10 text-center">
        <span className="how-badge flex items-center justify-center self-start">
          <span className="font-pixel text-[11px] text-accent">{step.n}</span>
        </span>

        <div className="mt-6 flex h-[90px] items-center justify-center">
          <Icon className="how-icon-float h-[90px] w-[90px] text-accent" />
        </div>

        <h3 className="mt-6 font-pixel text-[13px] leading-snug text-accent sm:text-[15px]">
          {step.title}
        </h3>

        <p className="mt-4 font-mono text-[15px] leading-relaxed text-[#b3b3b3] sm:text-base">
          {step.desc}
        </p>
      </div>
    </Reveal>
  );
}

function Connector() {
  return (
    <div className="hidden lg:flex items-center justify-center px-3 shrink-0">
      <span className="how-chevron font-pixel text-lg leading-none">&gt;</span>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-20 md:py-28 scroll-mt-20">
      {/* soft ambient glow behind the cards */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-[120px]"
        style={{ background: "var(--accent-soft)" }}
      />

      <div className="mx-auto max-w-5xl px-5">
        <Reveal className="text-center max-w-xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">The loop</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            How it works
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr] gap-6 lg:gap-0 items-stretch">
          {STEPS.map((s, i) => (
            <Fragment key={s.n}>
              <StepCard step={s} index={i} />
              {i < STEPS.length - 1 && <Connector />}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

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

// Card chrome, icon tile and type scale are deliberately the same tokens
// Features.tsx uses (.feature-card + the mint-bordered icon chip), so the two
// card grids on this page read as one system rather than two designs.
function StepCard({ step, index }: { step: (typeof STEPS)[0]; index: number }) {
  const { Icon } = step;
  return (
    <Reveal delay={index * 120} className="h-full">
      <div
        className="feature-card group h-full p-6 transition-all duration-150 cursor-default
                   hover:-translate-y-0.5 active:translate-y-0.5"
        style={{ background: "#1a1a1a", position: "relative" }}
      >
        {/* top-left highlight strip */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.05)" }}
        />

        <div className="flex items-center justify-between gap-3">
          <span
            className="inline-flex h-16 w-16 shrink-0 items-center justify-center text-accent"
            style={{
              background: "rgba(116,247,181,0.08)",
              border: "2px solid rgba(116,247,181,0.25)",
              boxShadow: "2px 2px 0 #000",
            }}
          >
            <Icon className="h-10 w-10" />
          </span>
          <span className="font-pixel text-[11px] text-muted/50">{step.n}</span>
        </div>

        <h3 className="mt-5 font-pixel text-sm leading-snug text-white">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{step.desc}</p>
      </div>
    </Reveal>
  );
}

// Sits between cards on desktop and lines up with the icon tiles rather than
// floating at card mid-height, so the row reads as one left-to-right flow.
function Connector() {
  return (
    <div aria-hidden className="hidden shrink-0 items-start px-4 lg:flex">
      {/* 26px clears the card's 2px border + 24px padding, and h-16 matches the
          icon tile, so centering here lands the arrow on the icon centreline. */}
      <div className="mt-[26px] flex h-16 items-center gap-2">
        <span className="h-px w-7 bg-line" />
        <span className="font-pixel text-[11px] leading-none text-accent/60">&gt;</span>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-20 md:py-28 scroll-mt-20">
      {/* soft ambient glow behind the cards */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[360px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px]"
        style={{ background: "var(--accent-soft)" }}
      />

      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center max-w-xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">The loop</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            How it works
          </h2>
        </Reveal>

        {/* Connectors are display:none below lg, so they drop out of the grid
            entirely and the md layout is a clean 3-up. */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] gap-5 lg:gap-0 items-stretch">
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

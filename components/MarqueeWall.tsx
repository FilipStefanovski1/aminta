"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type DemonStageDetail = { active: boolean; color?: string };

type CardKind = "placeholder" | "xp" | "feature" | "founder" | "lore" | "truth" | "benefit";

interface WallCard {
  id: string;
  kind: CardKind;
  title: string;
  text: string;
  meta?: string;
}

const CARDS: WallCard[] = [
  {
    id: "p1",
    kind: "placeholder",
    title: "Creator pain",
    text: "I know what I want to say. I just don't want to write it.",
    meta: "Placeholder note",
  },
  {
    id: "p2",
    kind: "placeholder",
    title: "Posting truth",
    text: "Posting consistently is harder than posting once.",
    meta: "Placeholder note",
  },
  {
    id: "xp1",
    kind: "xp",
    title: "XP Loop",
    text: "Every post earns XP. Every reply feeds Aminta.",
    meta: "POST +50 XP · REPLY +25 XP",
  },
  {
    id: "f1",
    kind: "feature",
    title: "Feature",
    text: "Generate tweets in your own voice, then polish fast.",
    meta: "Tweet Generator · Polisher",
  },
  {
    id: "l1",
    kind: "lore",
    title: "Aminta lore",
    text: "Aminta gets stronger every time you post.",
    meta: "Feed. Post. Repeat.",
  },
  {
    id: "fn1",
    kind: "founder",
    title: "Founder note",
    text: "Most tools help you write. Aminta helps you keep showing up.",
    meta: "System > motivation",
  },
  {
    id: "t1",
    kind: "truth",
    title: "Posting truth",
    text: "The blank page wins too often.",
    meta: "Break the freeze",
  },
  {
    id: "b1",
    kind: "benefit",
    title: "Benefit",
    text: "Reply faster without sounding robotic.",
    meta: "Context-aware replies",
  },
  {
    id: "p3",
    kind: "placeholder",
    title: "Creator pain",
    text: "Most creators disappear because they stop showing up.",
    meta: "Placeholder note",
  },
  {
    id: "xp2",
    kind: "xp",
    title: "Level signal",
    text: "Growth becomes visible. Streaks stop being invisible effort.",
    meta: "No posts. No XP.",
  },
  {
    id: "f2",
    kind: "feature",
    title: "Feature",
    text: "Turn rough thoughts into publishable posts in seconds.",
    meta: "Draft → Publish",
  },
  {
    id: "fn2",
    kind: "founder",
    title: "Founder note",
    text: "Motivation fades. Systems don't.",
    meta: "Consistency engine",
  },
  {
    id: "l2",
    kind: "lore",
    title: "Aminta lore",
    text: "A hungry Aminta wants content.",
    meta: "Keep the companion fed",
  },
  {
    id: "b2",
    kind: "benefit",
    title: "Benefit",
    text: "Consistency has a companion now.",
    meta: "Native to your workflow",
  },
  {
    id: "t2",
    kind: "truth",
    title: "Posting truth",
    text: "Growth comes from repetition.",
    meta: "Show up daily",
  },
];

const KIND_LABEL: Record<CardKind, string> = {
  placeholder: "PLACEHOLDER",
  xp: "XP",
  feature: "FEATURE",
  founder: "FOUNDER",
  lore: "LORE",
  truth: "TRUTH",
  benefit: "BENEFIT",
};

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const normalized = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const n = Number.parseInt(normalized, 16);
  if (Number.isNaN(n)) return `rgba(116,247,181,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function Card({ card }: { card: WallCard }) {
  return (
    <article className="marquee-card rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-pixel text-[10px] tracking-[0.08em] text-accent">
          {KIND_LABEL[card.kind]}
        </span>
        {card.meta ? <span className="font-pixel text-[9px] text-muted">{card.meta}</span> : null}
      </div>
      <h3 className="mt-2 font-pixel text-[11px] text-white">{card.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#d7d7dd]">{card.text}</p>
    </article>
  );
}

interface ColumnProps {
  cards: WallCard[];
  speedClass: string;
}

function MarqueeColumn({ cards, speedClass }: ColumnProps) {
  const doubled = useMemo(() => [...cards, ...cards], [cards]);
  return (
    <div className="marquee-column">
      <div className={`marquee-track ${speedClass}`}>
        {doubled.map((card, i) => (
          <Card key={`${card.id}-${i}`} card={card} />
        ))}
      </div>
    </div>
  );
}

export default function MarqueeWall() {
  const [accent, setAccent] = useState("#74f7b5");

  useEffect(() => {
    const onStage = (e: Event) => {
      const detail = (e as CustomEvent<DemonStageDetail>).detail;
      if (detail.active && detail.color) setAccent(detail.color);
    };
    window.addEventListener("demon-stage", onStage);
    return () => window.removeEventListener("demon-stage", onStage);
  }, []);

  const columns = useMemo(() => {
    const c1 = CARDS.filter((_, i) => i % 3 === 0);
    const c2 = CARDS.filter((_, i) => i % 3 === 1);
    const c3 = CARDS.filter((_, i) => i % 3 === 2);
    return [c1, c2, c3];
  }, []);

  const wallVars = {
    "--wall-accent": accent,
    "--wall-accent-soft": hexToRgba(accent, 0.16),
    "--wall-accent-glow": hexToRgba(accent, 0.55),
  } as CSSProperties;

  return (
    <section
      className="relative py-20 md:py-24"
      style={{ ...wallVars, transition: "--wall-accent 450ms ease, --wall-accent-soft 450ms ease, --wall-accent-glow 450ms ease" }}
    >
      <div className="mx-auto max-w-7xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Built for people who know they should post more.
          </h2>
          <p className="mt-4 text-muted">Aminta helps you show up consistently.</p>
        </div>

        <div className="mt-12 hidden md:grid grid-cols-3 gap-4 marquee-wall">
          <MarqueeColumn cards={columns[0]} speedClass="marquee-up-slow" />
          <MarqueeColumn cards={columns[1]} speedClass="marquee-down-medium" />
          <MarqueeColumn cards={columns[2]} speedClass="marquee-up-fast" />
        </div>

        <div className="mt-10 md:hidden space-y-3">
          {CARDS.slice(0, 10).map((card) => (
            <Card key={`mobile-${card.id}`} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

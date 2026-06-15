"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type DemonStageDetail = { active: boolean; color?: string };

type CardKind = "placeholder" | "xp" | "founder" | "lore" | "truth" | "benefit";

interface WallCard {
  id: string;
  kind: CardKind;
  name: string;
  role: string;
  company: string;
  review: string;
  avatar: string;
  tag: string;
}

const CARDS: WallCard[] = [
  {
    id: "p1",
    kind: "placeholder",
    name: "Victor Saltor",
    role: "Solo creator",
    company: "Launchframe",
    review: "I know what I want to say. I just don't want to write it.",
    avatar: "/testimonials/victor-saltor.jpg",
    tag: "Creator pain",
  },
  {
    id: "p2",
    kind: "truth",
    name: "Mila Vukikjevikj",
    role: "Growth lead",
    company: "Orbit Labs",
    review: "Posting consistently is harder than posting once.",
    avatar: "/testimonials/mila-vukikjevikj.jpg",
    tag: "Posting truth",
  },
  {
    id: "xp1",
    kind: "xp",
    name: "Jha Sundaram",
    role: "Indie founder",
    company: "Signalway",
    review: "Every post earns XP. Every reply feeds Aminta. It keeps me in motion.",
    avatar: "/testimonials/jha-sundaram.jpg",
    tag: "POST +50 XP · REPLY +25 XP",
  },
  {
    id: "l1",
    kind: "lore",
    name: "Samuel Naumovski Vickius",
    role: "Product storyteller",
    company: "Northstar Studio",
    review: "Aminta gets stronger every time you post. Feed. Post. Repeat.",
    avatar: "/testimonials/samuel-naumovski.jpg",
    tag: "Aminta lore",
  },
  {
    id: "fn1",
    kind: "founder",
    name: "Filip Stefanovski",
    role: "Founder",
    company: "Aminta",
    review: "Most tools help you write. Aminta helps you keep showing up.",
    avatar: "/testimonials/filip-stefanovski.jpg",
    tag: "Founder note",
  },
  {
    id: "t1",
    kind: "truth",
    name: "Sofia Reed",
    role: "Creator",
    company: "Neon Journal",
    review: "The blank page wins too often. The wall reminds me to publish anyway.",
    avatar: "/testimonials/sofia-reed.jpg",
    tag: "Posting truth",
  },
  {
    id: "b1",
    kind: "benefit",
    name: "Evan Brooks",
    role: "Community manager",
    company: "PulseForge",
    review: "I reply faster without sounding robotic. It still feels like me.",
    avatar: "/testimonials/evan-brooks.jpg",
    tag: "Product benefit",
  },
  {
    id: "p3",
    kind: "placeholder",
    name: "Lena Park",
    role: "Consultant",
    company: "Threadline",
    review: "Most creators disappear because they stop showing up.",
    avatar: "/testimonials/lena-park.jpg",
    tag: "Creator pain",
  },
  {
    id: "xp2",
    kind: "xp",
    name: "Jonah Miles",
    role: "SaaS operator",
    company: "ClarityOS",
    review: "Growth becomes visible. No posts. No XP. That clarity changed my week.",
    avatar: "/testimonials/jonah-miles.jpg",
    tag: "XP system",
  },
  {
    id: "fn2",
    kind: "founder",
    name: "Filip Stefanovski",
    role: "Founder",
    company: "Aminta",
    review: "Motivation fades. Systems don't.",
    avatar: "/testimonials/filip-stefanovski.jpg",
    tag: "Founder note",
  },
  {
    id: "l2",
    kind: "lore",
    name: "Ari Quinn",
    role: "Writer",
    company: "Monolith Media",
    review: "A hungry Aminta wants content. That tiny pressure keeps me consistent.",
    avatar: "/testimonials/ari-quinn.jpg",
    tag: "Aminta lore",
  },
  {
    id: "b2",
    kind: "benefit",
    name: "Mason Gray",
    role: "Creator",
    company: "Atlas Signals",
    review: "Consistency has a companion now. I post more because momentum feels real.",
    avatar: "/testimonials/mason-gray.jpg",
    tag: "Product benefit",
  },
  {
    id: "t2",
    kind: "truth",
    name: "Kayla Stone",
    role: "Audience lead",
    company: "Cinder House",
    review: "Growth comes from repetition. Aminta makes repetition visible.",
    avatar: "/testimonials/kayla-stone.jpg",
    tag: "Posting truth",
  },
];

const KIND_LABEL: Record<CardKind, string> = {
  placeholder: "PLACEHOLDER",
  xp: "XP",
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
    <div className="marquee-card rounded-xl p-4">
      <div className="flex items-start gap-3">
        <img
          src={card.avatar}
          alt={`${card.name} profile`}
          width={40}
          height={40}
          className="h-10 w-10 rounded-full object-cover border border-accent/50 shrink-0"
          loading="lazy"
          onError={(e) => {
            const t = e.currentTarget;
            t.style.display = "none";
            const el = t.nextElementSibling as HTMLElement | null;
            if (el) el.style.display = "flex";
          }}
        />
        <div
          style={{ display: "none" }}
          className="h-10 w-10 rounded-full border border-accent/50 shrink-0 bg-panel2 items-center justify-center font-pixel text-[10px] text-accent"
        >
          {card.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-pixel text-[11px] text-white truncate">{card.name}</p>
          <p className="text-[11px] text-muted truncate">{card.role} · {card.company}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="font-pixel text-[10px] tracking-[0.08em] text-accent">
          {KIND_LABEL[card.kind]}
        </span>
        <span className="font-pixel text-[9px] text-muted">{card.tag}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#d7d7dd]">"{card.review}"</p>
    </div>
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

function MobileFeed({ cards }: { cards: WallCard[] }) {
  const doubled = useMemo(() => [...cards, ...cards], [cards]);
  return (
    <div className="mobile-marquee">
      <div className="marquee-track marquee-up-mobile">
        {doubled.map((card, i) => (
          <Card key={`mob-${card.id}-${i}`} card={card} />
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
    "--accent": accent,
    "--accent-soft": hexToRgba(accent, 0.16),
    "--accent-glow": hexToRgba(accent, 0.55),
    "--wall-accent": accent,
    "--wall-accent-soft": hexToRgba(accent, 0.16),
    "--wall-accent-glow": hexToRgba(accent, 0.55),
    "--color-accent": accent,
    "--color-accent-soft": hexToRgba(accent, 0.16),
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
        </div>

        <div className="mt-12 hidden md:grid grid-cols-3 gap-4 marquee-wall marquee-fade-edge">
          <MarqueeColumn cards={columns[0]} speedClass="marquee-up-slow" />
          <MarqueeColumn cards={columns[1]} speedClass="marquee-down-medium" />
          <MarqueeColumn cards={columns[2]} speedClass="marquee-up-fast" />
        </div>

        <div className="mt-10 md:hidden">
          <MobileFeed cards={CARDS} />
        </div>
      </div>
    </section>
  );
}

"use client";

import { useMemo, type CSSProperties } from "react";

type CardKind = "placeholder" | "xp" | "founder" | "truth";

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
  // col 0
  {
    id: "r1",
    kind: "founder",
    name: "Lazar Bucan",
    role: "AI & GTM Engineer · Co-Founder @ Blockchain Skopje",
    company: "",
    review: "I used to open X, stare at the composer for two minutes, then close it. Now I actually post.",
    avatar: "/testimonials/LazarBucan.jpeg",
    tag: "AI & GTM",
  },
  // col 1
  {
    id: "p1",
    kind: "placeholder",
    name: "Victor Saltor",
    role: "Creator",
    company: "",
    review: "Half my drafts never make it online. Aminta helped me stop treating every post like it had to be perfect.",
    avatar: "/testimonials/VictorSaltor.jpeg",
    tag: "Creator",
  },
  // col 2
  {
    id: "fn1",
    kind: "founder",
    name: "Filip Stefanovski",
    role: "Founder",
    company: "Aminta",
    review: "Most people don't have a content problem. They have a consistency problem. That's why I built Aminta.",
    avatar: "/testimonials/filip-stefanovski.jpg",
    tag: "Founder note",
  },
  // col 0
  {
    id: "r2",
    kind: "founder",
    name: "Franka Grazdani",
    role: "COO @ 223 · Co-Founder @ ETH Macedonia",
    company: "",
    review: "When you're juggling events, partnerships and meetings, content is always the first thing to disappear. Aminta fixed that.",
    avatar: "/testimonials/FrankaGrazdani.jpeg",
    tag: "COO · Web3",
  },
  // col 1
  {
    id: "r3",
    kind: "founder",
    name: "Filip Najdovski",
    role: "Co-Founder & Deputy CEO · EaseAccess24",
    company: "",
    review: "I don't need another writing tool. I need something that gets me posting without turning it into work.",
    avatar: "/testimonials/FilipNajdovski.jpeg",
    tag: "Co-Founder",
  },
  // col 0
  {
    id: "r4",
    kind: "founder",
    name: "Marija Ljusheva",
    role: "Startup Community Coordinator @ EGC",
    company: "",
    review: "After a full day talking to founders, the last thing I want is to think about content. Aminta keeps my profile active anyway.",
    avatar: "/testimonials/MarijaLjuseva.jpeg",
    tag: "Community · Startups",
  },
  // col 1
  {
    id: "xp1",
    kind: "xp",
    name: "Jha Sundaram",
    role: "Head of Design @ Playground AI | Founder @ ETHBelgium",
    company: "",
    review: "I always have ideas for posts. Writing them is what I avoid. Aminta gets me from idea to publish before I can overthink it.",
    avatar: "/testimonials/JhaSundaram.png",
    tag: "POST +50 XP · REPLY +25 XP",
  },
  // col 0
  {
    id: "r6",
    kind: "founder",
    name: "Stefan Savevski",
    role: "COO · RUNSTACK",
    company: "",
    review: "The hardest part isn't writing. It's starting. Aminta removes that little bit of friction that keeps me from posting.",
    avatar: "/testimonials/StefanSavevski.png",
    tag: "COO",
  },
  // col 2
  {
    id: "r5",
    kind: "founder",
    name: "Samuel Naumovski Vickius",
    role: "Executive Director · SMCC",
    company: "",
    review: "You don't need to post every day. You just need to stay visible. Aminta makes that surprisingly easy.",
    avatar: "/testimonials/samuel-naumovski.jpeg",
    tag: "Executive",
  },
];

const KIND_LABEL: Record<CardKind, string> = {
  placeholder: "USER",
  xp: "XP",
  founder: "FOUNDER",
  truth: "TRUTH",
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
          <p className="text-[11px] text-muted truncate">{card.company ? `${card.role} · ${card.company}` : card.role}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#d7d7dd]">"{card.review}"</p>
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
  const accent = "#74f7b5";

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

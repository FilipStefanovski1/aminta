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
    review: "I spend my days thinking about AI and go-to-market. Aminta is the first tool that actually fits the way I think about building in public.",
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
    review: "I know what I want to say. I just don't want to write it. Aminta removes the friction between the idea and the post.",
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
    review: "Most tools help you write. Aminta helps you keep showing up.",
    avatar: "/testimonials/filip-stefanovski.jpg",
    tag: "Founder note",
  },
  // col 0
  {
    id: "r2",
    kind: "founder",
    name: "Franka Grazdani",
    role: "COO @ 223 · Co-founder @ ETH Macedonia",
    company: "",
    review: "Running two organisations means content always loses to meetings. Aminta changed that. I post consistently now without it eating my calendar.",
    avatar: "/testimonials/FrankaGrazdani.jpeg",
    tag: "COO · Web3",
  },
  // col 1
  {
    id: "r3",
    kind: "founder",
    name: "Filip Najdovski",
    role: "Co-Founder & Deputy CEO",
    company: "EaseAccess24",
    review: "Building a startup doesn't leave much time for content. Aminta lets me stay visible without making it a second job.",
    avatar: "/testimonials/FilipNajdovski.jpeg",
    tag: "Co-Founder",
  },
  // col 2
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
  // col 0
  {
    id: "r4",
    kind: "founder",
    name: "Marija Ljusheva",
    role: "Startup Community Coordinator @ EGC",
    company: "",
    review: "My job is connecting founders and keeping the community alive. Aminta helps me stay visible between events without spending an hour staring at a blank draft.",
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
    review: "Every post earns XP. Every reply feeds Aminta. It keeps me in motion.",
    avatar: "/testimonials/JhaSundaram.png",
    tag: "POST +50 XP · REPLY +25 XP",
  },
  // col 2
  {
    id: "r5",
    kind: "founder",
    name: "Samuel Naumovski Vickius",
    role: "Executive Director",
    company: "SMCC",
    review: "As an executive director, your personal brand is part of the institution's brand. Aminta makes it easy to stay present on X without turning it into a full-time job.",
    avatar: "/testimonials/samuel-naumovski.jpeg",
    tag: "Executive",
  },
  // col 0
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
  // col 1
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

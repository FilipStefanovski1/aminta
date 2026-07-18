"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";

interface WallCard {
  id: string;
  name: string;
  role: string;
  review: string;
  avatar: string;
}

const CARDS: WallCard[] = [
  {
    id: "r1",
    name: "Lazar Bucan",
    role: "AI & GTM Engineer · Co-Founder @ Blockchain Skopje",
    review: "I used to open X, stare at the composer for two minutes, then close it. Now I actually post.",
    avatar: "/testimonials/LazarBucan.jpeg",
  },
  {
    id: "p1",
    name: "Victor Saltor",
    role: "Creator",
    review: "Half my drafts never make it online. Aminta helped me stop treating every post like it had to be perfect.",
    avatar: "/testimonials/VictorSaltor.jpeg",
  },
  {
    id: "r2",
    name: "Franka Grazdani",
    role: "COO @ 223 · Co-Founder @ ETH Macedonia",
    review: "When you're juggling events, partnerships and meetings, content is always the first thing to disappear. Aminta fixed that.",
    avatar: "/testimonials/FrankaGrazdani.jpeg",
  },
  {
    id: "r3",
    name: "Filip Najdovski",
    role: "Co-Founder & Deputy CEO · EaseAccess24",
    review: "I don't need another writing tool. I need something that gets me posting without turning it into work.",
    avatar: "/testimonials/FilipNajdovski.jpeg",
  },
  {
    id: "r4",
    name: "Marija Ljusheva",
    role: "Startup Community Coordinator @ EGC",
    review: "After a full day talking to founders, the last thing I want is to think about content. Aminta keeps my profile active anyway.",
    avatar: "/testimonials/MarijaLjuseva.jpeg",
  },
  {
    id: "xp1",
    name: "Jha Sundaram",
    role: "Head of Design @ Playground AI | Founder @ ETHBelgium",
    review: "I always have ideas for posts. Writing them is what I avoid. Aminta gets me from idea to publish before I can overthink it.",
    avatar: "/testimonials/JhaSundaram.png",
  },
  {
    id: "r6",
    name: "Stefan Savevski",
    role: "COO · RUNSTACK",
    review: "The hardest part isn't writing. It's starting. Aminta removes that little bit of friction that keeps me from posting.",
    avatar: "/testimonials/StefanSavevski.png",
  },
  {
    id: "r5",
    name: "Samuel Naumovski Vickius",
    role: "Executive Director · SMCC",
    review: "You don't need to post every day. You just need to stay visible. Aminta makes that surprisingly easy.",
    avatar: "/testimonials/samuel-naumovski.jpeg",
  },
];

function rotate<T>(arr: T[], offset: number): T[] {
  const n = arr.length;
  if (n === 0) return arr;
  const o = ((offset % n) + n) % n;
  return [...arr.slice(o), ...arr.slice(0, o)];
}

function Card({ card }: { card: WallCard }) {
  return (
    <div className="marquee-card rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Image
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
          <p className="text-[11px] text-muted truncate">{card.role}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#d7d7dd]">&quot;{card.review}&quot;</p>
    </div>
  );
}

// Target scroll speed — 8–12px/s range, smooth and almost unnoticeable.
const SPEED_PX_PER_SEC = 10;
// Curated, not exhaustive: ~2–3 fully readable cards per column (~7–9 total
// across 3 columns) rather than a tall window trying to show everything at
// once. Each column is still fed the FULL card set (not a 1/3 split) so its
// single-cycle content height comfortably exceeds this window — the extra
// content just scrolls past rather than being crammed into view.
const TARGET_WINDOW_HEIGHT = 520;

function MarqueeColumn({
  cards,
  direction,
  active,
}: {
  cards: WallCard[];
  direction: "up" | "down";
  active: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  // "cycle" = the exact pixel distance from the top of group 1 to the top of
  // group 2 (group height + the gap between them). Translating the track by
  // exactly -cycle is visually identical to translating by 0, since the two
  // groups are exact duplicates — that's what makes the loop seamless
  // regardless of how tall any given card's text makes it.
  const [cycle, setCycle] = useState(0);

  useLayoutEffect(() => {
    const trackEl = trackRef.current;
    const groupEl = groupRef.current;
    if (!trackEl || !groupEl) return;

    const measure = () => {
      const groupHeight = groupEl.getBoundingClientRect().height;
      const gapPx = parseFloat(getComputedStyle(trackEl).rowGap || "0") || 0;
      setCycle(groupHeight + gapPx);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(groupEl);
    return () => ro.disconnect();
  }, [cards]);

  const ready = cycle > 0;
  // The window is the large target height by default. It only ever shrinks
  // below that if a column's own content is somehow shorter than the
  // target (safety net, not the normal case now that every column gets the
  // full card set) — never the other way around.
  const windowHeight = ready ? Math.min(TARGET_WINDOW_HEIGHT, cycle) : TARGET_WINDOW_HEIGHT;
  const duration = ready ? cycle / SPEED_PX_PER_SEC : 0;

  return (
    <div className="testimonial-col-window" style={{ height: windowHeight }}>
      <div
        ref={trackRef}
        className={`testimonial-track ${direction === "up" ? "testimonial-track-up" : "testimonial-track-down"} ${
          ready && active ? "" : "testimonial-track-paused"
        }`}
        style={
          ready
            ? ({ "--marquee-cycle": `${cycle}px`, "--marquee-duration": `${duration}s` } as CSSProperties)
            : undefined
        }
      >
        <div ref={groupRef} className="testimonial-group">
          {cards.map((card) => <Card key={card.id} card={card} />)}
        </div>
        {/* Exact duplicate, hidden from assistive tech — the second half of the loop */}
        <div aria-hidden className="testimonial-group">
          {cards.map((card) => <Card key={`dup-${card.id}`} card={card} />)}
        </div>
      </div>
    </div>
  );
}

export default function MarqueeWall() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => setInView(entry.isIntersecting)),
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Every column gets the full card set — with only ~8 testimonials total,
  // splitting them further would leave each column's single-cycle content
  // shorter than the target window, forcing the window to shrink to fit
  // (the exact bug being fixed here). Each column starts at a different
  // rotation offset so columns never show the same card at the same row at
  // the same time, even though they're drawing from the same pool.
  const columns3 = useMemo(() => [rotate(CARDS, 0), rotate(CARDS, 3), rotate(CARDS, 6)], []);
  const columns2 = useMemo(() => [rotate(CARDS, 0), rotate(CARDS, 4)], []);

  return (
    <section ref={sectionRef} id="testimonials" className="relative py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Loved by builders.
          </h2>
        </div>

        {/* Mobile: single static column, normal document flow, no animation */}
        <div className="mt-6 flex flex-col gap-3.5 sm:hidden">
          {CARDS.map((card) => <Card key={card.id} card={card} />)}
        </div>

        {/* Tablet: 2 columns, subtle opposite-direction scroll */}
        <div className="mt-6 sm:mt-8 hidden sm:grid lg:hidden grid-cols-2 gap-4">
          <MarqueeColumn cards={columns2[0]} direction="down" active={inView} />
          <MarqueeColumn cards={columns2[1]} direction="up" active={inView} />
        </div>

        {/* Desktop: 3 columns, subtle opposite-direction scroll */}
        <div className="mt-6 sm:mt-8 hidden lg:grid grid-cols-3 gap-4">
          <MarqueeColumn cards={columns3[0]} direction="down" active={inView} />
          <MarqueeColumn cards={columns3[1]} direction="up" active={inView} />
          <MarqueeColumn cards={columns3[2]} direction="down" active={inView} />
        </div>
      </div>
    </section>
  );
}

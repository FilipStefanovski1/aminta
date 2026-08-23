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
    review: "I kept telling myself I'd batch content on weekends. Never happened. Now I just open Aminta between meetings and fire something off.",
    avatar: "/testimonials/LazarBucan.jpeg",
  },
  {
    id: "p1",
    name: "Victor Saltor",
    role: "Creator",
    review: "Didn't expect to keep using it this much, honestly. Half of my posts these days started from just one random word.",
    avatar: "/testimonials/VictorSaltor.jpeg",
  },
  {
    id: "r2",
    name: "Franka Grazdani",
    role: "COO @ 223 · Co-Founder @ ETH Macedonia",
    review: "Between events and partner calls I don't have much energy left for captions. This just helps me get something out.",
    avatar: "/testimonials/FrankaGrazdani.jpeg",
  },
  {
    id: "r3",
    name: "Filip Najdovski",
    role: "Co-Founder & Deputy CEO · EaseAccess24",
    review: "I don't need another writing tool. I need something that gets words out before I talk myself out of posting, and this does that.",
    avatar: "/testimonials/FilipNajdovski.jpeg",
  },
  {
    id: "r4",
    name: "Marija Ljusheva",
    role: "Startup Community Coordinator @ EGC",
    review: "After a full day of calls with founders, the last thing I want is to write a caption. I type three words and let it finish the thought.",
    avatar: "/testimonials/MarijaLjuseva.jpeg",
  },
  {
    id: "xp1",
    name: "Jha Sundaram",
    role: "Head of Design @ Playground AI | Founder @ ETHBelgium",
    review: "I'm picky about tone so I expected to hate whatever Aminta gave me. Still edit some of it, but it gets me past the blank page every time.",
    avatar: "/testimonials/JhaSundaram.png",
  },
  {
    id: "r6",
    name: "Stefan Savevski",
    role: "COO · RUNSTACK",
    review: "Starting is always the hard part for me, not writing. This gets rid of that first ten minutes of just staring at nothing.",
    avatar: "/testimonials/StefanSavevski.png",
  },
  {
    id: "r5",
    name: "Samuel Naumovski Vickius",
    role: "Executive Director · SMCC",
    review: "You don't have to post daily, just often enough to stay visible. I use Aminta maybe three times a week and that's plenty for me.",
    avatar: "/testimonials/samuel-naumovski.jpeg",
  },
  {
    id: "m1",
    name: "Mila Vukikjevikj",
    role: "Creator",
    review: "I always know what I want to say, just never how to open it. What it writes actually sounds like me, which honestly surprised me.",
    avatar: "/testimonials/MILAX.jpg",
  },
];

// Deterministic PRNG (mulberry32) — never Math.random(). This runs during
// render on both the server and the client; a non-deterministic source would
// produce a different card order each time and break hydration.
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fixed seed — deterministic shuffle order, stable across renders/deploys.
const WALL_SEED = 20260101;

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function normalizePersonName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Safety net, not expected to ever trigger with the current data — collapses
// entries that resolve to the same person even if the source list ever grows
// a near-duplicate entry (typo, re-added testimonial, etc).
function dedupeByPerson(cards: WallCard[]): WallCard[] {
  const seen = new Set<string>();
  const out: WallCard[] = [];
  for (const card of cards) {
    const key = normalizePersonName(card.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  return out;
}

// Round-robin, not contiguous slicing — spreads any length as evenly as
// possible across columns (9 cards / 2 columns = 5/4, not left to slice
// order) and each card belongs to exactly one column, so the same person can
// never be on screen twice at once across columns.
function distributeIntoColumns(cards: WallCard[], columnCount: number): WallCard[][] {
  const columns: WallCard[][] = Array.from({ length: columnCount }, () => []);
  cards.forEach((card, i) => columns[i % columnCount].push(card));
  return columns;
}

// Dev-only assertion, stripped in production builds. Verifies the
// distribution actually held its invariants instead of silently trusting the
// logic above.
function validateColumns(columns: WallCard[][], label: string): void {
  if (process.env.NODE_ENV === "production") return;
  const ownerColumn = new Map<string, number>();
  columns.forEach((col, ci) => {
    col.forEach((card) => {
      const key = normalizePersonName(card.name);
      const prior = ownerColumn.get(key);
      if (prior !== undefined && prior !== ci) {
        console.warn(
          `[MarqueeWall:${label}] "${card.name}" appears in both column ${prior} and column ${ci}`
        );
      }
      ownerColumn.set(key, ci);
    });
  });
  const sizes = columns.map((c) => c.length);
  if (Math.max(...sizes) - Math.min(...sizes) > 1) {
    console.warn(`[MarqueeWall:${label}] unbalanced columns: ${sizes.join(", ")}`);
  }
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
      <p className="mt-3 text-sm leading-relaxed text-[#e8e8ee]">&quot;{card.review}&quot;</p>
    </div>
  );
}

// Only ~9 unique people exist today, split into disjoint per-column groups
// (see distributeIntoColumns) — each column's own loop cycle is therefore
// short (3–5 cards). The window height is capped to that cycle's actual
// rendered height (see windowHeight below) specifically so a column never
// shows its own duplicate-loop copy at the same time as the original — the
// tradeoff is that "several readable cards at once" is bounded by how many
// unique people are in that column, not an arbitrarily tall window. Growing
// the source testimonial list is the only way to raise that ceiling further.
const TARGET_WINDOW_HEIGHT = 560;

function MarqueeColumn({
  cards,
  direction,
  active,
  durationSec,
  phaseOffsetSec = 0,
  groupWindowHeight,
  onMeasureCycle,
}: {
  cards: WallCard[];
  direction: "up" | "down";
  active: boolean;
  durationSec: number;
  // Negative animation-delay — starts this column's track at a different
  // point in its own loop, purely inside the track element. This is how
  // "staggered" columns are achieved without ever moving the outer window's
  // box (a marginTop offset on the container was tried and rejected — it
  // made the row's combined bounding box lopsided and pushed the whole
  // composition off-center within the section).
  phaseOffsetSec?: number;
  // When provided (see MarqueeWall, which computes this per breakpoint
  // group from every sibling column's measured cycle), every column in the
  // row renders at the exact same height — never taller than any single
  // column's own safe cap, so the row reads as one balanced, evenly-topped
  // and evenly-bottomed block instead of a jagged skyline.
  groupWindowHeight?: number;
  onMeasureCycle?: (cycle: number) => void;
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
      const nextCycle = groupHeight + gapPx;
      setCycle(nextCycle);
      onMeasureCycle?.(nextCycle);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(groupEl);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const ready = cycle > 0;
  // This column's own safe cap — never taller than its own single cycle, or
  // its duplicate loop copy would be visible at the same time as the
  // original. The group-shared height (if any) is then clamped to this, so
  // a shorter sibling column can never force a taller one into showing a
  // duplicate.
  const ownCap = ready ? Math.min(TARGET_WINDOW_HEIGHT, cycle) : TARGET_WINDOW_HEIGHT;
  const windowHeight = groupWindowHeight != null ? Math.min(groupWindowHeight, ownCap) : ownCap;

  return (
    <div className="testimonial-col-window" style={{ height: windowHeight }}>
      <div
        ref={trackRef}
        className={`testimonial-track ${direction === "up" ? "testimonial-track-up" : "testimonial-track-down"} ${
          ready && active ? "" : "testimonial-track-paused"
        }`}
        style={
          ready
            ? ({
                "--marquee-cycle": `${cycle}px`,
                "--marquee-duration": `${durationSec}s`,
                animationDelay: `-${phaseOffsetSec}s`,
              } as CSSProperties)
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

// Mobile shows the full deduped set in one column (nothing to split), so a
// fixed px/s speed would take far longer to loop than the shorter desktop/
// tablet columns — a duration target instead keeps it in the requested
// 18–22s band regardless of how many testimonials exist.
const MOBILE_SEC_PER_CARD = 2.2;
const MOBILE_LOOP_DURATION_MIN = 18;
const MOBILE_LOOP_DURATION_MAX = 22;

// Per-column durations/directions/phase-offsets — alternating direction so
// the wall reads as a living composition rather than mirrored strips. All
// durations are slow and linear by design (see .testimonial-track-* in
// globals.css) — smooth, unhurried movement over anything fast enough to
// stutter. Phase offsets (negative animation-delay, see phaseOffsetSec on
// MarqueeColumn) are what create the "staggered" look now — each column
// starts partway through its own loop instead of all three starting
// perfectly in sync — without shifting any column's box position.
const DESKTOP_DURATIONS_SEC = [28, 32, 25];
const DESKTOP_DIRECTIONS: Array<"up" | "down"> = ["down", "up", "down"];
const DESKTOP_PHASE_OFFSET_SEC = [0, 11, 6];

const TABLET_DURATIONS_SEC = [30, 34];
const TABLET_DIRECTIONS: Array<"up" | "down"> = ["down", "up"];
const TABLET_PHASE_OFFSET_SEC = [0, 12];

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

  // One deduped, deterministically-shuffled pool feeds every breakpoint's
  // column split — each split partitions the SAME pool into disjoint groups,
  // so no person is ever assigned to more than one column at a time.
  const shuffled = useMemo(() => seededShuffle(dedupeByPerson(CARDS), WALL_SEED), []);

  const columns3 = useMemo(() => {
    const cols = distributeIntoColumns(shuffled, 3);
    validateColumns(cols, "desktop-3col");
    return cols;
  }, [shuffled]);

  const columns2 = useMemo(() => {
    const cols = distributeIntoColumns(shuffled, 2);
    validateColumns(cols, "tablet-2col");
    return cols;
  }, [shuffled]);

  const mobileLoopDurationSec = Math.min(
    MOBILE_LOOP_DURATION_MAX,
    Math.max(MOBILE_LOOP_DURATION_MIN, shuffled.length * MOBILE_SEC_PER_CARD)
  );

  // Every column in a breakpoint's row reports its own measured cycle here;
  // the row then renders at the smallest of those (see groupWindowHeight on
  // MarqueeColumn) so the whole row is one uniform, evenly-balanced block
  // instead of a jagged skyline of independently-sized columns.
  const [desktopCycles, setDesktopCycles] = useState<number[]>(() => columns3.map(() => 0));
  const [tabletCycles, setTabletCycles] = useState<number[]>(() => columns2.map(() => 0));

  const desktopWindowHeight = useMemo(() => {
    const measured = desktopCycles.filter((c) => c > 0);
    return measured.length > 0 ? Math.min(TARGET_WINDOW_HEIGHT, ...measured) : TARGET_WINDOW_HEIGHT;
  }, [desktopCycles]);

  const tabletWindowHeight = useMemo(() => {
    const measured = tabletCycles.filter((c) => c > 0);
    return measured.length > 0 ? Math.min(TARGET_WINDOW_HEIGHT, ...measured) : TARGET_WINDOW_HEIGHT;
  }, [tabletCycles]);

  return (
    <section ref={sectionRef} id="testimonials" className="relative py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Early feedback from builders.
          </h2>
        </div>

        {/* Gap between heading and the marquee viewport — 40px through 56px
            at the md breakpoint and up, same normal-flow spacing on every
            breakpoint (no absolute positioning, no transforms). */}
        {/* Mobile: single column, full deduped set, no split needed */}
        <div className="mt-10 md:mt-14 sm:hidden">
          <MarqueeColumn cards={shuffled} direction="up" active={inView} durationSec={mobileLoopDurationSec} />
        </div>

        {/* Tablet: 2 disjoint columns, phase-staggered start, opposite directions */}
        <div className="mt-10 md:mt-14 mx-auto hidden sm:grid lg:hidden grid-cols-2 gap-4">
          {columns2.map((cards, i) => (
            <MarqueeColumn
              key={i}
              cards={cards}
              direction={TABLET_DIRECTIONS[i]}
              active={inView}
              durationSec={TABLET_DURATIONS_SEC[i]}
              phaseOffsetSec={TABLET_PHASE_OFFSET_SEC[i]}
              groupWindowHeight={tabletWindowHeight}
              onMeasureCycle={(c) =>
                setTabletCycles((prev) => (prev[i] === c ? prev : prev.map((v, j) => (j === i ? c : v))))
              }
            />
          ))}
        </div>

        {/* Desktop: 3 disjoint columns, phase-staggered start, one uniform row height */}
        <div className="mt-10 md:mt-14 mx-auto hidden lg:grid grid-cols-3 gap-4">
          {columns3.map((cards, i) => (
            <MarqueeColumn
              key={i}
              cards={cards}
              direction={DESKTOP_DIRECTIONS[i]}
              active={inView}
              durationSec={DESKTOP_DURATIONS_SEC[i]}
              phaseOffsetSec={DESKTOP_PHASE_OFFSET_SEC[i]}
              groupWindowHeight={desktopWindowHeight}
              onMeasureCycle={(c) =>
                setDesktopCycles((prev) => (prev[i] === c ? prev : prev.map((v, j) => (j === i ? c : v))))
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}

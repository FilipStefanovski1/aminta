"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import DemonMascot from "./DemonMascot";

interface Stage {
  min: number;
  lv: number;
  name: string;
  speech: string;
  accent: string;
  soft: string;
  glow: string;
  skin: { body: string; horn: string; eye: string };
}

const STAGES: Stage[] = [
  {
    min: 0,
    lv: 1,
    name: "Beginner",
    speech: "hello.",
    accent: "#74a090",
    soft: "rgba(116,160,144,0.14)",
    glow: "rgba(116,160,144,0.45)",
    skin: { body: "#2d3a48", horn: "#1a2230", eye: "#6dbfa0" },
  },
  {
    min: 0.2,
    lv: 2,
    name: "Chill",
    speech: "another post?",
    accent: "#74f7b5",
    soft: "rgba(116,247,181,0.12)",
    glow: "rgba(116,247,181,0.5)",
    skin: { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" },
  },
  {
    min: 0.4,
    lv: 3,
    name: "Happy",
    speech: "we're growing.",
    accent: "#40e898",
    soft: "rgba(64,232,152,0.12)",
    glow: "rgba(64,232,152,0.5)",
    skin: { body: "#169962", horn: "#0d6642", eye: "#9dffd0" },
  },
  {
    min: 0.6,
    lv: 4,
    name: "Excited",
    speech: "+50 XP!",
    accent: "#00c8a8",
    soft: "rgba(0,200,168,0.12)",
    glow: "rgba(0,200,168,0.5)",
    skin: { body: "#0cb889", horn: "#087d5e", eye: "#c8fff0" },
  },
  {
    min: 0.8,
    lv: 5,
    name: "Mischievous",
    speech: "cook again.",
    accent: "#00e0c0",
    soft: "rgba(0,224,192,0.12)",
    glow: "rgba(0,224,192,0.5)",
    skin: { body: "#06d0a8", horn: "#04906e", eye: "#ffffff" },
  },
];

const REWARDS: [string, string][] = [
  ["Tweet", "+50 XP"],
  ["Reply", "+25 XP"],
  ["Polish", "+15 XP"],
  ["Daily Streak", "+100 XP"],
];

const HEADLINE = "Feed Aminta";
const DESC =
  "Every post earns XP. Every reply keeps the streak alive. The AI gets you writing. Aminta gets you coming back.";

function stageFor(p: number): Stage {
  let s = STAGES[0];
  for (const stage of STAGES) if (p >= stage.min) s = stage;
  return s;
}

function accentVars(stage: Stage): CSSProperties {
  return {
    "--accent": stage.accent,
    "--accent-soft": stage.soft,
    "--accent-glow": stage.glow,
    "--color-accent": stage.accent,
    "--color-accent-soft": stage.soft,
  } as CSSProperties;
}

function RewardLegend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[11px] text-muted">
      {REWARDS.map(([label, xp]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-accent/70" />
          {label} <span className="text-accent/80">{xp}</span>
        </span>
      ))}
    </div>
  );
}

function doPlayBlip(ctx: AudioContext) {
  try {
    const now = ctx.currentTime;
    // Two-tone arcade blip
    ([0, 0.08] as const).forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(i === 0 ? 330 : 550, now + offset);
      gain.gain.setValueAtTime(0.06, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
      osc.start(now + offset);
      osc.stop(now + offset + 0.13);
    });
  } catch {
    // blocked — fail silently
  }
}

/** Static fallback for mobile / reduced-motion */
function DemonStatic() {
  const stage = STAGES[STAGES.length - 1];
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        window.dispatchEvent(
          new CustomEvent("demon-stage", {
            detail: e.isIntersecting
              ? { active: true, color: stage.accent }
              : { active: false },
          })
        );
      },
      { threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [stage.accent]);

  return (
    <section
      ref={ref}
      id="feed-aminta"
      style={accentVars(stage)}
      className="py-24 scroll-mt-20 overflow-hidden"
    >
      <div className="mx-auto max-w-2xl px-5 text-center">
        <h2 className="mt-3 font-pixel text-2xl text-white">{HEADLINE}</h2>
        <p className="mt-4 text-sm text-muted leading-relaxed">{DESC}</p>
        <div
          className="mt-10 flex justify-center"
          style={{ filter: "drop-shadow(0 0 16px var(--accent-glow))" }}
        >
          <DemonMascot skin={stage.skin} size={96} />
        </div>
        <p className="mt-4 font-pixel text-xs text-accent">LV.{stage.lv} {stage.name.toUpperCase()}</p>
        <div className="mt-6 h-4 rounded-full bg-panel border border-line overflow-hidden">
          <div className="h-full bg-accent rounded-full" style={{ width: "100%" }} />
        </div>
        <p className="mt-2 font-pixel text-xs text-white">3000 / 3000 XP</p>
        <p className="mt-4 text-sm text-accent font-medium">Demon fed. Streak secured.</p>
      </div>
    </section>
  );
}

/** Scroll-driven version */
function DemonAnimated() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const demonLeft = useTransform(scrollYProgress, [0, 1], ["0%", "86%"]);
  const barWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const demonScale = useTransform(scrollYProgress, [0, 1], [0.92, 1.12]);

  const [xp, setXp] = useState(0);
  const [stage, setStage] = useState<Stage>(STAGES[0]);
  const [done, setDone] = useState(false);

  // Interaction + audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const interactedRef = useRef(false);
  const prevStageLvRef = useRef(STAGES[0].lv);
  const inViewRef = useRef(false);
  const currentStageRef = useRef<Stage>(STAGES[0]);
  const lastDispatchedColorRef = useRef<string | null>(null);

  // Create AudioContext on first user click (browsers require a gesture)
  useEffect(() => {
    const onInteract = () => {
      interactedRef.current = true;
      if (!audioCtxRef.current) {
        try {
          audioCtxRef.current = new AudioContext();
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("click", onInteract);
    return () => window.removeEventListener("click", onInteract);
  }, []);

  // Track section visibility — dispatch demon-stage events to Navbar
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        inViewRef.current = e.isIntersecting;
        if (!e.isIntersecting) {
          lastDispatchedColorRef.current = null;
          window.dispatchEvent(
            new CustomEvent("demon-stage", { detail: { active: false } })
          );
        } else {
          // Section entered view — immediately sync navbar to current stage
          const color = currentStageRef.current.accent;
          lastDispatchedColorRef.current = color;
          window.dispatchEvent(
            new CustomEvent("demon-stage", { detail: { active: true, color } })
          );
        }
      },
      { threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const newStage = stageFor(v);
    currentStageRef.current = newStage;

    // Stage changed — play sound
    if (newStage.lv !== prevStageLvRef.current) {
      prevStageLvRef.current = newStage.lv;
      if (interactedRef.current && audioCtxRef.current) {
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          ctx.resume().then(() => doPlayBlip(ctx));
        } else {
          doPlayBlip(ctx);
        }
      }
    }

    // Dispatch color to Navbar only when it changes
    if (inViewRef.current && newStage.accent !== lastDispatchedColorRef.current) {
      lastDispatchedColorRef.current = newStage.accent;
      window.dispatchEvent(
        new CustomEvent("demon-stage", { detail: { active: true, color: newStage.accent } })
      );
    }

    setXp(Math.round(v * 3000));
    setStage(newStage);
    setDone(v >= 0.985);
  });

  return (
    <section ref={ref} id="feed-aminta" className="relative h-[240vh] scroll-mt-20 overflow-x-clip">
      <div
        style={
          {
            ...accentVars(stage),
            transition:
              "--accent 0.5s, --accent-soft 0.5s, --accent-glow 0.5s",
          } as CSSProperties
        }
        className="sticky top-0 h-screen overflow-hidden flex flex-col items-center justify-center px-5"
      >
        <div className="relative z-10 w-full max-w-3xl mx-auto text-center">
          <h2 className="mt-3 font-pixel text-2xl sm:text-3xl text-white">{HEADLINE}</h2>
          <p className="mt-4 mx-auto max-w-xl text-sm sm:text-base text-muted leading-relaxed">
            {DESC}
          </p>

          {/* demon travel track */}
          <div className="relative mt-12 h-40 w-full">
            <motion.div className="absolute bottom-0 left-0" style={{ left: demonLeft }}>
              {/* pixel speech bubble */}
              <div className="relative -translate-x-1/2 mb-3 ml-7">
                <div
                  className="relative px-3 py-2 whitespace-nowrap"
                  style={{
                    background: "#fff",
                    border: "3px solid #000",
                    boxShadow: "3px 3px 0 #000",
                  }}
                >
                  <span className="font-pixel text-[10px] leading-none text-black">
                    {stage.speech}
                  </span>
                  {/* pixel tail — downward-pointing triangle with black border */}
                  <svg
                    aria-hidden
                    width="12"
                    height="10"
                    viewBox="0 0 12 10"
                    className="pixelated"
                    style={{ position: "absolute", bottom: -13, left: 10 }}
                  >
                    <polygon points="0,0 12,0 6,10" fill="#000" />
                    <polygon points="3,0 9,0 6,6" fill="#fff" />
                  </svg>
                </div>
              </div>

              <motion.div
                style={{ scale: demonScale, filter: "drop-shadow(0 0 16px var(--accent-glow))" }}
              >
                <DemonMascot skin={stage.skin} size={72} />
              </motion.div>
            </motion.div>
          </div>

          {/* XP bar */}
          <div className="mt-6">
            <div className="flex items-end justify-between mb-2">
              <span className="font-pixel text-xs text-accent transition-colors duration-500">
                LV.{stage.lv} {stage.name.toUpperCase()}
              </span>
              <span className="font-pixel text-xs text-white">{xp} / 3000 XP</span>
            </div>
            <div className="h-4 rounded-full bg-panel border border-line overflow-hidden">
              <motion.div
                className="h-full bg-accent rounded-full transition-colors duration-500"
                style={{ width: barWidth, boxShadow: "0 0 16px var(--accent-glow)" }}
              />
            </div>

            <div className="mt-5 h-5">
              {done ? (
                <p className="font-pixel text-xs text-accent">Demon fed. Streak secured.</p>
              ) : (
                <p className="text-xs text-muted">Keep scrolling. Keep feeding.</p>
              )}
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

export default function ScrollDemonProgress() {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 767px)").matches;
    setAnimated(!(reduce || small));
  }, []);

  return animated ? <DemonAnimated /> : <DemonStatic />;
}

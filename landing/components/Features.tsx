"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";
import AmintaSprite from "./AmintaSprite";
import { LEVELS } from "./demon-data";

interface Feature {
  title: string;
  desc: string;
  feedback: string;
  icon: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: "Tweet Generator",
    desc: "Type a topic. Get a post in your voice. No blank-box paralysis. Just output.",
    feedback: "Aminta gains 50 XP.",
    icon: <path d="M12 5v14M5 12h14" strokeWidth="2.2" strokeLinecap="round" />,
  },
  {
    title: "Reply Generator",
    desc: "Pull any tweet, fire back an in-voice reply that adds something. Every reply feeds the demon.",
    feedback: "Reply sent. Demon feeds.",
    icon: <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" strokeWidth="2.2" strokeLinejoin="round" />,
  },
  {
    title: "Tweet Polisher",
    desc: "Rough draft in, sharp banger out. Keeps your voice, just tighter.",
    feedback: "Voice refined.",
    icon: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  {
    title: "Voice Profile",
    desc: "Teach Aminta your niche, tone, and best tweets once. Everything it writes sounds like you.",
    feedback: "Voice locked in.",
    icon: <path d="M12 3a9 9 0 0 0-9 9v4a3 3 0 0 0 3 3h1v-7H5v-0a7 7 0 0 1 14 0v0h-2v7h1a3 3 0 0 0 3-3v-4a9 9 0 0 0-9-9Z" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  {
    title: "Insert into X",
    desc: "One click drops the result straight into the X composer. Post it. Collect the XP.",
    feedback: "Frictionless. Post it now.",
    icon: <path d="M5 12h12m0 0-5-5m5 5-5 5M19 4v16" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: "BYOK API Support",
    desc: "Bring your own key: Groq, OpenRouter, or Gemini. Your key, your cost, your demon.",
    feedback: "Your key. Full control.",
    icon: <path d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  },
];

// ─── XP feed animation constants — adjust freely ─────────────────────────────
const INITIAL_XP = 280    // "XP to next level" displayed at animation start
const XP_TO_NEXT = 400    // total XP span for this level (LV.3 → LV.4)
const GAINS      = [50, 25] as const  // sequence of XP awards per step
const STEP_DELAY = 800    // ms between gain steps
const LOOP_DELAY = 1800   // ms pause before sequence loops

type XpFloat = { id: number; val: number }

function AmintaWidget() {
  const level = LEVELS[2]  // LV.3 Happy
  const next  = LEVELS[3]  // LV.4 Excited

  const startEarned              = XP_TO_NEXT - INITIAL_XP  // 120 XP earned at start
  const [earnedXp, setEarnedXp] = useState(startEarned)
  const [floats,   setFloats]   = useState<XpFloat[]>([])
  const [noTx,     setNoTx]     = useState(false)
  const timer                    = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let earned = startEarned
    let step   = 0

    const tick = () => {
      if (step < GAINS.length) {
        const gain = GAINS[step]
        earned += gain
        const id = Date.now() + step
        setFloats(fs => [...fs, { id, val: gain }])
        setEarnedXp(earned)
        step++
        timer.current = setTimeout(tick, STEP_DELAY)
      } else {
        // End of sequence — pause, then snap back and restart
        timer.current = setTimeout(() => {
          step   = 0
          earned = startEarned
          setNoTx(true)
          setEarnedXp(startEarned)
          // Re-enable transition after the DOM has painted the reset position
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setNoTx(false)
            timer.current = setTimeout(tick, 400)
          }))
        }, LOOP_DELAY)
      }
    }

    timer.current = setTimeout(tick, 700)  // initial delay before first gain
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pct       = Math.min(100, (earnedXp / XP_TO_NEXT) * 100)
  const remaining = XP_TO_NEXT - earnedXp

  return (
    <div
      className="flex items-center gap-4 mx-auto w-fit px-5 py-3"
      style={{
        background: "#1f1f1f",
        border: "2px solid var(--accent)",
        boxShadow: "3px 3px 0 #000, 0 0 18px rgba(116,247,181,0.15)",
      }}
    >
      <AmintaSprite level={level.lv} size={40} interactive={false} />
      <div>
        {/* Title row — floats anchor here and rise out of the top */}
        <div className="flex items-center gap-2" style={{ position: "relative" }}>
          <span className="font-pixel text-[10px] text-accent">LV.{level.lv}</span>
          <span className="font-pixel text-[10px] text-white">{level.name.toUpperCase()}</span>
          {floats.map(f => (
            <span
              key={f.id}
              className="xp-float font-pixel text-[10px]"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                color: "var(--accent)",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
              onAnimationEnd={() => setFloats(fs => fs.filter(x => x.id !== f.id))}
            >
              +{f.val} XP
            </span>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-1.5 h-2 w-36 overflow-hidden" style={{ background: "#111", border: "1px solid #333" }}>
          <div
            className="h-full bg-accent"
            style={{
              width: `${pct}%`,
              boxShadow: "0 0 6px var(--accent)",
              transition: noTx ? "none" : "width 0.45s cubic-bezier(0.25, 0, 0.5, 1)",
            }}
          />
        </div>

        {/* Remaining XP */}
        <p className="mt-1 font-pixel text-[8px]" style={{ color: "var(--accent)", opacity: 0.6 }}>
          {remaining} XP TO LV.{next.lv}
        </p>
      </div>
    </div>
  )
}

export default function Features() {
  return (
    <section id="features" className="relative py-20 md:py-28 scroll-mt-20" style={{ background: "#111" }}>
      <div className="mx-auto max-w-7xl px-5">

        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">Training System</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Every action trains your demon.
          </h2>
        </Reveal>

        <Reveal className="mt-8" delay={80}>
          <AmintaWidget />
        </Reveal>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60}>
              <div
                className="feature-card group h-full p-5 transition-all duration-150 cursor-default
                           hover:-translate-y-0.5 active:translate-y-0.5"
                style={{
                  background: "#1a1a1a",
                  position: "relative",
                }}
              >
                {/* top-left highlight strip */}
                <div className="pointer-events-none absolute inset-0"
                  style={{ boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.05)" }} />

                <span
                  className="inline-flex items-center justify-center w-10 h-10 text-accent"
                  style={{
                    background: "rgba(116,247,181,0.08)",
                    border: "2px solid rgba(116,247,181,0.25)",
                    boxShadow: "2px 2px 0 #000",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    {f.icon}
                  </svg>
                </span>

                <h3 className="mt-4 font-pixel text-sm text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{f.desc}</p>
                <p className="mt-3 font-pixel text-[9px] text-accent opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  ◈ {f.feedback}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

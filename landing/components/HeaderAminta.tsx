"use client";

import { useEffect, useRef, useState } from "react";

// 638×645 — nearly square
const W = 200;
const H = 202;

const LINES = [
  "post something.",
  "feed me a tweet.",
  "your streak is alive.",
  "cook again.",
  "one more. always.",
  "they won't see it coming.",
  "what are we writing?",
  "let's go.",
];

// ─── Audio ────────────────────────────────────────────────────────────────────

const audioCtxRef: { current: AudioContext | null } = { current: null };
let userInteracted = false;

function ensureAudio() {
  if (typeof window === "undefined") return;
  if (!audioCtxRef.current) {
    try { audioCtxRef.current = new AudioContext(); } catch { /* blocked */ }
  }
}

function playChirp() {
  if (!userInteracted) return;
  ensureAudio();
  const ctx = audioCtxRef.current;
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const now = ctx.currentTime;
  [440, 660, 880].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, now + i * 0.055);
    gain.gain.setValueAtTime(0.05, now + i * 0.055);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.09);
    osc.start(now + i * 0.055);
    osc.stop(now + i * 0.055 + 0.1);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HeaderAminta() {
  const [lineIdx, setLineIdx] = useState(0);
  const [bubbleKey, setBubbleKey] = useState(0);
  const [showBubble, setShowBubble] = useState(true);
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const onInteract = () => { userInteracted = true; ensureAudio(); };
    window.addEventListener("click", onInteract);
    window.addEventListener("keydown", onInteract);
    return () => {
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion.current) return;
    const iv = setInterval(() => {
      setShowBubble(false);
      setTimeout(() => {
        setLineIdx(i => (i + 1) % LINES.length);
        setBubbleKey(k => k + 1);
        setShowBubble(true);
        playChirp();
      }, 280);
    }, 3800);
    return () => clearInterval(iv);
  }, []);

  return (
    <>
      <style>{`
        @keyframes headerAmintaFloat {
          0%, 100% {
            transform: perspective(520px) rotateY(10deg) rotateX(3deg) translateY(0px);
            filter:
              drop-shadow(4px 5px 0 rgba(0,0,0,0.85))
              drop-shadow(2px 2px 0 rgba(0,0,0,0.55))
              drop-shadow(0 0 18px rgba(116,247,181,0.4));
          }
          50% {
            transform: perspective(520px) rotateY(6deg) rotateX(1deg) translateY(-10px);
            filter:
              drop-shadow(3px 8px 0 rgba(0,0,0,0.8))
              drop-shadow(1px 3px 0 rgba(0,0,0,0.45))
              drop-shadow(0 0 28px rgba(116,247,181,0.6));
          }
        }
        @keyframes headerBubbleIn {
          0%   { opacity: 0; transform: scale(0.55) translateY(8px); }
          65%  { transform: scale(1.06) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .header-aminta-img {
          animation: headerAmintaFloat 4.2s ease-in-out infinite;
          display: block;
        }
        .header-aminta-bubble {
          animation: headerBubbleIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .header-aminta-img { animation: none !important; filter: none !important; }
        }
      `}</style>

      <div className="relative flex flex-col items-start" style={{ width: W }}>
        {/* Speech bubble — fixed height so layout never shifts */}
        <div
          style={{
            opacity: showBubble ? 1 : 0,
            transition: "opacity 0.22s ease",
            pointerEvents: "none",
            height: 52,
            display: "flex",
            alignItems: "flex-end",
            marginBottom: 10,
          }}
        >
          <div
            key={bubbleKey}
            className="header-aminta-bubble relative"
            style={{
              background: "#fff",
              border: "3px solid #000",
              boxShadow: "3px 3px 0 #000",
              padding: "7px 12px",
              whiteSpace: "nowrap",
            }}
          >
            <span className="font-pixel leading-tight text-black block" style={{ fontSize: 9 }}>
              {LINES[lineIdx]}
            </span>
            <svg
              aria-hidden
              width="12"
              height="10"
              viewBox="0 0 12 10"
              className="pixelated"
              style={{ position: "absolute", bottom: -13, left: 14 }}
            >
              <polygon points="0,0 12,0 6,10" fill="#000" />
              <polygon points="3,0 9,0 6,6" fill="#fff" />
            </svg>
          </div>
        </div>

        <img
          src="/HeaderAminta.png"
          alt="Aminta"
          width={W}
          height={H}
          className="header-aminta-img"
          style={{
            objectFit: "contain",
            width: W,
            height: H,
            imageRendering: "pixelated",
          transform: "scaleX(-1)",
          }}
        />
      </div>
    </>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { LEVELS, levelForXp, type DemonSkin } from "./demon-data";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Mood = "sleeping" | "hungry" | "happy" | "excited" | "angry" | "sad" | "proud" | "mischievous";

export interface AmintaSpriteHandle {
  triggerXPGain: (amount: number) => void;
  triggerLevelUp: (newLevel: number) => void;
}

interface Props {
  level?: number;
  mood?: Mood;
  message?: string;
  xp?: number;
  interactive?: boolean;
  size?: number;
}

// ─── Speech lines ─────────────────────────────────────────────────────────────

const SPEECH: Record<Mood, string[]> = {
  sleeping: ["z z z...", "10 more minutes...", "dreaming of posts...", "...zzz"],
  hungry: ["just one post?", "feed me a tweet!", "need content...", "getting hungry..."],
  happy: ["yay!", "we did it!", "keep going!", "so good!"],
  excited: ["LET'S GO!", "you're on a roll!", "STREAK!", "unstoppable!"],
  angry: ["come back!", "i miss you!", "please post...", "have u forgotten me?"],
  sad: ["it's been a while...", "miss you...", "please come back", ":( 0 posts today"],
  proud: ["we built this.", "look how far we've come", "legendary.", "top content!"],
  mischievous: ["heh heh...", "cook again.", "they won't see it coming", "*smirks*"],
};

const LEVEL_UP_SPEECH = [
  "",                     // lv0 placeholder
  "hello.",               // lv1
  "another post?",        // lv2
  "we're growing.",       // lv3
  "+50 XP!",              // lv4
  "cook again.",          // lv5
  "timeline domination.", // lv6
  "your streak is safe.", // lv7
  "one more post.",       // lv8
  "we built this.",       // lv9
];

// ─── Audio ────────────────────────────────────────────────────────────────────

function getCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ref.current) {
    try { ref.current = new AudioContext(); } catch { return null; }
  }
  return ref.current;
}

function playFeedSound(ctxRef: React.MutableRefObject<AudioContext | null>) {
  const ctx = getCtx(ctxRef);
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const now = ctx.currentTime;
  [330, 550, 770].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, now + i * 0.07);
    gain.gain.setValueAtTime(0.05, now + i * 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.1);
    osc.start(now + i * 0.07); osc.stop(now + i * 0.07 + 0.11);
  });
}

function playLevelUpSound(ctxRef: React.MutableRefObject<AudioContext | null>) {
  const ctx = getCtx(ctxRef);
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const now = ctx.currentTime;
  [220, 330, 440, 660, 880].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, now + i * 0.1);
    gain.gain.setValueAtTime(0.06, now + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.18);
    osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.19);
  });
}

function playClickSound(ctxRef: React.MutableRefObject<AudioContext | null>) {
  const ctx = getCtx(ctxRef);
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(660, now + 0.05);
  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.start(now); osc.stop(now + 0.13);
}

// ─── XP Float ─────────────────────────────────────────────────────────────────

interface XpFloat {
  id: number;
  amount: number;
  x: number;
}

// ─── Particle ─────────────────────────────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
}

// ─── Eye shape per mood ───────────────────────────────────────────────────────

// Returns rows representing eye pixel shape (2×2 block with variation)
type EyeShape = "normal" | "closed" | "angry" | "sad" | "star" | "swirl" | "heart" | "zzz";

function eyeShapeForMood(mood: Mood, blink: boolean): EyeShape {
  if (blink) return "closed";
  switch (mood) {
    case "sleeping": return "zzz";
    case "angry": return "angry";
    case "sad": return "sad";
    case "excited": return "star";
    case "mischievous": return "swirl";
    case "proud": return "star";
    default: return "normal";
  }
}

// Returns mouth pixel data: array of [x, y] relative coords (mouth area starts at x=4 in 16-wide grid)
type MouthShape = "smile" | "open" | "frown" | "flat" | "fang-smile" | "o" | "zigzag";

function mouthForMood(mood: Mood): MouthShape {
  switch (mood) {
    case "sleeping": return "flat";
    case "hungry": return "open";
    case "happy": return "smile";
    case "excited": return "o";
    case "angry": return "frown";
    case "sad": return "frown";
    case "proud": return "smile";
    case "mischievous": return "smile";
  }
}

// ─── Pixel Sprite SVG ─────────────────────────────────────────────────────────

// Base grid: 16 wide, 13 tall — each char maps to a layer
// B=body H=horn .=empty E=eye placeholder M=mouth placeholder
const BASE_ROWS = [
  "...H........H...",
  "..HHB......BHH..",
  "..HHBB....BBHH..",
  "...BBBBBBBBBB...",
  "..BBBBBBBBBBBB..",
  ".BBBBBBBBBBBBBB.",
  ".BB..BBBBBBB..B.",  // eyes at x=3,4 and x=11,12
  ".BB..BBBBBBB..B.",  // eyes row 2
  ".BBBBBBBBBBBBBB.",
  ".BBBB______BBBB.", // mouth placeholder row (6 chars)
  ".BBBB______BBBB.", // mouth row 2
  ".BBBBBBBBBBBBBB.",
  "..BBBBBBBBBBBB..",
];

interface SpriteProps {
  skin: DemonSkin;
  eyeShape: EyeShape;
  mouthShape: MouthShape;
  eyeOffsetX: number; // -1, 0, 1
  eyeOffsetY: number; // -1, 0, 1
  size: number;
  aura?: boolean;
  auraColor?: string;
  hovering?: boolean;
}

function AmintaPixelSprite({ skin, eyeShape, mouthShape, eyeOffsetX, eyeOffsetY, size, aura, auraColor, hovering }: SpriteProps) {
  const COLS = 16;
  const ROWS_COUNT = BASE_ROWS.length;
  const h = (size * ROWS_COUNT) / COLS;

  // Eye pixels: base positions for left eye (rows 6-7, cols 3-4) and right eye (rows 6-7, cols 11-12)
  // eyeOffset shifts the eye "pupil" highlight
  const leftEyeBase = { x: 3, y: 6 };
  const rightEyeBase = { x: 11, y: 6 };

  type PixelRect = { x: number; y: number; w?: number; h?: number; fill: string };
  const pixels: PixelRect[] = [];

  // Body pixels
  BASE_ROWS.forEach((row, y) => {
    row.split("").forEach((ch, x) => {
      // skip eye and mouth placeholder areas
      const isEyeArea = (y === 6 || y === 7) && (x === 3 || x === 4 || x === 11 || x === 12);
      const isMouthArea = (y === 9 || y === 10) && x >= 5 && x <= 10;
      if (isEyeArea || isMouthArea) return;

      let fill: string | null = null;
      if (ch === "B") fill = skin.body;
      else if (ch === "H") fill = skin.horn;
      if (fill) pixels.push({ x, y, fill });
    });
  });

  // Draw eyes based on shape
  function drawEye(bx: number, by: number) {
    const ox = Math.round(eyeOffsetX);
    const oy = Math.round(eyeOffsetY);

    if (eyeShape === "closed" || eyeShape === "zzz") {
      // horizontal line
      pixels.push({ x: bx, y: by + 1, fill: skin.body });
      pixels.push({ x: bx + 1, y: by + 1, fill: skin.body });
      // thin closed line
      pixels.push({ x: bx, y: by + 1, w: 2, h: 0.4, fill: "#0a0a0a" });
    } else if (eyeShape === "angry") {
      // top-cut eye
      pixels.push({ x: bx, y: by, fill: skin.body });
      pixels.push({ x: bx + 1, y: by, fill: "#0a0a0a" });
      pixels.push({ x: bx, y: by + 1, fill: skin.eye });
      pixels.push({ x: bx + 1, y: by + 1, fill: skin.eye });
    } else if (eyeShape === "sad") {
      pixels.push({ x: bx, y: by, fill: skin.body });
      pixels.push({ x: bx + 1, y: by, fill: skin.body });
      pixels.push({ x: bx, y: by + 1, fill: skin.eye });
      pixels.push({ x: bx + 1, y: by + 1, fill: skin.body });
    } else if (eyeShape === "star") {
      pixels.push({ x: bx, y: by, fill: "#ffffff" });
      pixels.push({ x: bx + 1, y: by, fill: skin.eye });
      pixels.push({ x: bx, y: by + 1, fill: skin.eye });
      pixels.push({ x: bx + 1, y: by + 1, fill: "#ffffff" });
    } else if (eyeShape === "swirl") {
      pixels.push({ x: bx, y: by, fill: skin.eye });
      pixels.push({ x: bx + 1, y: by, fill: "#ffffff" });
      pixels.push({ x: bx, y: by + 1, fill: "#0a0a0a" });
      pixels.push({ x: bx + 1, y: by + 1, fill: skin.eye });
    } else {
      // normal: 2×2 eye block, pupil shifts with cursor
      pixels.push({ x: bx, y: by, fill: skin.eye });
      pixels.push({ x: bx + 1, y: by, fill: skin.eye });
      pixels.push({ x: bx, y: by + 1, fill: skin.eye });
      pixels.push({ x: bx + 1, y: by + 1, fill: skin.eye });
      // pupil (dark 1×1)
      const px = bx + (ox > 0 ? 1 : 0);
      const py = by + (oy > 0 ? 1 : 0);
      pixels.push({ x: px, y: py, fill: "#0a0a0a" });
    }
  }

  drawEye(leftEyeBase.x, leftEyeBase.y);
  drawEye(rightEyeBase.x, rightEyeBase.y);

  // Draw mouth
  const mouthY = 9;
  const mouthX = 5;
  if (mouthShape === "smile") {
    // bottom arc
    pixels.push({ x: mouthX, y: mouthY, fill: skin.body });
    pixels.push({ x: mouthX + 1, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 2, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 3, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 4, y: mouthY, fill: skin.body });
    pixels.push({ x: mouthX, y: mouthY + 1, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 4, y: mouthY + 1, fill: "#0a0a0a" });
  } else if (mouthShape === "frown") {
    pixels.push({ x: mouthX, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 4, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 1, y: mouthY + 1, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 2, y: mouthY + 1, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 3, y: mouthY + 1, fill: "#0a0a0a" });
  } else if (mouthShape === "flat") {
    pixels.push({ x: mouthX, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 1, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 2, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 3, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 4, y: mouthY, fill: "#0a0a0a" });
  } else if (mouthShape === "open") {
    pixels.push({ x: mouthX, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 1, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 2, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 3, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 4, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX, y: mouthY + 1, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 1, y: mouthY + 1, fill: "#ffffff" });
    pixels.push({ x: mouthX + 2, y: mouthY + 1, fill: "#ffffff" });
    pixels.push({ x: mouthX + 3, y: mouthY + 1, fill: "#ffffff" });
    pixels.push({ x: mouthX + 4, y: mouthY + 1, fill: "#0a0a0a" });
  } else if (mouthShape === "o") {
    pixels.push({ x: mouthX + 1, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 2, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 3, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX, y: mouthY + 1, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 1, y: mouthY + 1, fill: "#ffffff" });
    pixels.push({ x: mouthX + 2, y: mouthY + 1, fill: "#ffffff" });
    pixels.push({ x: mouthX + 3, y: mouthY + 1, fill: "#ffffff" });
    pixels.push({ x: mouthX + 4, y: mouthY + 1, fill: "#0a0a0a" });
  } else if (mouthShape === "fang-smile") {
    pixels.push({ x: mouthX, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 1, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 2, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 3, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 4, y: mouthY, fill: "#0a0a0a" });
    pixels.push({ x: mouthX, y: mouthY + 1, fill: "#0a0a0a" });
    pixels.push({ x: mouthX + 1, y: mouthY + 1, fill: "#ffffff" });
    pixels.push({ x: mouthX + 3, y: mouthY + 1, fill: "#ffffff" });
    pixels.push({ x: mouthX + 4, y: mouthY + 1, fill: "#0a0a0a" });
  }

  return (
    <svg
      viewBox={`0 0 ${COLS} ${ROWS_COUNT}`}
      width={size}
      height={h}
      className="pixelated select-none"
      role="img"
      aria-label="Aminta pixel companion"
      style={{ filter: aura ? `drop-shadow(0 0 ${size / 8}px ${auraColor ?? "#74f7b5"}) drop-shadow(0 0 ${size / 4}px ${auraColor ?? "#74f7b5"})` : undefined, transition: "filter 0.4s ease" }}
    >
      {pixels.map((p, i) => (
        <rect
          key={i}
          x={p.x}
          y={p.y}
          width={p.w ?? 1.02}
          height={p.h ?? 1.02}
          fill={p.fill}
        />
      ))}
      {hovering && (
        <rect x={0} y={0} width={COLS} height={ROWS_COUNT} fill="white" fillOpacity={0.04} />
      )}
    </svg>
  );
}

// ─── Speech Bubble ────────────────────────────────────────────────────────────

function SpeechBubble({ text, color }: { text: string; color: string }) {
  return (
    <div className="relative px-3 py-2 whitespace-nowrap pointer-events-none"
      style={{ background: "#fff", border: "3px solid #000", boxShadow: "3px 3px 0 #000", marginBottom: 6 }}>
      <span className="font-pixel text-[10px] leading-none text-black block">{text}</span>
      <svg aria-hidden width="12" height="10" viewBox="0 0 12 10" className="pixelated"
        style={{ position: "absolute", bottom: -13, left: 10 }}>
        <polygon points="0,0 12,0 6,10" fill="#000" />
        <polygon points="3,0 9,0 6,6" fill="#fff" />
      </svg>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

let _floatId = 0;
let _particleId = 0;

const AmintaSprite = forwardRef<AmintaSpriteHandle, Props>(function AmintaSprite(
  { level = 1, mood: moodProp = "happy", message, xp = 0, interactive = true, size = 80 },
  ref
) {
  const clampedLevel = Math.max(1, Math.min(9, level));
  const skin = LEVELS[clampedLevel - 1].skin;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const [blink, setBlink] = useState(false);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const [xpFloats, setXpFloats] = useState<XpFloat[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [aura, setAura] = useState(false);
  const [auraColor, setAuraColor] = useState(skin.eye);
  const [speech, setSpeech] = useState<string | null>(message ?? null);
  const [bounce, setBounce] = useState(false);
  const [float, setFloat] = useState(0); // oscillating y offset

  const mood = moodProp;

  // Idle float animation
  useEffect(() => {
    if (reducedMotion.current) return;
    let t = 0;
    const id = setInterval(() => {
      t += 0.05;
      setFloat(Math.sin(t) * 4);
    }, 16);
    return () => clearInterval(id);
  }, []);

  // Blink loop
  useEffect(() => {
    if (reducedMotion.current) return;
    function scheduleBlink() {
      const delay = 2000 + Math.random() * 3000;
      return setTimeout(() => {
        setBlink(true);
        setTimeout(() => {
          setBlink(false);
          timeoutRef.current = scheduleBlink();
        }, 120);
      }, delay);
    }
    const timeoutRef = { current: scheduleBlink() };
    return () => clearTimeout(timeoutRef.current);
  }, []);

  // Cursor tracking
  useEffect(() => {
    if (!interactive || reducedMotion.current) return;
    const el = containerRef.current;
    if (!el) return;

    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 200;
      const ratio = Math.min(dist / maxDist, 1);
      setEyeOffset({ x: (dx / dist) * ratio, y: (dy / dist) * ratio });
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [interactive]);

  // Random idle speech
  useEffect(() => {
    if (!interactive || message) return;
    function scheduleIdleSpeech() {
      const delay = 5000 + Math.random() * 10000;
      return setTimeout(() => {
        const lines = SPEECH[mood];
        setSpeech(lines[Math.floor(Math.random() * lines.length)]);
        timeoutRef.current = setTimeout(() => {
          setSpeech(null);
          timeoutRef.current = scheduleIdleSpeech();
        }, 2500);
      }, delay);
    }
    const timeoutRef = { current: scheduleIdleSpeech() };
    return () => clearTimeout(timeoutRef.current);
  }, [interactive, mood, message]);

  // Sync message prop
  useEffect(() => {
    if (message !== undefined) setSpeech(message);
  }, [message]);

  // XP gain reaction
  const triggerXPGain = useCallback((amount: number) => {
    playFeedSound(audioCtxRef);
    setBounce(true);
    setTimeout(() => setBounce(false), 400);

    const id = ++_floatId;
    const x = 40 + Math.random() * 20;
    setXpFloats((prev) => [...prev, { id, amount, x }]);
    setTimeout(() => setXpFloats((prev) => prev.filter((f) => f.id !== id)), 1200);

    setAura(true);
    setAuraColor(skin.eye);
    setTimeout(() => setAura(false), 800);

    const line = SPEECH.happy[Math.floor(Math.random() * SPEECH.happy.length)];
    setSpeech(`+${amount} XP!`);
    setTimeout(() => setSpeech(null), 1800);
  }, [skin.eye]);

  // Level-up celebration
  const triggerLevelUp = useCallback((newLevel: number) => {
    playLevelUpSound(audioCtxRef);
    setAura(true);
    setAuraColor(LEVELS[Math.min(newLevel - 1, 8)].skin.eye);

    // particle burst
    const newParticles: Particle[] = Array.from({ length: 12 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2;
      return {
        id: ++_particleId,
        x: 50,
        y: 50,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: [skin.eye, "#ffffff", skin.body][Math.floor(Math.random() * 3)],
        size: 4 + Math.random() * 6,
      };
    });
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 800);
    setTimeout(() => setAura(false), 1500);

    const line = LEVEL_UP_SPEECH[Math.min(newLevel, 9)] ?? "LEVEL UP!";
    setSpeech(line);
    setTimeout(() => setSpeech(null), 3000);
  }, [skin.eye, skin.body]);

  useImperativeHandle(ref, () => ({ triggerXPGain, triggerLevelUp }), [triggerXPGain, triggerLevelUp]);

  const eyeShape = eyeShapeForMood(mood, blink);
  const mouthShape = mouthForMood(mood);

  const containerH = (size * BASE_ROWS.length) / 16;

  function handleClick() {
    if (!interactive) return;
    playClickSound(audioCtxRef);
    const lines = SPEECH[mood];
    setSpeech(lines[Math.floor(Math.random() * lines.length)]);
    setTimeout(() => setSpeech(null), 2000);
    setBounce(true);
    setTimeout(() => setBounce(false), 300);
  }

  return (
    <div
      ref={containerRef}
      className="relative inline-flex flex-col items-center"
      style={{ width: size, cursor: interactive ? "pointer" : "default" }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { setHovering(false); setEyeOffset({ x: 0, y: 0 }); }}
      onClick={handleClick}
    >
      {/* Speech bubble */}
      <div
        style={{
          opacity: speech ? 1 : 0,
          transform: speech ? "translateY(0) scale(1)" : "translateY(4px) scale(0.95)",
          transition: "opacity 0.15s ease, transform 0.15s ease",
          pointerEvents: "none",
          minHeight: 32,
        }}
      >
        {speech && <SpeechBubble text={speech} color={skin.eye} />}
      </div>

      {/* Sprite + floats + particles */}
      <div
        className="relative"
        style={{
          width: size,
          height: containerH,
          transform: `translateY(${reducedMotion.current ? 0 : float}px) ${bounce ? "scale(1.08)" : "scale(1)"}`,
          transition: bounce ? "transform 0.08s ease" : "transform 0.05s linear",
        }}
      >
        <AmintaPixelSprite
          skin={skin}
          eyeShape={eyeShape}
          mouthShape={mouthShape}
          eyeOffsetX={eyeOffset.x}
          eyeOffsetY={eyeOffset.y}
          size={size}
          aura={aura}
          auraColor={auraColor}
          hovering={hovering}
        />

        {/* XP floats */}
        {xpFloats.map((f) => (
          <div
            key={f.id}
            className="absolute font-pixel text-[10px] pointer-events-none"
            style={{
              left: `${f.x}%`,
              bottom: "100%",
              transform: "translateX(-50%)",
              color: skin.eye,
              textShadow: `1px 1px 0 #000`,
              animation: "amintaXpFloat 1.1s ease forwards",
            }}
          >
            +{f.amount} XP
          </div>
        ))}

        {/* Particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute pointer-events-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              animation: `amintaParticle 0.75s ease forwards`,
              "--vx": `${p.vx * 40}px`,
              "--vy": `${p.vy * 40}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <style>{`
        @keyframes amintaXpFloat {
          0%   { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.7); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(-6px) scale(1.1); }
          70%  { opacity: 1; transform: translateX(-50%) translateY(-22px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-32px) scale(0.9); }
        }
        @keyframes amintaParticle {
          0%   { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--vx), var(--vy)) scale(0.3); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aminta-sprite-float { transform: none !important; }
        }
      `}</style>
    </div>
  );
});

export default AmintaSprite;

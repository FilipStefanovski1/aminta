"use client";

import { useEffect, useState } from "react";

type EyeState = "center" | "left" | "right" | "blink";

interface Props {
  level: 1 | 2 | 3;
  size?: number;
}

const PALETTES: Record<1 | 2 | 3, { body: string; outline: string; earIn: string; cheek: string }> = {
  1: { body: "#c4dcd6", outline: "#2d5a48", earIn: "#dff0ea", cheek: "#f0a0a0" },
  2: { body: "#64c4b8", outline: "#185a50", earIn: "#c0f0e8", cheek: "#f090a0" },
  3: { body: "#e84828", outline: "#8a1408", earIn: "#ffa030", cheek: "#ff5030" },
};

const SEQ: EyeState[] = [
  "center", "center", "left", "center", "right", "center", "blink", "center",
];
const TIMING = [2200, 350, 2000, 400, 2200, 600, 120, 1600];

export default function AmintaLayeredSprite({ level, size = 120 }: Props) {
  const [sei, setSei] = useState(0);
  const p = PALETTES[level];

  useEffect(() => {
    let idx = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      idx = (idx + 1) % SEQ.length;
      setSei(idx);
      t = setTimeout(tick, TIMING[idx]);
    };
    t = setTimeout(tick, TIMING[0]);
    return () => clearTimeout(t);
  }, []);

  const eyeState = SEQ[sei];
  const dx = eyeState === "left" ? -2 : eyeState === "right" ? 2 : 0;
  const blink = eyeState === "blink";

  // One eye at given center coords
  function Eye({ cx, cy }: { cx: number; cy: number }) {
    return (
      <g>
        {/* Dark border */}
        <rect x={cx - 5} y={cy - 5} width={10} height={10} rx={1} fill={p.outline} />
        {/* Eye white */}
        <rect x={cx - 4} y={cy - 4} width={8} height={8} rx={1} fill="#eceef8" />
        {blink ? (
          <rect x={cx - 4} y={cy - 1} width={8} height={3} fill={p.outline} />
        ) : (
          <>
            {/* Pupil */}
            <rect x={cx - 2 + dx} y={cy - 1} width={4} height={4} fill="#111" />
            {/* Shine */}
            <rect x={cx - 4 + dx} y={cy - 3} width={2} height={2} fill="#fff" />
          </>
        )}
      </g>
    );
  }

  const W = 64, H = 76;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={Math.round(size * H / W)}
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Shadow */}
      <ellipse cx={32} cy={73} rx={16} ry={3} fill="rgba(0,0,0,0.22)" />

      {/* Ears — rendered behind body */}
      <polygon points="13,23 18,5 27,23" fill={p.outline} />
      <polygon points="15,21 18,8 25,21" fill={p.earIn} />
      <polygon points="37,23 46,5 51,23" fill={p.outline} />
      <polygon points="39,21 46,8 49,21" fill={p.earIn} />

      {/* Body */}
      <ellipse cx={32} cy={44} rx={23} ry={22} fill={p.outline} />
      <ellipse cx={32} cy={44} rx={21} ry={20} fill={p.body} />
      {/* Highlight */}
      <ellipse cx={27} cy={36} rx={9} ry={5} fill="#ffffff" fillOpacity={0.18} />

      {/* Cheeks */}
      <ellipse cx={13} cy={45} rx={5} ry={3} fill={p.cheek} fillOpacity={0.45} />
      <ellipse cx={51} cy={45} rx={5} ry={3} fill={p.cheek} fillOpacity={0.45} />

      {/* Feet — rendered on top of body bottom */}
      <rect x={17} y={63} width={10} height={7} rx={3} fill={p.outline} />
      <rect x={37} y={63} width={10} height={7} rx={3} fill={p.outline} />

      {/* Eyes */}
      <Eye cx={22} cy={37} />
      <Eye cx={42} cy={37} />

      {/* Mouth */}
      <rect x={25} y={49} width={14} height={5} rx={2} fill={p.outline} />
      {/* Teeth */}
      <rect x={27} y={50} width={3} height={4} fill="#f4f4f0" />
      <rect x={33} y={50} width={3} height={4} fill="#f4f4f0" />
    </svg>
  );
}

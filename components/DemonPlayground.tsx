"use client";

import { useMemo, useState } from "react";
import DemonMascot from "./DemonMascot";
import {
  LEVELS,
  MAX_XP,
  XP_REWARDS,
  levelForXp,
  nextLevelForXp,
  type XpReward,
} from "./demon-data";

interface FloatToast {
  id: number;
  label: string;
  xp: number;
  color: string;
}

export default function DemonPlayground() {
  const [xp, setXp] = useState(310);
  const [popKey, setPopKey] = useState(0);
  const [floats, setFloats] = useState<FloatToast[]>([]);

  const level = useMemo(() => levelForXp(xp), [xp]);
  const next = useMemo(() => nextLevelForXp(xp), [xp]);

  const progress = next
    ? Math.min(100, ((xp - level.xp) / (next.xp - level.xp)) * 100)
    : 100;

  function feed(reward: XpReward) {
    setXp((x) => Math.min(MAX_XP, x + reward.xp));
    setPopKey((k) => k + 1);
    const id = Date.now() + Math.random();
    setFloats((f) => [...f, { id, label: reward.label, xp: reward.xp, color: reward.color }]);
    window.setTimeout(() => {
      setFloats((f) => f.filter((t) => t.id !== id));
    }, 1100);
  }

  return (
    <div className="grid lg:grid-cols-2 gap-10 items-center">
      {/* Demon + bar */}
      <div className="relative rounded-3xl border border-line bg-panel/70 p-8 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div
          className="absolute left-1/2 top-16 -translate-x-1/2 w-60 h-60 rounded-full blur-[80px] opacity-40"
          style={{ background: level.skin.body }}
        />

        <div className="relative flex flex-col items-center">
          <div className="font-pixel text-xs text-muted mb-4">
            LV.{level.lv} ·{" "}
            <span style={{ color: level.skin.eye }}>{level.name.toUpperCase()}</span>
          </div>

          <div className="relative">
            {/* floating xp toasts */}
            {floats.map((t) => (
              <span
                key={t.id}
                className="rise pointer-events-none absolute left-1/2 -top-2 -translate-x-1/2 font-pixel text-sm whitespace-nowrap"
                style={{ color: t.color }}
              >
                +{t.xp} {t.label}
              </span>
            ))}
            <div
              key={popKey}
              className="pop"
              style={{ filter: `drop-shadow(0 0 24px ${level.skin.body}aa)` }}
            >
              <DemonMascot skin={level.skin} size={190} />
            </div>
          </div>

          {/* XP bar */}
          <div className="w-full max-w-sm mt-8">
            <div className="flex justify-between font-pixel text-[10px] text-muted mb-2">
              <span style={{ color: level.skin.eye }}>{level.name.toUpperCase()}</span>
              <span>
                {xp} / {next ? next.xp : MAX_XP} XP
              </span>
            </div>
            <div className="h-4 rounded-full bg-ink border border-line overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${level.skin.horn}, ${level.skin.eye})`,
                  boxShadow: `0 0 16px ${level.skin.body}`,
                }}
              />
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              {next ? (
                <>
                  <span className="text-white">{next.xp - xp} XP</span> to{" "}
                  <span style={{ color: next.skin.eye }}>{next.name}</span>
                </>
              ) : (
                <span className="text-gold font-semibold">DEMON KING — max evolution reached 👑</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Feed buttons */}
      <div>
        <h3 className="font-pixel text-lg text-white">Feed it. Watch it grow.</h3>
        <p className="mt-3 text-muted text-sm">
          Tap an action to feed Aminta and stack XP — exactly how it works while you post on X.
        </p>

        <div className="mt-6 space-y-3">
          {XP_REWARDS.map((r) => (
            <button
              key={r.label}
              onClick={() => feed(r)}
              className="group w-full flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3.5 hover:border-white/30 hover:-translate-y-0.5 transition-all"
            >
              <span className="flex items-center gap-3">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: r.color, boxShadow: `0 0 10px ${r.color}` }}
                />
                <span className="text-sm text-white">{r.label}</span>
              </span>
              <span
                className="font-pixel text-xs group-hover:scale-110 transition-transform"
                style={{ color: r.color }}
              >
                +{r.xp} XP
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => setXp(0)}
            className="text-xs text-muted hover:text-white underline underline-offset-4"
          >
            Reset demon
          </button>
          <span className="text-xs text-muted">·</span>
          <span className="text-xs text-muted">
            {LEVELS.length} levels to the throne
          </span>
        </div>
      </div>
    </div>
  );
}

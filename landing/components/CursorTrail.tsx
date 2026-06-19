"use client";

import { useEffect, useRef } from "react";

const GRID = 26;
const CELL  = GRID - 3;   // visible cell size (gap between cells)
const MAX   = 48;
const LIFE  = 1100;        // ms a cell lives

interface Particle {
  x: number;
  y: number;
  born: number;
}

export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const particles: Particle[] = [];
    let lastKey = "";
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      const gx = Math.floor(e.clientX / GRID) * GRID;
      const gy = Math.floor(e.clientY / GRID) * GRID;
      const key = `${gx},${gy}`;
      if (key === lastKey) return;
      lastKey = key;
      particles.push({ x: gx, y: gy, born: performance.now() });
      if (particles.length > MAX) particles.splice(0, particles.length - MAX);
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // prune dead particles
      let i = 0;
      while (i < particles.length && now - particles[i].born > LIFE) i++;
      if (i > 0) particles.splice(0, i);

      for (let j = 0; j < particles.length; j++) {
        const p = particles[j];
        const t  = (now - p.born) / LIFE; // 0 → 1
        // pop in fast, linger, then fade
        const a  = t < 0.08
          ? (t / 0.08)              // 0→1 in first 8% (pop in)
          : Math.pow(1 - (t - 0.08) / 0.92, 1.6); // eased fade out
        if (a < 0.005) continue;

        // scale: pop up from 60% to 100%, then stay
        const scale = t < 0.08 ? 0.6 + 0.4 * (t / 0.08) : 1;
        const sz    = CELL * scale;
        const off   = (CELL - sz) / 2;
        const px    = p.x + off + 1.5;
        const py    = p.y + off + 1.5;

        ctx.save();
        ctx.globalAlpha = a;

        // ── dark base fill ──────────────────────────────────────────
        ctx.fillStyle = "rgba(12, 22, 18, 0.7)";
        ctx.fillRect(px, py, sz, sz);

        // ── iridescent gradient overlay ─────────────────────────────
        // top-left = bright mint, bottom-right = indigo/purple
        const grad = ctx.createLinearGradient(px, py, px + sz, py + sz);
        grad.addColorStop(0,    "rgba(116, 247, 181, 0.85)"); // mint
        grad.addColorStop(0.45, "rgba(56,  192, 255, 0.55)"); // sky
        grad.addColorStop(1,    "rgba(106, 140, 255, 0.30)"); // indigo
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, sz, sz);

        // ── top + left edge highlight (glass illusion) ──────────────
        const hiA = Math.min(a * 0.9, 0.75);
        ctx.fillStyle = `rgba(255, 255, 255, ${hiA})`;
        ctx.fillRect(px, py, sz, 1.5);  // top edge
        ctx.fillRect(px, py, 1.5, sz);  // left edge

        // ── glowing border ──────────────────────────────────────────
        ctx.strokeStyle = `rgba(116, 247, 181, ${Math.min(a * 0.9, 0.7)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, sz - 1, sz - 1);

        // ── inner glow spot (top-left corner) ──────────────────────
        const spot = ctx.createRadialGradient(px + 3, py + 3, 0, px + 3, py + 3, sz * 0.6);
        spot.addColorStop(0,   `rgba(200, 255, 230, ${a * 0.5})`);
        spot.addColorStop(1,   "rgba(0,0,0,0)");
        ctx.fillStyle = spot;
        ctx.fillRect(px, py, sz, sz);

        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
}

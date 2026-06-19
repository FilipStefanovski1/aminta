"use client";

import { useEffect, useRef } from "react";

const GRID = 20;
const LIFE = 900; // ms
const MAX  = 36;

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

      let i = 0;
      while (i < particles.length && now - particles[i].born > LIFE) i++;
      if (i > 0) particles.splice(0, i);

      for (const p of particles) {
        const t = (now - p.born) / LIFE;           // 0 → 1
        const a = Math.pow(1 - t, 2);              // ease out²

        if (a < 0.01) continue;

        const sz = GRID - 2;
        const px = p.x + 1;
        const py = p.y + 1;

        ctx.save();
        ctx.globalAlpha = a * 0.72;

        // mint fill — bright, no dark base
        ctx.fillStyle = "#74f7b5";
        ctx.fillRect(px, py, sz, sz);

        // white top-left shine strip
        ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - t)})`;
        ctx.fillRect(px, py, sz, 2);
        ctx.fillRect(px, py, 2, sz);

        // slightly darker bottom-right to give depth
        ctx.fillStyle = `rgba(30,80,60,${0.4 * (1 - t)})`;
        ctx.fillRect(px + sz - 2, py, 2, sz);
        ctx.fillRect(px, py + sz - 2, sz, 2);

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

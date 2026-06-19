"use client";

import { useEffect, useRef } from "react";

const GRID = 24; // must match --grid-size in globals.css
const LIFE = 800;
const MAX  = 40;

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
        const t = (now - p.born) / LIFE;
        const a = Math.pow(1 - t, 1.8);
        if (a < 0.01) continue;

        const sz = GRID - 2;
        const px = p.x + 1.5;
        const py = p.y + 1.5;

        ctx.save();

        // glow
        ctx.shadowColor = "#74f7b5";
        ctx.shadowBlur  = 10 * a;

        // very faint fill so background shows through
        ctx.fillStyle = `rgba(116, 247, 181, ${a * 0.07})`;
        ctx.fillRect(px, py, sz, sz);

        // glowing border
        ctx.strokeStyle = `rgba(116, 247, 181, ${a * 0.9})`;
        ctx.lineWidth   = 1;
        ctx.strokeRect(px, py, sz, sz);

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

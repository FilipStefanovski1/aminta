"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Must match --grid-size in globals.css
const GRID = 24;
const LIFE = 800;
const MAX  = 40;

interface Particle {
  // stored in DOCUMENT coordinates so they stay locked to the CSS background grid
  docX: number;
  docY: number;
  born: number;
}

export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const isMarketingPage = pathname === "/";

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas 2D can't resolve CSS custom properties, so read the resolved value once.
    const accentHex = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#74f7b5";
    const [accentR, accentG, accentB] = [1, 3, 5].map((i) => parseInt(accentHex.slice(i, i + 2), 16));

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
      // Convert viewport mouse position → document position
      // so snapping aligns with the body background-grid (which scrolls with the page)
      const docX = e.clientX + window.scrollX;
      const docY = e.clientY + window.scrollY;

      // Snap to grid in document space
      const gx = Math.floor(docX / GRID) * GRID;
      const gy = Math.floor(docY / GRID) * GRID;

      const key = `${gx},${gy}`;
      if (key === lastKey) return;
      lastKey = key;

      particles.push({ docX: gx, docY: gy, born: performance.now() });
      if (particles.length > MAX) particles.splice(0, particles.length - MAX);
    };

    window.addEventListener("mousemove", onMove, { passive: true });

    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // prune expired
      let i = 0;
      while (i < particles.length && now - particles[i].born > LIFE) i++;
      if (i > 0) particles.splice(0, i);

      for (const p of particles) {
        const t = (now - p.born) / LIFE;
        const a = Math.pow(1 - t, 1.8);
        if (a < 0.01) continue;

        // Convert document coords → current viewport coords for drawing
        const vx = p.docX - window.scrollX;
        const vy = p.docY - window.scrollY;

        ctx.save();
        ctx.shadowColor = accentHex;
        ctx.shadowBlur  = 10 * a;

        // near-transparent fill — background visible through it
        ctx.fillStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${a * 0.07})`;
        ctx.fillRect(vx, vy, GRID, GRID);

        // glowing mint border snapped perfectly to grid
        ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${a * 0.9})`;
        ctx.lineWidth   = 1;
        ctx.strokeRect(vx + 0.5, vy + 0.5, GRID - 1, GRID - 1);

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

  if (!isMarketingPage) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
}

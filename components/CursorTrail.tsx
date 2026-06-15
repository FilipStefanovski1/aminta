"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GRID = 24;
const MINT = "#74f7b5";

interface Cell {
  id: number;
  x: number;
  y: number;
}

export default function CursorTrail() {
  const [cells, setCells] = useState<Cell[]>([]);
  const lastKey = useRef("");
  const idCounter = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    const onMove = (e: MouseEvent) => {
      const x = Math.floor(e.clientX / GRID) * GRID;
      const y = Math.floor(e.clientY / GRID) * GRID;
      const key = `${x},${y}`;
      if (key === lastKey.current) return;
      lastKey.current = key;
      const id = idCounter.current++;
      setCells((prev) => {
        const next = [...prev, { id, x, y }];
        return next.length > 48 ? next.slice(next.length - 48) : next;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const remove = useCallback((id: number) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <div aria-hidden className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {cells.map((cell) => (
        <span
          key={cell.id}
          onAnimationEnd={() => remove(cell.id)}
          className="cell-fade absolute"
          style={{ left: cell.x, top: cell.y, width: GRID, height: GRID, background: MINT }}
        />
      ))}
    </div>
  );
}

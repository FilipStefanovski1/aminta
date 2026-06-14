"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GRID = 24; // must match --grid-size in globals.css
const MINT = "#74f7b5";

interface Cell {
  id: number;
  x: number;
  y: number;
}

/**
 * Lights up the existing background grid cells under the cursor.
 * Snaps to the grid, fills exact GRID×GRID mint cells, fades over 600ms.
 * Scoped to its (relative) parent so cells stay locked to the visible grid.
 */
export default function CursorTrail() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const lastKey = useRef<string>("");
  const idCounter = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    const onMove = (e: MouseEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return;

      const x = Math.floor(relX / GRID) * GRID;
      const y = Math.floor(relY / GRID) * GRID;
      const key = `${x},${y}`;
      if (key === lastKey.current) return;
      lastKey.current = key;

      const id = idCounter.current++;
      setCells((prev) => {
        const next = [...prev, { id, x, y }];
        return next.length > 48 ? next.slice(next.length - 48) : next;
      });
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const remove = useCallback((id: number) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <div ref={wrapRef} aria-hidden className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
      {cells.map((cell) => (
        <span
          key={cell.id}
          onAnimationEnd={() => remove(cell.id)}
          className="cell-fade absolute"
          style={{
            left: cell.x,
            top: cell.y,
            width: GRID,
            height: GRID,
            background: MINT,
          }}
        />
      ))}
    </div>
  );
}

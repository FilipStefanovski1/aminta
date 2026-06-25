"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { label: "HOW IT WORKS", href: "#how-it-works" },
  { label: "FEATURES",     href: "#features" },
  { label: "PRICING",      href: "#pricing" },
  { label: "FAQ",          href: "#faq" },
];

type DemonStageDetail = { active: boolean; color?: string };

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [demonColor, setDemonColor] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const { active, color } = (e as CustomEvent<DemonStageDetail>).detail;
      setDemonColor(active && color ? color : null);
    };
    window.addEventListener("demon-stage", handler);
    return () => window.removeEventListener("demon-stage", handler);
  }, []);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const bgColor = demonColor ?? "#74f7b5";

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 border-b-4 border-black"
      style={{
        backgroundColor: bgColor,
        transition: "background-color 0.5s ease, transform 0.3s ease, opacity 0.3s ease",
        transform: visible ? "translateY(0)" : "translateY(-100%)",
        opacity: visible ? 1 : 0,
      }}
    >
      <nav className="mx-auto max-w-7xl h-20 px-5 flex items-center">
        {/* left: pixel Aminta icon — flex-1 so it matches right side width */}
        <div className="flex-1 flex items-center">
          <a href="#top" aria-label="Aminta" className="flex items-center shrink-0">
            <svg width="34" height="28" viewBox="0 0 16 13" className="pixelated">
              <rect x="2" y="0" width="2" height="3" fill="#0a0a0a" />
              <rect x="12" y="0" width="2" height="3" fill="#0a0a0a" />
              <rect x="3" y="3" width="10" height="9" fill="#0a0a0a" />
              <rect x="4" y="6" width="2" height="2" fill="#74f7b5" />
              <rect x="10" y="6" width="2" height="2" fill="#74f7b5" />
            </svg>
          </a>
        </div>

        {/* center: bracketed links — truly centered */}
        <div className="hidden lg:flex items-center gap-4 xl:gap-6 flex-nowrap">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="font-pixel text-[10px] xl:text-[11px] text-black hover:text-black/60 transition-colors whitespace-nowrap"
            >
              [ {l.label} ]
            </a>
          ))}
        </div>

        {/* right side */}
        <div className="flex-1 flex items-center justify-end gap-4">
          <a
            href="#pricing"
            className="hidden lg:inline-flex items-center rpg-btn-primary text-[10px] px-5 py-2.5"
          >
            Get Aminta →
          </a>
          {/* mobile toggle */}
          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden font-pixel text-base text-black"
          >
            {open ? "[ X ]" : "[ = ]"}
          </button>
        </div>
      </nav>

      {/* mobile / tablet menu */}
      <div
        className="lg:hidden overflow-hidden border-t-4 border-black"
        style={{
          maxHeight: open ? "240px" : "0",
          transition: "max-height 0.22s cubic-bezier(0.22,1,0.36,1), background-color 0.5s ease",
          backgroundColor: bgColor,
        }}
      >
        <div className="px-5 py-4 flex flex-col gap-3">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="font-pixel text-[11px] text-black whitespace-nowrap"
            >
              [ {l.label} ]
            </a>
          ))}
          <a
            href="#pricing"
            onClick={() => setOpen(false)}
            className="font-pixel text-[11px] text-black whitespace-nowrap mt-1"
          >
            [ GET AMINTA → ]
          </a>
        </div>
      </div>
      )}
    </header>
  );
}

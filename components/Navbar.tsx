"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { label: "HOW IT WORKS", href: "#how" },
  { label: "FEATURES", href: "#features" },
  { label: "FEED AMINTA", href: "#demon" },
  { label: "PRICING", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

type DemonStageDetail = { active: boolean; color?: string };

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [demonColor, setDemonColor] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { active, color } = (e as CustomEvent<DemonStageDetail>).detail;
      setDemonColor(active && color ? color : null);
    };
    window.addEventListener("demon-stage", handler);
    return () => window.removeEventListener("demon-stage", handler);
  }, []);

  const bgColor = demonColor ?? "#74f7b5";

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 border-b-4 border-black"
      style={{
        backgroundColor: bgColor,
        transition: "background-color 0.5s ease",
      }}
    >
      <nav className="mx-auto max-w-7xl h-20 px-5 flex items-center justify-between gap-4">
        {/* left: pixel Aminta icon */}
        <a href="#top" aria-label="Aminta" className="flex items-center shrink-0">
          <svg width="34" height="28" viewBox="0 0 16 13" className="pixelated">
            <rect x="2" y="0" width="2" height="3" fill="#0a0a0a" />
            <rect x="12" y="0" width="2" height="3" fill="#0a0a0a" />
            <rect x="3" y="3" width="10" height="9" fill="#0a0a0a" />
            <rect x="4" y="6" width="2" height="2" fill="#74f7b5" />
            <rect x="10" y="6" width="2" height="2" fill="#74f7b5" />
          </svg>
        </a>

        {/* center: bracketed links */}
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

        {/* right: CTA */}
        <a
          href="#pricing"
          className="hidden lg:inline-flex shrink-0 font-pixel text-sm xl:text-base text-black whitespace-nowrap nav-cta"
        >
          Get Aminta
        </a>

        {/* mobile toggle */}
        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
          className="lg:hidden font-pixel text-base text-black"
        >
          {open ? "[ X ]" : "[ = ]"}
        </button>
      </nav>

      {/* mobile / tablet menu */}
      {open && (
        <div
          className="lg:hidden border-t-4 border-black px-5 py-4 flex flex-col gap-3"
          style={{ backgroundColor: bgColor, transition: "background-color 0.5s ease" }}
        >
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
            className="font-pixel text-sm text-black pt-1"
            style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.25)" }}
          >
            Get Aminta →
          </a>
        </div>
      )}
    </header>
  );
}

"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { label: "HOW IT WORKS", href: "#how-it-works" },
  { label: "FEATURES",     href: "#features" },
  { label: "PRICING",      href: "#pricing" },
  { label: "FAQ",          href: "#faq" },
];

type DemonStageDetail = { active: boolean; color?: string };

function ChromeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <circle cx="128" cy="128" r="56" fill="#4285F4"/>
      <circle cx="128" cy="128" r="34" fill="white"/>
      <circle cx="128" cy="128" r="20" fill="#1A73E8"/>
      {/* Red segment */}
      <path d="M128 72 L230 72 A110 110 0 0 1 181 181 Z" fill="#EA4335" opacity="0.9"/>
      {/* Green segment */}
      <path d="M181 181 L75 181 A110 110 0 0 1 26 72 Z" fill="none"/>
      <path d="M128 72 L26 72 A110 110 0 0 0 75 181 Z" fill="#34A853" opacity="0.9"/>
      {/* Yellow segment */}
      <path d="M75 181 L181 181 A110 110 0 0 0 230 72 Z" fill="#FBBC05" opacity="0.9"/>
      <circle cx="128" cy="128" r="34" fill="white"/>
      <circle cx="128" cy="128" r="20" fill="#1A73E8"/>
    </svg>
  )
}

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
      <nav className="mx-auto max-w-7xl h-16 px-5 flex items-center">

        {/* Left: Logo — flex-1 to balance right side */}
        <div className="flex-1 flex items-center">
          <a href="#top" aria-label="Aminta" className="flex items-center shrink-0">
            <svg width="30" height="24" viewBox="0 0 16 13" className="pixelated">
              <rect x="2" y="0" width="2" height="3" fill="#0a0a0a" />
              <rect x="12" y="0" width="2" height="3" fill="#0a0a0a" />
              <rect x="3" y="3" width="10" height="9" fill="#0a0a0a" />
              <rect x="4" y="6" width="2" height="2" fill="#74f7b5" />
              <rect x="10" y="6" width="2" height="2" fill="#74f7b5" />
            </svg>
          </a>
        </div>

        {/* Center: Nav links — truly centered */}
        <div className="hidden lg:flex items-center gap-4 xl:gap-6">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="font-pixel text-[9px] xl:text-[10px] text-black hover:text-black/60 transition-colors whitespace-nowrap"
            >
              [ {l.label} ]
            </a>
          ))}
        </div>

        {/* Right: Sign in · Create account · Get Extension — flex-1 justify-end */}
        <div className="flex-1 hidden lg:flex items-center justify-end gap-3">
          <a
            href="/login"
            className="font-pixel text-[9px] text-black/70 hover:text-black transition-colors whitespace-nowrap"
          >
            Sign in
          </a>
          <a href="/login?mode=create" className="rpg-btn-primary text-[9px] px-4 py-2 whitespace-nowrap">
            Create account
          </a>
          <a
            href="https://chromewebstore.google.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 font-pixel text-[9px] text-black/70 hover:text-black transition-colors whitespace-nowrap border-2 border-black/30 hover:border-black/60 rounded px-3 py-2"
          >
            <ChromeIcon />
            Get Extension
          </a>
        </div>

        {/* Mobile toggle */}
        <div className="lg:hidden ml-auto">
          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="font-pixel text-base text-black"
          >
            {open ? "[ X ]" : "[ = ]"}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        className="lg:hidden overflow-hidden border-t-4 border-black"
        style={{
          maxHeight: open ? "320px" : "0",
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
          <div className="h-px bg-black/20 my-1" />
          <a href="/login" onClick={() => setOpen(false)} className="font-pixel text-[11px] text-black/70 whitespace-nowrap">
            [ SIGN IN ]
          </a>
          <a href="/login?mode=create" onClick={() => setOpen(false)} className="font-pixel text-[11px] text-black whitespace-nowrap">
            [ CREATE ACCOUNT → ]
          </a>
          <a href="https://chromewebstore.google.com" target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="font-pixel text-[11px] text-black/70 whitespace-nowrap">
            [ GET EXTENSION ]
          </a>
        </div>
      </div>
    </header>
  );
}

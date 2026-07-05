"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ANCHORS = [
  { label: "How it works", hash: "how-it-works" },
  { label: "Features",     hash: "features" },
  { label: "Pricing",      hash: "pricing" },
  { label: "FAQ",          hash: "faq" },
];

type DemonStageDetail = { active: boolean; color?: string };

export default function Navbar({ alwaysVisible = false }: { alwaysVisible?: boolean }) {
  const [open, setOpen] = useState(false);
  const [demonColor, setDemonColor] = useState<string | null>(null);
  const [visible, setVisible] = useState(alwaysVisible);
  const [authed, setAuthed] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const LINKS = ANCHORS.map(({ label, hash }) => ({
    label,
    href: isHome ? `#${hash}` : `/#${hash}`,
  }));

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { active, color } = (e as CustomEvent<DemonStageDetail>).detail;
      setDemonColor(active && color ? color : null);
    };
    window.addEventListener("demon-stage", handler);
    return () => window.removeEventListener("demon-stage", handler);
  }, []);

  useEffect(() => {
    if (alwaysVisible) return;
    const onScroll = () => setVisible(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <nav className="mx-auto max-w-7xl h-16 px-6 flex items-center justify-between">

        {/* Left: Logo + nav links */}
        <div className="flex items-center gap-8">
          <a href={isHome ? "#top" : "/"} aria-label="Aminta" className="flex items-center shrink-0">
            <svg width="28" height="22" viewBox="0 0 16 13" className="pixelated">
              <rect x="2" y="0" width="2" height="3" fill="#0a0a0a" />
              <rect x="12" y="0" width="2" height="3" fill="#0a0a0a" />
              <rect x="3" y="3" width="10" height="9" fill="#0a0a0a" />
              <rect x="4" y="6" width="2" height="2" fill="#74f7b5" />
              <rect x="10" y="6" width="2" height="2" fill="#74f7b5" />
            </svg>
          </a>
          <div className="hidden lg:flex items-center gap-6">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href}
                className="font-pixel text-[9px] text-black hover:text-black/60 transition-colors whitespace-nowrap">
                {l.label}
              </a>
            ))}
          </div>
        </div>

        {/* Right: auth-aware CTAs */}
        <div className="hidden lg:flex items-center gap-4 shrink-0">
          {authed ? (
            <>
              <a href="/dashboard" className="rpg-btn-primary whitespace-nowrap" style={{ padding: "6px 14px", fontSize: "9px" }}>
                Dashboard
              </a>
              <a href="https://chromewebstore.google.com" target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 font-pixel text-[9px] text-black/70 hover:text-black transition-colors whitespace-nowrap">
                <img src="/chromelogo.png" alt="Chrome" width={13} height={13} style={{ filter: "invert(1)" }} />
                Get Extension
              </a>
            </>
          ) : (
            <>
              <a href="/login" className="font-pixel text-[9px] text-black/70 hover:text-black transition-colors whitespace-nowrap">
                Sign in
              </a>
              <a href="/login?mode=create" className="rpg-btn-primary whitespace-nowrap" style={{ padding: "6px 14px", fontSize: "9px" }}>
                Get started
              </a>
              <a href="https://chromewebstore.google.com" target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 font-pixel text-[9px] text-black/70 hover:text-black transition-colors whitespace-nowrap">
                <img src="/chromelogo.png" alt="Chrome" width={13} height={13} style={{ filter: "invert(1)" }} />
                Get Extension
              </a>
            </>
          )}
        </div>

        <button aria-label="Toggle menu" onClick={() => setOpen((v) => !v)}
          className="lg:hidden font-pixel text-sm text-black">
          {open ? "[ X ]" : "[ = ]"}
        </button>
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
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="font-pixel text-[10px] text-black whitespace-nowrap">
              {l.label}
            </a>
          ))}
          <div className="h-px bg-black/20 my-1" />
          {authed ? (
            <>
              <a href="/dashboard" onClick={() => setOpen(false)} className="font-pixel text-[10px] text-black whitespace-nowrap">Dashboard</a>
              <a href="https://chromewebstore.google.com" target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="font-pixel text-[10px] text-black/70 whitespace-nowrap">Get Extension</a>
            </>
          ) : (
            <>
              <a href="/login" onClick={() => setOpen(false)} className="font-pixel text-[10px] text-black/70 whitespace-nowrap">Sign in</a>
              <a href="/login?mode=create" onClick={() => setOpen(false)} className="font-pixel text-[10px] text-black whitespace-nowrap">Get started</a>
              <a href="https://chromewebstore.google.com" target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="font-pixel text-[10px] text-black/70 whitespace-nowrap">Get Extension</a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

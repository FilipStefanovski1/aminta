"use client";

import { useState } from "react";
import Reveal from "./Reveal";
import { FAQS } from "./faq-data";

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="w-full text-left rounded-xl border border-line bg-panel px-5 py-4 hover:border-white/20 transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm sm:text-base font-medium text-white">{q}</span>
        <span
          className={`text-accent text-lg leading-none transition-transform ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </div>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] mt-3" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-sm text-muted leading-relaxed">{a}</p>
        </div>
      </div>
    </button>
  );
}

export default function FAQ() {
  return (
    <section id="faq" className="relative py-20 md:py-28 scroll-mt-20">
      <div className="mx-auto max-w-3xl px-5">
        <Reveal className="text-center">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">FAQ</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Questions, answered
          </h2>
        </Reveal>

        <div className="mt-12 space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 50}>
              <Item q={f.q} a={f.a} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import Reveal from "./Reveal";

const FAQS = [
  {
    q: "What is Aminta?",
    a: "An AI side-panel that lives inside X (Twitter). It writes tweets, replies, and polished posts in your own voice, and inserts them straight into the composer. No copy-paste, no extra tabs.",
  },
  {
    q: "What does “feed Aminta” actually mean?",
    a: "Every action you take earns XP: Tweet +50, Reply +25, Polish +15, Thread +75, and a Daily Streak +100. That XP levels up your pixel demon through 9 evolutions, from Dormant Demon all the way to Demon King. It's a fun, sticky reason to keep posting.",
  },
  {
    q: "Do I need my own API key?",
    a: "Yes. Aminta is BYOK (bring your own key). It works with Groq's free tier, OpenRouter, or Google Gemini. You only pay us for the app; the AI usage runs on your own key, which keeps everything cheap and private.",
  },
  {
    q: "Does it work inside X / Twitter?",
    a: "Yes. Aminta docks as a Chrome side panel next to x.com. It can read the tweet you're replying to and insert generated text directly into the X composer.",
  },
  {
    q: "Is my data private?",
    a: "Completely. Your API key, voice profile, and XP all live locally in your browser. There's no Aminta server in the middle. Requests go straight from your browser to your chosen AI provider.",
  },
  {
    q: "What happens if I miss a day?",
    a: "Your streak breaks and the demon starts to fade. It loses its glow until you feed it again. Higher tiers include streak insurance (a freeze) so one busy day doesn't wipe your progress.",
  },
  {
    q: "Which AI models can I use?",
    a: "Anything your provider offers: Llama 3.3, Gemini, GPT, and more via OpenRouter, or fast free models on Groq. Aminta auto-detects your key and routes to the right provider.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yep. Monthly cancels anytime. Annual is billed yearly. Lifetime is a one-time payment. Pay once and feed Aminta forever.",
  },
];

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
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

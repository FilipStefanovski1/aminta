"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import Reveal from "./Reveal";
import { createClient } from "@/lib/supabase/client";
import { CREEM_FOUNDER_URL, CREEM_PRO_URL, EXTENSION_URL } from "@/lib/links";

type BillingMode = "monthly" | "lifetime";

const FREE_PLAN = {
  name: "Free",
  price: "$0",
  billing: "forever",
  description:
    "Start with the essentials. Bring your own API key and generate directly inside X.",
  features: [
    "5 generations / day",
    "Tweet Generator",
    "Reply Generator",
    "Tweet Polisher",
    "Basic Aminta",
    "Voice Profile",
    "Insert into X",
    "BYOK (Groq / Gemini / OpenRouter)",
  ],
  cta: "Get the Extension",
  ctaHref: EXTENSION_URL,
  badge: null,
  highlight: false,
  disabled: false,
};

const PRO_PLAN = {
  name: "Pro",
  price: "$8.99",
  billing: "/ month",
  description:
    "Unlimited posting power for creators who want to show up consistently.",
  features: [
    "Unlimited generations",
    "Aminta DNA",
    "Thread mode (coming soon)",
    "Multiple Amintas (coming soon)",
    "Saved content (coming soon)",
    "Advanced voice controls (coming soon)",
    "Future premium features",
    "Discord community",
  ],
  cta: "Upgrade to Pro",
  ctaHref: CREEM_PRO_URL,
  badge: "PRO",
  highlight: true,
  disabled: false,
};

const FOUNDER_PLAN = {
  name: "Founder",
  price: "$49",
  billing: "once",
  description:
    "Lock lifetime access before subscriptions become the default.",
  features: [
    "Everything in Aminta Pro",
    "Lifetime access",
    "Future premium features included",
    "Founder Discord",
    "Founder badge",
    "Founder wall",
    "Roadmap voting",
    "Early access to new features",
  ],
  cta: "Get Founder Access",
  ctaHref: CREEM_FOUNDER_URL,
  badge: "LIMITED",
  highlight: true,
  disabled: false,
};

function Check({ dim = false }: { dim?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 mt-0.5 ${dim ? "text-muted/40" : "text-accent"}`}
    >
      <path
        d="m5 13 4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

interface CardProps {
  name: string;
  price: string;
  billing: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  badge: string | null;
  highlight: boolean;
  disabled: boolean;
  onCtaClick?: () => void;
}

function CryptoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9h6M9 12h6M9 15h4" />
      <path d="M14 9v2a2 2 0 0 1-2 2" />
    </svg>
  );
}

function PricingCard({
  name,
  price,
  billing,
  description,
  features,
  cta,
  ctaHref,
  badge,
  highlight,
  disabled,
  onCtaClick,
}: CardProps) {
  const isExternal = ctaHref.startsWith("http");
  const locked = disabled && highlight;

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-7 md:p-8 h-full transition-all duration-300 ${
        locked
          ? "border border-line bg-panel/40 opacity-60 grayscale"
          : highlight
            ? "border-2 border-accent bg-panel shadow-[0_0_60px_rgba(116,247,181,0.10),inset_0_1px_0_rgba(116,247,181,0.08)]"
            : "border border-line bg-panel/60"
      }`}
    >
      {highlight && !locked && (
        <div className="absolute -top-px left-1/2 -translate-x-1/2 h-px w-3/4 bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      )}

      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-pixel text-[10px] uppercase tracking-widest text-muted">
          {name}
        </p>
        {badge && (
          <span className={`shrink-0 flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-pixel text-[8px] uppercase tracking-widest ${
            locked ? "border-line bg-white/5 text-muted" : "border-accent/30 bg-accent/10 text-accent"
          }`}>
            {locked && <LockIcon />}
            {badge}
          </span>
        )}
      </div>

      {/* price */}
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`font-pixel text-4xl md:text-5xl leading-none ${locked ? "text-muted" : "text-white"}`}>
          {price}
        </span>
        {billing && (
          <span className="text-sm text-muted">{billing}</span>
        )}
      </div>

      <p className="mt-4 text-sm text-muted leading-relaxed">{description}</p>

      {disabled ? (
        <span
          className="mt-7 flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold border border-line text-muted/50 cursor-not-allowed"
          aria-disabled="true"
        >
          <LockIcon />
          {cta}
        </span>
      ) : (
        <a
          href={ctaHref}
          {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          onClick={onCtaClick}
          className={`mt-7 block text-center rounded-xl py-3 text-sm font-semibold transition-all duration-200 ${
            highlight
              ? "bg-accent text-black hover:brightness-110 shadow-[0_4px_24px_rgba(116,247,181,0.25)]"
              : "border border-line text-white hover:border-accent/40 hover:bg-accent/5"
          }`}
        >
          {cta}
        </a>
      )}

      <ul className="mt-8 space-y-3">
        {features.map((f) => {
          const isSoon = f.includes("(coming soon)")
          const label = isSoon ? f.replace(" (coming soon)", "") : f
          return (
            <li key={f} className="flex items-start gap-2.5">
              <Check dim={locked || isSoon} />
              <span className={`text-sm ${locked || isSoon ? "text-muted/50" : "text-muted"}`}>
                {label}
                {isSoon && <span className="ml-1.5 text-[10px] text-muted/40">soon</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  );
}

export default function Pricing() {
  const [mode, setMode] = useState<BillingMode>("monthly");
  const [userId, setUserId] = useState<string | null>(null);
  const paidPlan = mode === "monthly" ? PRO_PLAN : FOUNDER_PLAN;

  // Tags the Creem checkout with the logged-in user's id so the webhook can
  // match the payment back to this account without relying on the buyer
  // typing the exact same email at checkout as their Aminta login.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);

  const paidCtaHref = userId
    ? `${paidPlan.ctaHref}${paidPlan.ctaHref.includes("?") ? "&" : "?"}metadata[user_id]=${encodeURIComponent(userId)}`
    : paidPlan.ctaHref;

  function handleBillingMode(next: BillingMode) {
    setMode(next);
    posthog.capture("pricing_billing_mode_changed", { mode: next });
  }

  return (
    <section
      id="pricing"
      className="relative py-20 md:py-28 scroll-mt-20 overflow-hidden"
    >

      <div className="relative mx-auto max-w-5xl px-5">
        {/* heading */}
        <Reveal className="text-center">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">
            Pricing
          </p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Simple. No tricks.
          </h2>
        </Reveal>

        {/* billing toggle */}
        <Reveal className="mt-8 flex justify-center">
          <div className="flex items-center rounded-full border border-line bg-panel p-1 gap-0.5">
            <button
              onClick={() => handleBillingMode("monthly")}
              className={`rounded-full px-5 py-2 text-xs font-semibold transition-all duration-200 ${
                mode === "monthly"
                  ? "bg-accent text-black shadow-[0_2px_12px_rgba(116,247,181,0.3)]"
                  : "text-muted hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => handleBillingMode("lifetime")}
              className={`rounded-full px-5 py-2 text-xs font-semibold transition-all duration-200 ${
                mode === "lifetime"
                  ? "bg-accent text-black shadow-[0_2px_12px_rgba(116,247,181,0.3)]"
                  : "text-muted hover:text-white"
              }`}
            >
              Lifetime{" "}
              <span className={mode === "lifetime" ? "opacity-70" : "text-accent"}>
                Best value
              </span>
            </button>
          </div>
        </Reveal>

        {/* cards */}
        <div className="mt-10 grid sm:grid-cols-2 gap-5 items-stretch">
          <Reveal delay={0}>
            <PricingCard {...FREE_PLAN} onCtaClick={() => posthog.capture("pricing_cta_clicked", { plan: "free", billing_mode: mode })} />
          </Reveal>
          <Reveal delay={80}>
            <PricingCard
              key={paidPlan.name}
              {...paidPlan}
              ctaHref={paidCtaHref}
              onCtaClick={() => posthog.capture("pricing_cta_clicked", { plan: paidPlan.name, billing_mode: mode })}
            />
          </Reveal>
        </div>

        <Reveal className="mt-10 text-center">
          <p className="text-xs text-muted">
            Every plan uses your own AI key (Groq, Gemini, or OpenRouter — Groq has a free tier).{" "}
            <span className="text-white/50">Your key stays on your device.</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

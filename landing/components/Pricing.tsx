"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import Reveal from "./Reveal";
import { createClient } from "@/lib/supabase/client";
import { CREEM_FOUNDER_URL, CREEM_PRO_URL, EXTENSION_URL } from "@/lib/links";
import { hasProAccess, type UserSubscriptionState } from "@/lib/entitlements";

const FREE_PLAN = {
  name: "Free",
  price: "$0",
  billing: "forever",
  description:
    "Start free with Included AI. No API key, no setup, generate directly inside X.",
  features: [
    "5 Included AI credits / day",
    "No API key required",
    "Generate, Reply, Polish",
    "Aminta DNA (writing examples + Instincts)",
    "Insert into X",
    "Optional BYOK (Groq / Gemini / OpenRouter)",
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
    "Serious posting power for creators who want to show up consistently.",
  features: [
    "1,000 Included AI credits / month",
    "Everything in Free",
    "Thread Creator — 3 options, one generate",
    "Voice Refresh — weekly Aminta DNA update from your X history",
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
    "Everything in Pro, yours for life, for one payment instead of a subscription.",
  features: [
    "Everything in Pro",
    "Lifetime access — pay once, never billed again",
    "Founder badge",
  ],
  cta: "Get Founder Access",
  ctaHref: CREEM_FOUNDER_URL,
  badge: "LIFETIME",
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
  // True when the logged-in user already has this tier (or better) — swaps
  // the checkout CTA for a "you already have this" state instead of asking
  // an already-paying customer to buy it again.
  ownsThis?: boolean;
  onCtaClick?: () => void;
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
  ownsThis,
  onCtaClick,
}: CardProps) {
  const isExternal = !ownsThis && ctaHref.startsWith("http");
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
        {(badge || ownsThis) && (
          <span className={`shrink-0 flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-pixel text-[8px] uppercase tracking-widest ${
            locked ? "border-line bg-white/5 text-muted" : "border-accent/30 bg-accent/10 text-accent"
          }`}>
            {locked && <LockIcon />}
            {ownsThis ? "Your Plan" : badge}
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

      {ownsThis ? (
        <a
          href="/dashboard"
          onClick={onCtaClick}
          className="mt-7 flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold border border-accent/40 bg-accent/10 text-accent transition-all duration-200 hover:bg-accent/15"
        >
          You already have this, manage in Dashboard
        </a>
      ) : disabled ? (
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
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserSubscriptionState | null>(null);

  // Tags the Creem checkout with the logged-in user's id so the webhook can
  // match the payment back to this account without relying on the buyer
  // typing the exact same email at checkout as their Aminta login. Also
  // fetches plan/subscription_status so an already-paying user isn't shown
  // a checkout button for a plan they already have.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: row } = await supabase
        .from("users")
        .select("plan, subscription_status")
        .eq("id", uid)
        .single();
      if (row) setProfile(row);
    });
  }, []);

  const entitled = hasProAccess(profile ?? {});
  const currentPlan = profile?.plan ?? "free";
  const ownsPro = entitled && (currentPlan === "pro" || currentPlan === "lifetime");
  const ownsFounder = entitled && currentPlan === "lifetime";

  const ctaHrefFor = (plan: typeof PRO_PLAN | typeof FOUNDER_PLAN) =>
    userId
      ? `${plan.ctaHref}${plan.ctaHref.includes("?") ? "&" : "?"}metadata[user_id]=${encodeURIComponent(userId)}`
      : plan.ctaHref;

  return (
    <section
      id="pricing"
      className="relative py-20 md:py-28 scroll-mt-20 overflow-hidden"
    >

      <div className="relative mx-auto max-w-6xl px-5">
        {/* heading */}
        <Reveal className="text-center">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">
            Pricing
          </p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Simple. No tricks.
          </h2>
          {/* Pro and Founder are two different products (a subscription and a
              one-time purchase), not billing-frequency variants of the same
              plan — shown side by side rather than behind a monthly/lifetime
              toggle so that's clear at a glance. */}
          <p className="mt-3 text-sm text-muted">
            Pro is a monthly subscription. Founder is a one-time purchase for lifetime Pro access.
          </p>
        </Reveal>

        {/* cards */}
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          <Reveal delay={0}>
            <PricingCard {...FREE_PLAN} onCtaClick={() => posthog.capture("pricing_cta_clicked", { plan: "free" })} />
          </Reveal>
          <Reveal delay={80}>
            <PricingCard
              {...PRO_PLAN}
              ctaHref={ctaHrefFor(PRO_PLAN)}
              ownsThis={ownsPro}
              onCtaClick={() => posthog.capture("pricing_cta_clicked", { plan: "Pro" })}
            />
          </Reveal>
          <Reveal delay={160}>
            <PricingCard
              {...FOUNDER_PLAN}
              ctaHref={ctaHrefFor(FOUNDER_PLAN)}
              ownsThis={ownsFounder}
              onCtaClick={() => posthog.capture("pricing_cta_clicked", { plan: "Founder" })}
            />
          </Reveal>
        </div>

        <Reveal className="mt-10 text-center">
          <p className="text-xs text-muted">
            Every plan includes Included AI — no API key required. Prefer your own key instead?{" "}
            <span className="text-white/50">Switch to BYOK (Groq, Gemini, or OpenRouter) any time in Settings — it never touches your Aminta credits.</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

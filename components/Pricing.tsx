import Reveal from "./Reveal";

interface Plan {
  name: string;
  price: string;
  period: string;
  status: string;
  statusHighlight?: boolean;
  tagline: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    status: "LIVE NOW",
    statusHighlight: true,
    tagline: "Bring your own API key. Everything runs locally in your browser.",
    features: [
      "Tweet Generator",
      "Reply Generator",
      "Tweet Polisher",
      "Voice Profile",
      "Insert into X",
      "Local Storage",
      "Works directly inside X",
    ],
    cta: "Install Extension",
    ctaHref: "#",
  },
  {
    name: "Pro",
    price: "$9",
    period: "/month",
    status: "COMING SOON",
    tagline: "More modes, progression, and customization — built on what works.",
    features: [
      "Thread Generator",
      "Aminta XP Progression",
      "Streak Tracking",
      "Saved Content",
      "Additional Generation Modes",
      "More Customization",
    ],
    cta: "Join Waitlist",
    ctaHref: "#",
    highlight: true,
  },
  {
    name: "Founder Access",
    price: "$29",
    period: "one-time",
    status: "COMING SOON",
    tagline: "Support the build early. Shape where Aminta goes.",
    features: [
      "Early Supporter Access",
      "Direct Feedback Channel",
      "Roadmap Influence",
      "Founder Recognition",
    ],
    cta: "Become a Founder",
    ctaHref: "#",
  },
];

function Check({ color = "text-accent" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`${color} shrink-0 mt-0.5`}>
      <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Pricing() {
  return (
    <section id="pricing" className="relative py-20 md:py-28 scroll-mt-20 overflow-hidden">
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full bg-violet/10 blur-[130px]" />
      <div className="relative mx-auto max-w-7xl px-5">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">Pricing</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Free to start. No tricks.
          </h2>
          <p className="mt-4 text-muted">
            The free tier is real and fully functional. Bring your own API key and start generating
            today — no payment required.
          </p>
        </Reveal>

        <div className="mt-14 grid lg:grid-cols-3 gap-5 items-start">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 90}>
              <div
                className={`relative h-full rounded-2xl border p-7 transition-all duration-300 ${
                  plan.highlight
                    ? "border-accent bg-panel shadow-[0_0_50px_rgba(43,255,136,0.12)] lg:-translate-y-3"
                    : "border-line bg-panel hover:border-white/20"
                }`}
              >
                {/* status badge */}
                <span
                  className={`inline-block rounded-full px-3 py-0.5 font-pixel text-[9px] mb-4 ${
                    plan.statusHighlight
                      ? "bg-accent text-black"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  {plan.status}
                </span>

                <h3 className="font-pixel text-sm text-white">{plan.name}</h3>
                <div className="mt-4 flex items-end gap-2">
                  <span className="font-pixel text-3xl text-white">{plan.price}</span>
                  <span className="text-muted text-sm mb-1">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{plan.tagline}</p>

                <a
                  href={plan.ctaHref}
                  className={`mt-6 block text-center rounded-xl py-3 font-semibold transition ${
                    plan.highlight
                      ? "btn-shine bg-accent text-black hover:opacity-90"
                      : "border border-line text-white hover:border-accent/50"
                  }`}
                >
                  {plan.cta}
                </a>

                <ul className="mt-7 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-sm text-muted">
                      <Check color={plan.highlight ? "text-accent" : "text-muted"} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 text-center">
          <p className="text-xs text-muted max-w-2xl mx-auto">
            <span className="text-white font-semibold">BYOK required for free tier.</span> Bring a
            Groq (free tier), OpenRouter, or compatible API key. Aminta runs locally in your
            browser — your key and your data never leave your device.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

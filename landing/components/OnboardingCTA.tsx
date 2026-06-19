import Reveal from "./Reveal";

export default function OnboardingCTA() {
  return (
    <section id="get-aminta" className="py-24 md:py-32 overflow-hidden">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <Reveal>
          <h2 className="font-pixel text-2xl sm:text-3xl md:text-4xl text-white leading-snug">
            Need help getting started?{" "}
            <span className="text-accent">Book a free call with me</span>
          </h2>

          <p className="mt-6 text-sm sm:text-base text-muted leading-relaxed">
            30-minute personal onboarding &nbsp;·&nbsp; Setup assistance &nbsp;·&nbsp; Live Q&A &nbsp;·&nbsp; 100% free
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Primary */}
            <a
              href="https://calendly.com/filipstefanovskee/filip-stefanovski-aminta-founder"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-xl bg-accent px-7 py-3.5 font-semibold text-black transition hover:opacity-90 active:scale-95"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Schedule a Call
            </a>

            {/* Secondary */}
            <a
              href="mailto:hello@amintaapp.com"
              className="inline-flex items-center gap-2.5 rounded-xl border-2 border-line px-7 py-3.5 font-semibold text-white transition hover:border-accent/50 hover:text-accent active:scale-95"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <polyline points="2,4 12,13 22,4" />
              </svg>
              Email Me
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

import FooterArtwork from "./FooterArtwork";

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.9 2H22l-7.5 8.6L23 22h-6.9l-5.4-7-6.2 7H1.4l8-9.2L1 2h7l4.9 6.5L18.9 2Zm-2.4 18h1.9L7.6 4H5.6l10.9 16Z" />
    </svg>
  );
}

function IconLinkedIn() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM9 17H6.5v-7H9v7ZM7.75 8.75a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM18 17h-2.5v-3.5c0-1-.02-2.28-1.39-2.28-1.39 0-1.61 1.08-1.61 2.2V17H10v-7h2.4v1.04h.03c.33-.63 1.15-1.29 2.37-1.29 2.54 0 3.2 1.67 3.2 3.84V17Z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <polyline points="2,4 12,13 22,4" />
    </svg>
  );
}

const SOCIALS = [
  { label: "X", href: "https://x.com/amintaapp", icon: <IconX /> },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/amintaapp/", icon: <IconLinkedIn /> },
  { label: "Instagram", href: "https://www.instagram.com/amintaapp/", icon: <IconInstagram /> },
  { label: "Contact", href: "mailto:hello@amintaapp.com", icon: <IconMail /> },
];

const LEGAL = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Refund Policy", href: "/refund-policy" },
];

const LINK_CLASS =
  "text-white/45 hover:text-accent transition-colors duration-150 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

export default function Footer() {
  return (
    <footer className="relative mb-3 sm:mb-4 overflow-hidden rounded-b-2xl border border-line bg-black">
      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-10 sm:pt-12 md:pt-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-6 sm:gap-4">
          {/* left: socials */}
          <div className="order-2 sm:order-1 flex items-center justify-center sm:justify-start gap-5">
            {SOCIALS.map((s) => (
              <a key={s.label} href={s.href} aria-label={s.label} className={LINK_CLASS}>
                {s.icon}
              </a>
            ))}
          </div>

          {/* center: mark only */}
          <div className="order-1 sm:order-2 flex justify-center">
            <a href="#top" aria-label="Aminta home" className={`inline-flex ${LINK_CLASS}`}>
              <svg width="26" height="21" viewBox="0 0 16 13" className="pixelated">
                <rect x="2" y="0" width="2" height="3" fill="currentColor" />
                <rect x="12" y="0" width="2" height="3" fill="currentColor" />
                <rect x="3" y="3" width="10" height="9" fill="currentColor" />
                <rect x="4" y="6" width="2" height="2" fill="#000" />
                <rect x="10" y="6" width="2" height="2" fill="#000" />
              </svg>
            </a>
          </div>

          {/* right: legal */}
          <nav aria-label="Legal" className="order-3 flex items-center justify-center sm:justify-end gap-4">
            {LEGAL.map((l) => (
              <a key={l.href} href={l.href} className={`text-[10px] font-pixel uppercase tracking-wider ${LINK_CLASS}`}>
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {/* cinematic artwork — the lower portion of the panel */}
      <div className="mt-10 sm:mt-12">
        <FooterArtwork />
      </div>
    </footer>
  );
}

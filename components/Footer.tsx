const NAV = [
  { label: "Home", href: "#top" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how" },
  { label: "Feed Aminta", href: "#demon" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.9 2H22l-7.5 8.6L23 22h-6.9l-5.4-7-6.2 7H1.4l8-9.2L1 2h7l4.9 6.5L18.9 2Zm-2.4 18h1.9L7.6 4H5.6l10.9 16Z" />
    </svg>
  );
}

function IconGitHub() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.69c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85.004 1.7.115 2.5.337 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12C22 6.48 17.52 2 12 2Z" />
    </svg>
  );
}

function IconLinkedIn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM9 17H6.5v-7H9v7ZM7.75 8.75a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM18 17h-2.5v-3.5c0-1-.02-2.28-1.39-2.28-1.39 0-1.61 1.08-1.61 2.2V17H10v-7h2.4v1.04h.03c.33-.63 1.15-1.29 2.37-1.29 2.54 0 3.2 1.67 3.2 3.84V17Z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
    </svg>
  );
}

const SOCIALS = [
  { label: "X", href: "#", icon: <IconX /> },
  { label: "GitHub", href: "#", icon: <IconGitHub /> },
  { label: "LinkedIn", href: "#", icon: <IconLinkedIn /> },
  { label: "Instagram", href: "#", icon: <IconInstagram /> },
];

export default function Footer() {
  return (
    <footer className="bg-black border-t border-[#111] py-16 md:py-20 text-center">
      {/* Logo */}
      <a href="#top" className="inline-flex items-center gap-2.5 justify-center group">
        <svg width="28" height="23" viewBox="0 0 16 13" className="pixelated">
          <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
          <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
          <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
          <rect x="4" y="6" width="2" height="2" fill="#0a0a0a" />
          <rect x="10" y="6" width="2" height="2" fill="#0a0a0a" />
        </svg>
        <span className="font-pixel text-base text-white group-hover:text-[#74f7b5] transition-colors">
          Aminta
        </span>
      </a>

      {/* Nav links */}
      <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 px-5">
        {NAV.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="text-sm text-[#666] hover:text-[#74f7b5] transition-colors"
          >
            {l.label}
          </a>
        ))}
      </nav>

      {/* Social icons */}
      <div className="mt-10 flex items-center justify-center gap-7">
        {SOCIALS.map((s) => (
          <a
            key={s.label}
            href={s.href}
            aria-label={s.label}
            className="text-[#444] hover:text-[#74f7b5] transition-colors"
          >
            {s.icon}
          </a>
        ))}
      </div>

      {/* Legal links */}
      <div className="mt-14 flex items-center justify-center gap-5">
        <a href="/privacy" className="text-xs text-[#444] hover:text-[#74f7b5] transition-colors">
          Privacy Policy
        </a>
        <span style={{ color: "#222" }}>·</span>
        <a href="/terms" className="text-xs text-[#444] hover:text-[#74f7b5] transition-colors">
          Terms of Service
        </a>
      </div>

      {/* Copyright */}
      <p className="mt-4 text-xs" style={{ color: "#333" }}>
        © 2026 Aminta. All rights reserved.
      </p>
    </footer>
  );
}

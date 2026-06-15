import Link from "next/link";

const LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Refunds", href: "/refund-policy" },
];

export default function LegalNav() {
  return (
    <header className="sticky top-0 z-50 bg-[#0d0d0f]/95 backdrop-blur-sm border-b border-[#1e1e22]">
      <div className="mx-auto max-w-3xl px-6 h-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group" aria-label="Aminta home">
          <svg width="20" height="16" viewBox="0 0 16 13" className="shrink-0" style={{ imageRendering: "pixelated" }}>
            <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
            <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
            <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
            <rect x="4" y="6" width="2" height="2" fill="#0a0a0a" />
            <rect x="10" y="6" width="2" height="2" fill="#0a0a0a" />
          </svg>
          <span className="font-pixel text-[10px] text-[#555] group-hover:text-[#999] transition-colors">
            Aminta
          </span>
        </Link>

        <nav className="flex items-center gap-5">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-xs text-[#444] hover:text-[#888] transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";

export default function LegalNav() {
  return (
    <header className="sticky top-0 z-50 bg-black border-b-2 border-[#1a1a1a]">
      <div className="mx-auto max-w-7xl px-5 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="Aminta home">
          <svg width="28" height="23" viewBox="0 0 16 13" className="pixelated shrink-0">
            <rect x="2" y="0" width="2" height="3" fill="#74f7b5" />
            <rect x="12" y="0" width="2" height="3" fill="#74f7b5" />
            <rect x="3" y="3" width="10" height="9" fill="#74f7b5" />
            <rect x="4" y="6" width="2" height="2" fill="#0a0a0a" />
            <rect x="10" y="6" width="2" height="2" fill="#0a0a0a" />
          </svg>
          <span className="font-pixel text-sm text-white group-hover:text-[#74f7b5] transition-colors">
            Aminta
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <Link
            href="/privacy"
            className="text-sm text-[#666] hover:text-[#74f7b5] transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-sm text-[#666] hover:text-[#74f7b5] transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/refund-policy"
            className="text-sm text-[#666] hover:text-[#74f7b5] transition-colors"
          >
            Refunds
          </Link>
          <Link
            href="/"
            className="text-sm text-[#74f7b5] hover:text-white transition-colors"
          >
            ← Back to site
          </Link>
        </div>
      </div>
    </header>
  );
}

interface LegalHeroProps {
  title: string;
  effective: string;
  updated: string;
  children?: React.ReactNode;
}

export default function LegalHero({ title, effective, updated, children }: LegalHeroProps) {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-16 sm:pt-20 pb-8 text-center">
      <div className="flex justify-center mb-8">
        <svg width="32" height="26" viewBox="0 0 16 13" style={{ imageRendering: "pixelated" }}>
          <rect x="2" y="0" width="2" height="3" fill="var(--accent)" />
          <rect x="12" y="0" width="2" height="3" fill="var(--accent)" />
          <rect x="3" y="3" width="10" height="9" fill="var(--accent)" />
          <rect x="4" y="6" width="2" height="2" fill="#0a0a0a" />
          <rect x="10" y="6" width="2" height="2" fill="#0a0a0a" />
        </svg>
      </div>

      <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-4">{title}</h1>

      <p className="text-[#555] text-xs mb-8">
        Effective{" "}
        <span className="font-mono text-[#888]">{effective}</span>
        <span className="mx-3 text-[#333]">·</span>
        Updated{" "}
        <span className="font-mono text-[#888]">{updated}</span>
      </p>

      {children && (
        <div className="text-left text-[#888] leading-relaxed text-[0.9375rem]">{children}</div>
      )}
    </div>
  );
}

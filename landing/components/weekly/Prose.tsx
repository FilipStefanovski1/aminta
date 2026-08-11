// Shared typography primitives for Weekly article bodies — keeps every
// edition visually consistent without repeating className strings in each
// content file, and keeps the reading column narrow/editorial rather than
// full-width like the marketing sections elsewhere on the site.
import type { ReactNode } from "react"

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="text-[1.1875rem] leading-relaxed text-[#c9c9d1] font-normal">
      {children}
    </p>
  )
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-12 mb-4 text-[1.375rem] font-semibold text-white scroll-mt-24">
      {children}
    </h2>
  )
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-8 mb-3 text-[1.0625rem] font-semibold text-[#e7e7ef]">
      {children}
    </h3>
  )
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[0.9375rem] leading-[1.75] text-[#a8a8b2]">
      {children}
    </p>
  )
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-4 space-y-2.5">{children}</ul>
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-[#a8a8b2]">
      <span className="text-accent shrink-0 mt-[0.4rem] text-[10px]">&#9632;</span>
      <span>{children}</span>
    </li>
  )
}

export function Quote({ children, cite }: { children: ReactNode; cite?: string }) {
  return (
    <blockquote className="mt-6 border-l-2 border-accent/40 pl-5 py-1">
      <p className="text-[1.0625rem] leading-relaxed text-[#e7e7ef] italic">{children}</p>
      {cite && <cite className="mt-2 block text-xs text-[#666] not-italic">— {cite}</cite>}
    </blockquote>
  )
}

// Editorial aside — used for methodology notes, placeholder-data disclosure,
// or context that isn't the main narrative thread.
export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-[#2a2a2a] bg-[#161616] px-5 py-4">
      <p className="text-[0.875rem] leading-relaxed text-[#8a8a93]">{children}</p>
    </div>
  )
}

export function Divider() {
  return <hr className="my-10 border-t border-[#232323]" />
}

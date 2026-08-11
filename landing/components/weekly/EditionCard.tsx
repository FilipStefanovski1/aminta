import Image from "next/image"
import Link from "next/link"
import type { WeeklyEditionMeta } from "@/content/weekly/types"
import { HERO_IMAGE_WIDTH, HERO_IMAGE_HEIGHT } from "@/content/weekly/types"
import { estimateReadingTimeMinutes } from "@/content/weekly/reading-time"
import type { ComponentType } from "react"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

interface Props {
  meta: WeeklyEditionMeta
  Content: ComponentType
  featured?: boolean
}

export default function EditionCard({ meta, Content, featured = false }: Props) {
  const readingTime = estimateReadingTimeMinutes(<Content />)
  const editionLabel = `EDITION ${String(meta.edition).padStart(3, "0")}`

  if (featured) {
    return (
      <Link
        href={`/weekly/${meta.slug}`}
        className="group block overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#161616] transition-colors hover:border-accent/40"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#111]">
          <Image
            src={meta.heroImage}
            alt={meta.heroImageAlt}
            width={HERO_IMAGE_WIDTH}
            height={HERO_IMAGE_HEIGHT}
            priority
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <div className="p-8 sm:p-10">
          <span className="font-pixel text-[9px] text-accent">{editionLabel} &middot; LATEST</span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-semibold text-white leading-snug group-hover:text-accent transition-colors">
            {meta.title}
          </h2>
          <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-[#9a9aa3]">
            {meta.description}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#666]">
            <span>{meta.author}</span>
            <span aria-hidden>&middot;</span>
            <time dateTime={meta.publishedAt}>{formatDate(meta.publishedAt)}</time>
            <span aria-hidden>&middot;</span>
            <span>{readingTime} min read</span>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={`/weekly/${meta.slug}`}
      className="group block overflow-hidden rounded-xl border border-[#232323] bg-[#141414] transition-colors hover:border-accent/30"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#111]">
        <Image
          src={meta.heroImage}
          alt={meta.heroImageAlt}
          width={HERO_IMAGE_WIDTH}
          height={HERO_IMAGE_HEIGHT}
          loading="lazy"
          sizes="(min-width: 640px) 50vw, 100vw"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="p-6">
        <span className="font-pixel text-[8px] text-[#666]">{editionLabel}</span>
        <h3 className="mt-3 text-[1.0625rem] font-semibold text-white leading-snug group-hover:text-accent transition-colors">
          {meta.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[#8a8a93] line-clamp-2">{meta.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[#555]">
          <span>{meta.author}</span>
          <span aria-hidden>&middot;</span>
          <time dateTime={meta.publishedAt}>{formatDate(meta.publishedAt)}</time>
          <span aria-hidden>&middot;</span>
          <span>{readingTime} min read</span>
        </div>
      </div>
    </Link>
  )
}

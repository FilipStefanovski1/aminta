import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import AuthorBio from "@/components/weekly/AuthorBio"
import WeeklyCTA from "@/components/weekly/WeeklyCTA"
import EditionCard from "@/components/weekly/EditionCard"
import { ArticleSchema } from "@/components/StructuredData"
import { getAdjacentEditions, getEditionBySlug, getPublishedEditions, getRelatedEditions } from "@/content/weekly/registry"
import { estimateReadingTimeMinutes } from "@/content/weekly/reading-time"
import { HERO_IMAGE_WIDTH, HERO_IMAGE_HEIGHT } from "@/content/weekly/types"

const BASE_URL = "https://amintaapp.com"

interface PageProps {
  params: Promise<{ slug: string }>
}

// Static-generates every published edition at build time — the article page
// never depends on client-side JS or a runtime fetch for its primary
// content, and unpublished/draft slugs simply aren't in this list (so they
// 404 rather than render).
export function generateStaticParams(): { slug: string }[] {
  return getPublishedEditions().map((e) => ({ slug: e.meta.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const edition = getEditionBySlug(slug)
  if (!edition) return {}

  const { meta } = edition
  const url = `/weekly/${meta.slug}`
  const ogImageUrl = `${BASE_URL}/weekly/${meta.slug}/opengraph-image`

  return {
    title: `${meta.title} | Aminta Weekly`,
    description: meta.description,
    alternates: { canonical: url },
    authors: [{ name: meta.author }],
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "article",
      url: `${BASE_URL}${url}`,
      publishedTime: meta.publishedAt,
      modifiedTime: meta.updatedAt,
      authors: [meta.author],
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [ogImageUrl],
    },
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

export default async function WeeklyEditionPage({ params }: PageProps) {
  const { slug } = await params
  const edition = getEditionBySlug(slug)
  if (!edition) notFound()

  const { meta, Content } = edition
  const readingTime = estimateReadingTimeMinutes(<Content />)
  const { previous, next } = getAdjacentEditions(meta)
  const related = getRelatedEditions(meta)
  const url = `${BASE_URL}/weekly/${meta.slug}`

  return (
    <>
      <ArticleSchema
        headline={meta.title}
        description={meta.description}
        url={url}
        imageUrl={`${BASE_URL}/weekly/${meta.slug}/opengraph-image`}
        datePublished={meta.publishedAt}
        dateModified={meta.updatedAt}
        authorName={meta.author}
      />
      <Navbar />
      <main className="flex-1 bg-ink">
        <article className="mx-auto max-w-[680px] px-6 pt-32 pb-10">
          <nav aria-label="Breadcrumb" className="text-xs text-[#555]">
            <Link href="/weekly" className="hover:text-[#888] transition-colors">
              Aminta Weekly
            </Link>
          </nav>

          <span className="mt-6 block font-pixel text-[9px] text-accent">
            EDITION {String(meta.edition).padStart(3, "0")}
          </span>
          <h1 className="mt-4 text-[2rem] sm:text-[2.5rem] font-semibold text-white leading-[1.15]">
            {meta.title}
          </h1>
          <p className="mt-4 text-lg text-[#9a9aa3] leading-relaxed">{meta.description}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#666] border-t border-[#232323] pt-5">
            <span className="text-[#999]">{meta.author}</span>
            <span aria-hidden>&middot;</span>
            <time dateTime={meta.publishedAt}>{formatDate(meta.publishedAt)}</time>
            {meta.updatedAt && (
              <>
                <span aria-hidden>&middot;</span>
                <span>Updated {formatDate(meta.updatedAt)}</span>
              </>
            )}
            <span aria-hidden>&middot;</span>
            <span>{readingTime} min read</span>
          </div>

          <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#111]">
            <Image
              src={meta.heroImage}
              alt={meta.heroImageAlt}
              width={HERO_IMAGE_WIDTH}
              height={HERO_IMAGE_HEIGHT}
              priority
              sizes="(min-width: 768px) 680px, 100vw"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="mt-10">
            <Content />
          </div>

          <WeeklyCTA />

          <AuthorBio author={meta.author} />

          {(previous || next) && (
            <nav aria-label="Edition navigation" className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {previous && (
                <Link
                  href={`/weekly/${previous.meta.slug}`}
                  className="rounded-lg border border-[#232323] p-4 hover:border-accent/30 transition-colors"
                >
                  <span className="text-[10px] text-[#555]">&larr; Previous</span>
                  <p className="mt-1 text-sm text-[#ccc] line-clamp-2">{previous.meta.title}</p>
                </Link>
              )}
              {next && (
                <Link
                  href={`/weekly/${next.meta.slug}`}
                  className="rounded-lg border border-[#232323] p-4 hover:border-accent/30 transition-colors sm:text-right"
                >
                  <span className="text-[10px] text-[#555]">Next &rarr;</span>
                  <p className="mt-1 text-sm text-[#ccc] line-clamp-2">{next.meta.title}</p>
                </Link>
              )}
            </nav>
          )}
        </article>

        {related.length > 0 && (
          <div className="mx-auto max-w-5xl px-6 pb-24">
            <h2 className="font-pixel text-[9px] text-[#666] mb-6">RELATED EDITIONS</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {related.map((e) => (
                <EditionCard key={e.meta.slug} meta={e.meta} Content={e.Content} />
              ))}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}

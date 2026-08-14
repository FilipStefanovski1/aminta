import type { Metadata } from "next"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import EditionCard from "@/components/blog/EditionCard"
import { getPublishedEditions } from "@/content/blog/registry"

export const metadata: Metadata = {
  title: "Aminta Blog | What's happening on X",
  description:
    "A weekly look at what's working on X, what's changing, and what we're learning building Aminta, your X companion.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Aminta Blog",
    description: "What's happening on X, what's working, and what we're learning.",
    type: "website",
    url: "https://www.amintaapp.com/blog",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aminta Blog",
    description: "What's happening on X, what's working, and what we're learning.",
  },
}

export default function BlogIndexPage() {
  const editions = getPublishedEditions()
  const [latest, ...rest] = editions

  return (
    <>
      <Navbar />
      <main className="flex-1 bg-ink">
        <div className="mx-auto max-w-5xl px-6 pt-32 pb-24">
          <header className="max-w-2xl">
            <span className="font-pixel text-[9px] text-accent">AMINTA BLOG</span>
            <h1 className="mt-4 text-3xl sm:text-4xl font-semibold text-white leading-tight">
              What&apos;s happening on X, what&apos;s working, and what we&apos;re learning.
            </h1>
          </header>

          {latest && (
            <div className="mt-12">
              <EditionCard meta={latest.meta} Content={latest.Content} featured />
            </div>
          )}

          {rest.length > 0 && (
            <div className="mt-16">
              <h2 className="font-pixel text-[9px] text-[#666] mb-6">PREVIOUS EDITIONS</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {rest.map((e) => (
                  <EditionCard key={e.meta.slug} meta={e.meta} Content={e.Content} />
                ))}
              </div>
            </div>
          )}

          {editions.length === 0 && (
            <p className="mt-12 text-sm text-[#666]">The first edition is on its way.</p>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}

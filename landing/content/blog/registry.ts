// Central registry for blog editions. Adding a new edition means:
// 1) add a file under editions/, 2) add one import + array entry here. No
// route/architecture changes needed. Every read path below filters by
// status === "published", so a "draft" edition can exist in the repo
// without ever reaching the listing page, the sitemap, or being statically
// generated as a route.
import * as edition001 from "./editions/why-ai-posts-are-starting-to-sound-the-same"
import * as edition002 from "./editions/why-replies-matter-on-x"
import * as edition003 from "./editions/what-is-working-on-x-right-now"
import type { EditionMeta, EditionModule } from "./types"

const ALL_EDITIONS: EditionModule[] = [
  { meta: edition001.meta, Content: edition001.default },
  { meta: edition002.meta, Content: edition002.default },
  { meta: edition003.meta, Content: edition003.default },
]

function byEditionDesc(a: EditionModule, b: EditionModule): number {
  return b.meta.edition - a.meta.edition
}

/** Published editions, newest edition number first. */
export function getPublishedEditions(): EditionModule[] {
  return ALL_EDITIONS.filter((e) => e.meta.status === "published").sort(byEditionDesc)
}

/** A single published edition by slug, or undefined (drafts are never returned here either). */
export function getEditionBySlug(slug: string): EditionModule | undefined {
  return ALL_EDITIONS.find((e) => e.meta.slug === slug && e.meta.status === "published")
}

/** The most recently published edition, for homepage featuring. */
export function getLatestEdition(): EditionModule | undefined {
  return getPublishedEditions()[0]
}

/** Previous/next by edition number (not publish date), "next" is the newer edition. */
export function getAdjacentEditions(current: EditionMeta): {
  previous?: EditionModule
  next?: EditionModule
} {
  const published = getPublishedEditions() // newest first
  const index = published.findIndex((e) => e.meta.slug === current.slug)
  if (index === -1) return {}
  return {
    next: index > 0 ? published[index - 1] : undefined,
    previous: index < published.length - 1 ? published[index + 1] : undefined,
  }
}

/** Other published editions sharing at least one tag, ranked by overlap then recency. */
export function getRelatedEditions(current: EditionMeta, limit = 3): EditionModule[] {
  return getPublishedEditions()
    .filter((e) => e.meta.slug !== current.slug)
    .map((e) => ({ edition: e, overlap: e.meta.tags.filter((t) => current.tags.includes(t)).length }))
    .filter((e) => e.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.edition.meta.edition - a.edition.meta.edition)
    .slice(0, limit)
    .map((e) => e.edition)
}

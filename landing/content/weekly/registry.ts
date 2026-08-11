// Central registry for Weekly editions. Adding a new edition each week means:
// 1) add a file under editions/, 2) add one import + array entry here. No
// route/architecture changes needed. Every read path below filters by
// status === "published", so a "draft" edition can exist in the repo
// without ever reaching the listing page, the sitemap, or being statically
// generated as a route.
import * as edition001 from "./editions/why-ai-posts-are-starting-to-sound-the-same"
import * as edition002 from "./editions/why-replies-matter-on-x"
import * as edition003 from "./editions/what-is-working-on-x-right-now"
import type { WeeklyEditionMeta, WeeklyEditionModule } from "./types"

const ALL_EDITIONS: WeeklyEditionModule[] = [
  { meta: edition001.meta, Content: edition001.default },
  { meta: edition002.meta, Content: edition002.default },
  { meta: edition003.meta, Content: edition003.default },
]

function byEditionDesc(a: WeeklyEditionModule, b: WeeklyEditionModule): number {
  return b.meta.edition - a.meta.edition
}

/** Published editions, newest edition number first. */
export function getPublishedEditions(): WeeklyEditionModule[] {
  return ALL_EDITIONS.filter((e) => e.meta.status === "published").sort(byEditionDesc)
}

/** A single published edition by slug, or undefined (drafts are never returned here either). */
export function getEditionBySlug(slug: string): WeeklyEditionModule | undefined {
  return ALL_EDITIONS.find((e) => e.meta.slug === slug && e.meta.status === "published")
}

/** The most recently published edition, for homepage featuring. */
export function getLatestEdition(): WeeklyEditionModule | undefined {
  return getPublishedEditions()[0]
}

/** Previous/next by edition number (not publish date) — "next" is the newer edition. */
export function getAdjacentEditions(current: WeeklyEditionMeta): {
  previous?: WeeklyEditionModule
  next?: WeeklyEditionModule
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
export function getRelatedEditions(current: WeeklyEditionMeta, limit = 3): WeeklyEditionModule[] {
  return getPublishedEditions()
    .filter((e) => e.meta.slug !== current.slug)
    .map((e) => ({ edition: e, overlap: e.meta.tags.filter((t) => current.tags.includes(t)).length }))
    .filter((e) => e.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.edition.meta.edition - a.edition.meta.edition)
    .slice(0, limit)
    .map((e) => e.edition)
}

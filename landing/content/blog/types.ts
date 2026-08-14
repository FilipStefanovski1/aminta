// Blog post content types. Each edition is a small TypeScript module
// (see content/blog/editions/) exporting a typed `meta` object matching
// this shape plus a default-exported `Content` component. Registered in
// registry.ts, nothing here is picked up automatically, which is what
// keeps draft content out of production by default (see EditionMeta.status).
import type { ComponentType } from "react"

export type EditionStatus = "draft" | "published"

export interface EditionMeta {
  /** Sequential edition number, shown as "EDITION 001". Never part of the URL. */
  edition: number
  /** URL slug, descriptive, not "edition-1" or a number. Must be unique. */
  slug: string
  title: string
  /** One- to two-sentence deck/summary, used as the card description and meta description fallback. */
  description: string
  author: string
  /** ISO 8601 date string, e.g. "2026-08-11". */
  publishedAt: string
  /** ISO 8601 date string. Only set when an edition is meaningfully revised after publishing. */
  updatedAt?: string
  tags: string[]
  /** Only "published" editions appear in the listing, sitemap, or are statically generated. */
  status: EditionStatus
  /**
   * Path under /public to the edition's editorial hero artwork, e.g.
   * "/blog/edition-001/ai-writing-sameness.webp". Every published edition
   * must have one, rendered at HERO_IMAGE_WIDTH x HERO_IMAGE_HEIGHT
   * (see below), reused as-is for the /blog card, the article hero, and
   * composited into the per-edition Open Graph image.
   */
  heroImage: string
  /**
   * Describes what the artwork communicates (the idea/metaphor), not a
   * literal restatement of the title and never keyword-stuffed. Read by
   * screen readers; this is the accessible description of the image, not
   * SEO copy.
   */
  heroImageAlt: string
}

export interface EditionModule {
  meta: EditionMeta
  Content: ComponentType
}

// One canonical aspect ratio for every hero image (16:9), reused across the
// /blog featured card, thumbnail previews, the article hero, and the OG
// image background. Keeping this a single shared constant, rather than a
// per-edition width/height pair in the metadata, is deliberate: every
// hero must be generated at this exact size, so there's nothing to get out
// of sync.
export const HERO_IMAGE_WIDTH = 1600
export const HERO_IMAGE_HEIGHT = 900

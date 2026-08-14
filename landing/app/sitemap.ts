import type { MetadataRoute } from "next";
import { getPublishedEditions } from "@/content/blog/registry";

// Must match the hostname production actually serves (www). Listing apex URLs
// here would make every sitemap entry a redirect.
const BASE_URL = "https://www.amintaapp.com";

// Only the public marketing/legal pages, auth, dashboard, and other
// app-only routes don't belong in search results.
const ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticEntries = ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));

  // Draft editions never appear here, getPublishedEditions() filters by
  // status, so an unpublished edition can exist in the repo without ever
  // being indexed.
  const blogEntries: MetadataRoute.Sitemap = getPublishedEditions().map((edition) => ({
    url: `${BASE_URL}/blog/${edition.meta.slug}`,
    lastModified: new Date(edition.meta.updatedAt ?? edition.meta.publishedAt),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...blogEntries];
}

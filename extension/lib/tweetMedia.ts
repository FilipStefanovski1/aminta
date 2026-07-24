// Pure, DOM-independent helpers for turning the raw <img src> list scraped
// from a tweet's DOM into the image URLs actually worth sending to a vision
// model. Kept separate from contents/twitter-bridge.ts (which does the DOM
// scraping) so this logic can be unit tested without a DOM environment.

// X serves actual post media from pbs.twimg.com/media/... — avatars live
// under /profile_images/, and emoji/UI icons aren't on this host at all, so
// this one check is sufficient to exclude all three without special-casing.
const TWEET_MEDIA_RE = /^https:\/\/pbs\.twimg\.com\/media\//

export function isTweetMediaUrl(url: string): boolean {
  return TWEET_MEDIA_RE.test(url)
}

// X image URLs carry a `name=` size variant (e.g. "small", "900x900",
// "large", "4096x4096"). Force the highest practical quality so the model
// sees real detail instead of a thumbnail.
export function normalizeImageUrl(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set("name", "large")
    return u.toString()
  } catch {
    return url
  }
}

// Preserves first-seen order — two different `name=` variants of the same
// image normalize to the same string, so this must run AFTER
// normalizeImageUrl to actually catch those duplicates.
export function dedupeAndCapImages(urls: string[], max = 4): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const url of urls) {
    if (seen.has(url)) continue
    seen.add(url)
    result.push(url)
    if (result.length >= max) break
  }
  return result
}

// The one entry point contents/twitter-bridge.ts actually calls: filter to
// real post media, normalize quality, dedupe, cap at 4 — all in one pass.
export function processTweetImageUrls(rawUrls: string[], max = 4): string[] {
  return dedupeAndCapImages(rawUrls.filter(isTweetMediaUrl).map(normalizeImageUrl), max)
}

// Turning a raw X timeline page into a writing-style corpus.
//
// Pure and dependency-free so the rules are unit-testable without a network
// or a database — the same split extension/lib/replyTargets.ts uses.
//
// The job is to keep posts that show HOW the user writes. Every rule below
// removes text that would either teach nothing (a bare link) or teach
// someone else's voice (a quote-post that is mostly the quoted author).
// Nothing here ranks by topic: what the user writes about is explicitly not
// what this corpus is for.

export interface RawXPost {
  id: string
  text: string
  /** X's referenced_tweets: retweeted | quoted | replied_to */
  referencedTypes?: string[]
  quotedText?: string | null
}

export interface CorpusPost {
  id: string
  text: string
}

/** Target size. More than this adds cost without adding signal. */
export const TARGET_CORPUS = 20

/**
 * Below this a profile would be guesswork. confidenceScore already scales
 * how strongly a thin profile is applied, so this is about not spending an
 * allowance on something meaningless, not about a hard quality cliff.
 */
export const MIN_CORPUS = 8

/**
 * Enough useful posts that a second paid request would not meaningfully
 * improve the profile. Stopping here is what keeps the typical refresh to a
 * single 25-post read.
 */
export const SUFFICIENT_CORPUS = 15

/** Shorter than this carries no structural signal ("gm", "this", "+1"). */
const MIN_POST_CHARS = 40

/** A quote post must be mostly the user's own words to count as their voice. */
const MIN_OWN_SHARE_OF_QUOTE = 0.4

const URL_RE = /https?:\/\/\S+/g
const MENTION_RE = /@\w+/g

/** Text with the parts that aren't authored prose removed. */
export function proseOnly(text: string): string {
  return text.replace(URL_RE, " ").replace(MENTION_RE, " ").replace(/\s+/g, " ").trim()
}

/** Normalized key for near-duplicate detection. */
export function dedupeKey(text: string): string {
  return proseOnly(text).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim()
}

export function isRetweet(p: RawXPost): boolean {
  return (p.referencedTypes ?? []).includes("retweeted")
}

export function isReply(p: RawXPost): boolean {
  return (p.referencedTypes ?? []).includes("replied_to")
}

export function isQuote(p: RawXPost): boolean {
  return (p.referencedTypes ?? []).includes("quoted")
}

/**
 * A quote post counts only when the user actually wrote something
 * substantial around it. Otherwise the "style" learned is the quoted
 * author's, which is exactly the failure this guards against.
 */
export function hasMeaningfulOwnCommentary(p: RawXPost): boolean {
  const own = proseOnly(p.text).length
  if (own < MIN_POST_CHARS) return false
  const quoted = proseOnly(p.quotedText ?? "").length
  if (quoted === 0) return true
  return own / (own + quoted) >= MIN_OWN_SHARE_OF_QUOTE
}

export interface FilterResult {
  corpus: CorpusPost[]
  /** Non-sensitive counts for cost/quality observability. Never text. */
  stats: {
    fetched: number
    retweets: number
    replies: number
    tooShort: number
    linkOnly: number
    duplicates: number
    quoteDominant: number
    used: number
  }
}

/**
 * Deterministic: same input always yields the same corpus, which is what
 * makes the behaviour testable and the cache hash stable.
 *
 * Order is longest-first. Longer posts carry more structural signal per
 * paid read — sentence variety, line breaks, closings — and this is a
 * length heuristic, not a topical one.
 */
export function buildCorpus(posts: RawXPost[], limit: number = TARGET_CORPUS): FilterResult {
  const stats = {
    fetched: posts.length,
    retweets: 0, replies: 0, tooShort: 0,
    linkOnly: 0, duplicates: 0, quoteDominant: 0, used: 0,
  }

  const seen = new Set<string>()
  const kept: CorpusPost[] = []

  for (const p of posts) {
    // X excludes these server-side via exclude=retweets,replies, but a
    // client-side check costs nothing and keeps the function correct on its
    // own terms rather than relying on a query parameter elsewhere.
    if (isRetweet(p)) { stats.retweets++; continue }
    if (isReply(p)) { stats.replies++; continue }

    const prose = proseOnly(p.text)
    if (prose.length === 0) { stats.linkOnly++; continue }
    if (prose.length < MIN_POST_CHARS) { stats.tooShort++; continue }

    if (isQuote(p) && !hasMeaningfulOwnCommentary(p)) { stats.quoteDominant++; continue }

    const key = dedupeKey(p.text)
    if (seen.has(key)) { stats.duplicates++; continue }
    seen.add(key)

    // Store the prose form: URLs and mentions are noise in a style corpus
    // and would otherwise be tokens we pay Gemini to read.
    kept.push({ id: p.id, text: prose })
  }

  kept.sort((a, b) => b.text.length - a.text.length)
  const corpus = kept.slice(0, limit)
  stats.used = corpus.length
  return { corpus, stats }
}

/** Whether a second paid X request is worth making. */
export function needsMorePosts(usefulCount: number): boolean {
  return usefulCount < SUFFICIENT_CORPUS
}

/**
 * The whole second-page decision, in one testable place.
 *
 * A second page is NOT fetched merely because the corpus is short of the
 * 20-post target — 18 useful posts is a fine profile and not worth another
 * paid read. It is fetched only when the corpus is genuinely weak
 * (< SUFFICIENT_CORPUS), a cursor exists, and the hard fetch cap leaves room.
 */
export function shouldFetchSecondPage(
  usefulAfterFirst: number,
  hasNextToken: boolean,
  fetchedSoFar: number,
  maxFetch: number
): boolean {
  return needsMorePosts(usefulAfterFirst) && hasNextToken && fetchedSoFar < maxFetch
}

export function isViableCorpus(usefulCount: number): boolean {
  return usefulCount >= MIN_CORPUS
}

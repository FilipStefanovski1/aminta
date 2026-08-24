// Pure "is this post worth a reply, and which one is best" logic for the
// "Find a post worth replying to" button. Deliberately separated from
// contents/twitter-bridge.ts's DOM scraping so this part — the actual
// decision — can be unit tested without a browser/DOM environment. Ad
// detection and text/image extraction stay in twitter-bridge.ts since
// they're inherently about X's markup, not decision logic.
//
// "Post worth a reply" is a product concept, not just a button label — the
// goal is to surface a genuine reply opportunity, not just walk to the next
// post in the timeline. Ranking here is entirely deterministic/local — no
// model call, so discovery never costs a generation credit (only the reply
// text itself, generated afterward, goes through the normal Reply credit
// path). Scoring combines: relevance to the user's own Topics, how much a
// post actually invites a reply (a real opinion/question/observation vs. a
// bare link or a fragment), and a small, log-scaled bonus for existing
// engagement — never enough on its own to beat a clearly better-matched
// post. Timeline position only ever breaks a near-tie.

export interface ReplyPostData {
  id: string
  author: string
  text: string
  hasImages: boolean
  /** Reaction counts if reliably parsed from the DOM — undefined when unavailable, never guessed. */
  likeCount?: number
  replyCount?: number
}

export interface RankedReplyTarget {
  post: ReplyPostData
  /** One short, user-facing phrase — never a raw score. */
  reason: string
}

const DEFAULT_MIN_TEXT_CHARS = 3

// A post is a genuine reply opportunity unless it's: already picked this
// session, the user's own post, or carries too little usable context (no
// text and no images, or text so short it's not really "context" — e.g. a
// single emoji).
export function isEligibleReplyTarget(
  post: ReplyPostData,
  ownHandle: string | null,
  seenIds: ReadonlySet<string>,
  minTextChars = DEFAULT_MIN_TEXT_CHARS
): boolean {
  if (seenIds.has(post.id)) return false
  if (ownHandle && post.author.toLowerCase() === ownHandle.toLowerCase()) return false
  if (!post.text && !post.hasImages) return false
  if (post.text && post.text.replace(/\s/g, "").length < minTextChars) return false
  return true
}

const URL_RE = /https?:\/\/\S+/gi
const WORD_RE = /[a-z0-9]+/g

function tokenize(text: string): string[] {
  return text.toLowerCase().match(WORD_RE) ?? []
}

// Lightweight keyword overlap, not embeddings — a topic like "AI" or
// "Solana" matching a token in the post is a strong, explainable signal.
// Multi-word topics (e.g. "B2B SaaS") count as a match if ANY of their
// words appear, so a partial match still registers.
function matchedTopics(text: string, topics: readonly string[]): string[] {
  if (topics.length === 0) return []
  const postTokens = new Set(tokenize(text))
  return topics.filter((topic) => tokenize(topic).some((w) => postTokens.has(w)))
}

// How much this post actually invites a reply: real length, a question,
// not just a bare link. Never rewards length for its own sake — capped —
// and explicitly punishes the "link drop" / near-empty shapes that read as
// nothing to respond to.
function conversationPotential(text: string): number {
  const stripped = text.replace(URL_RE, "").trim()
  const words = stripped.split(/\s+/).filter(Boolean)
  const isLinkOnly = words.length === 0 && text.trim().length > 0

  if (isLinkOnly) return -2
  if (words.length === 0) return -2 // no text, no link — nothing to respond to (image-only handled by base eligibility)
  if (words.length <= 2) return -1 // near-fragment
  let score = words.length >= 8 ? 2 : 1
  if (/\?/.test(stripped)) score += 1 // a question is an easy, natural opening
  return Math.min(score, 3)
}

// Combined likes+replies, log-scaled and capped — real activity nudges the
// score without letting a huge account's raw like count dominate a much
// better-matched but smaller post. Replies count double: someone already
// replying is stronger evidence of a live conversation than a like.
function engagementSignal(post: ReplyPostData): number {
  const total = (post.likeCount ?? 0) + (post.replyCount ?? 0) * 2
  if (total <= 0) return 0
  return Math.min(2, Math.log10(total + 1))
}

// Weak, fast-decaying tie-breaker only — never enough to override a real
// relevance or conversation-potential gap. See file header: position must
// not automatically win.
function positionBonus(index: number): number {
  return Math.max(0, 0.3 - index * 0.02)
}

/** Internal score — never surfaced to the user, only used to sort. */
function scoreCandidate(post: ReplyPostData, topics: readonly string[], index: number): number {
  const topicHits = matchedTopics(post.text, topics).length
  return topicHits * 3 + conversationPotential(post.text) + engagementSignal(post) + positionBonus(index)
}

function reasonFor(post: ReplyPostData, topics: readonly string[]): string {
  const matches = matchedTopics(post.text, topics)
  if (matches.length > 0) return `Matches your ${matches.slice(0, 2).join(" + ")} topic${matches.length > 1 ? "s" : ""}`
  if ((post.likeCount ?? 0) + (post.replyCount ?? 0) > 0) return "Active conversation happening"
  if (/\?/.test(post.text)) return "Good discussion opportunity"
  return "Worth replying to"
}

// Ranks every currently-eligible candidate best-first. `posts` order (DOM/
// timeline order) only ever breaks a near-tie via positionBonus — the
// winner must out-score the rest, not simply appear first. Re-ranks on
// every call rather than caching a queue: since `seenIds` only ever grows,
// re-ranking the remaining pool on each "Find Another" naturally returns
// the next-best candidate with no repeats and no separate state to manage.
export function rankReplyTargets(
  posts: readonly ReplyPostData[],
  ownHandle: string | null,
  seenIds: ReadonlySet<string>,
  topics: readonly string[] = []
): RankedReplyTarget[] {
  return posts
    .map((post, index) => ({ post, index }))
    .filter(({ post }) => isEligibleReplyTarget(post, ownHandle, seenIds))
    .map(({ post, index }) => ({ post, score: scoreCandidate(post, topics, index) }))
    .sort((a, b) => b.score - a.score) // stable sort — equal scores keep timeline order
    .map(({ post }) => ({ post, reason: reasonFor(post, topics) }))
}

export function pickNextReplyTarget(
  posts: readonly ReplyPostData[],
  ownHandle: string | null,
  seenIds: ReadonlySet<string>,
  topics: readonly string[] = []
): RankedReplyTarget | null {
  return rankReplyTargets(posts, ownHandle, seenIds, topics)[0] ?? null
}

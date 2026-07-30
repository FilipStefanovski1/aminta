// Pure "is this post worth a reply, and which one is next" logic for the
// "Find a post worth replying to" button. Deliberately separated from
// contents/twitter-bridge.ts's DOM scraping so this part — the actual
// decision — can be unit tested without a browser/DOM environment. Ad
// detection and text/image extraction stay in twitter-bridge.ts since
// they're inherently about X's markup, not decision logic.
//
// "Post worth a reply" is a product concept, not just a button label — the
// goal is to surface a genuine reply opportunity, not just walk to the next
// post in the timeline. v1 is intentionally deterministic — no AI call, just
// the heuristics below (own-post, already-seen, empty, or
// too-short-to-be-context). That's a scope choice, not a ceiling: this is
// the seam where future versions would plug in real scoring — engagement,
// relevance, conversation quality, freshness, the user's own interests — to
// rank candidates instead of just filtering them. Callers
// (contents/twitter-bridge.ts, components/GeneratorPanel.tsx) shouldn't need
// to change when that lands.

export interface ReplyPostData {
  id: string
  author: string
  text: string
  hasImages: boolean
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

// `posts` must already be in timeline (document) order — the first eligible
// entry is simply "the next one," since anything already picked is excluded
// by `seenIds` rather than by position. (This ordering is exactly what
// future scoring would replace with a ranked pick.)
export function pickNextReplyTarget(
  posts: readonly ReplyPostData[],
  ownHandle: string | null,
  seenIds: ReadonlySet<string>
): ReplyPostData | null {
  for (const post of posts) {
    if (isEligibleReplyTarget(post, ownHandle, seenIds)) return post
  }
  return null
}

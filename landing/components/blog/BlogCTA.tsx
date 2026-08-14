import Link from "next/link"

// One tasteful CTA, placed once near the end of an article, never
// interrupting the body copy. Links to the homepage rather than straight to
// signup, since the point is introducing the product, not hard-selling.
export default function BlogCTA() {
  return (
    <div className="mt-14 rounded-2xl border border-accent/25 bg-accent/[0.06] p-7 sm:p-8 text-center">
      <p className="text-lg font-semibold text-white">
        Meet Aminta, your X companion.
      </p>
      <p className="mt-2 text-sm text-[#9a9aa3] max-w-md mx-auto">
        Write posts and replies in your own voice, directly inside X. Free to start.
      </p>
      <Link
        href="/"
        className="rpg-btn-primary inline-flex mt-5"
        style={{ padding: "10px 22px", fontSize: "10px" }}
      >
        See how it works
      </Link>
    </div>
  )
}

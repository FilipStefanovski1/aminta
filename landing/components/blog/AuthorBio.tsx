// Deliberately minimal — no invented credentials, titles, or claims. Just
// who wrote it and where to find them.
export default function AuthorBio({ author }: { author: string }) {
  return (
    <div className="mt-14 flex items-center gap-4 rounded-xl border border-[#232323] bg-[#141414] p-5">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-pixel text-[11px] text-black"
        style={{ backgroundColor: "var(--accent)" }}
        aria-hidden
      >
        {author.split(" ").map((p) => p[0]).join("")}
      </div>
      <div>
        <p className="text-sm font-medium text-white">{author}</p>
        <p className="text-xs text-[#777]">Building Aminta.</p>
      </div>
    </div>
  )
}

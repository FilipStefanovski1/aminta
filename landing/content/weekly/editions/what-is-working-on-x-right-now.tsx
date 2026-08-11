import Link from "next/link"
import type { WeeklyEditionMeta } from "../types"
import { H2, Lead, P } from "@/components/weekly/Prose"

export const meta: WeeklyEditionMeta = {
  edition: 3,
  slug: "what-is-working-on-x-right-now",
  title: "What's Actually Working on X Right Now",
  description:
    "A snapshot of what's changing on X right now, what's confirmed, what's just a pattern we're noticing, and why recognizable voice keeps coming up.",
  author: "Filip Stefanovski",
  publishedAt: "2026-08-11",
  tags: ["x-trends", "ai-writing", "replies", "voice", "building-aminta"],
  status: "published",
  heroImage: "/weekly/edition-003/x-feed-patterns.png",
  heroImageAlt:
    "A scrolling feed where most posts blur past while a few remain sharp and distinct.",
}

export default function Content() {
  return (
    <>
      <Lead>
        I&apos;ve been paying attention to what actually makes me stop scrolling on X lately. This
        isn&apos;t an attempt to reverse-engineer the algorithm, nobody writing confidently about
        that online actually has access to it. It&apos;s closer to a running list: here&apos;s
        what I&apos;m noticing, here&apos;s what X has actually confirmed, here&apos;s what I think
        is interesting about it.
      </Lead>

      <H2 id="the-one-confirmed-change">The one thing X actually confirmed</H2>
      <P>
        In July 2026,{" "}
        <a
          href="https://techcrunch.com/2026/07/13/x-just-tweaked-its-algorithm-to-make-it-more-friendly-less-battleground/"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          TechCrunch reported
        </a>{" "}
        that X changed its algorithm to surface more posts from &quot;mutuals,&quot; people you
        follow who follow you back, specifically inside reply sections. Nikita Bier, X&apos;s head
        of product, said the missing signal had made replies &quot;feel more like a battleground
        with people you don&apos;t recognize.&quot; That&apos;s a real, dated, on-record change.
        Everything past this point is my read, not something X has announced.
      </P>

      <H2 id="writing-that-sounds-like-a-person">Writing that still sounds like a person</H2>
      <P>
        Around the same time, a dictionary named &quot;AI slop&quot; its word of the year, which
        tells you how mainstream the complaint about generic content has gotten. I wrote a full
        edition on why that happens and what actually causes it, worth reading on its own:{" "}
        <Link
          href="/weekly/why-ai-posts-are-starting-to-sound-the-same"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          Why So Much AI Writing Sounds the Same
        </Link>
        . Short version here: it&apos;s easier than ever to spot writing that sounds like an
        average of everyone instead of a specific person, and people seem less patient with it.
      </P>

      <H2 id="conversations-still-doing-the-work">Conversations doing some of the work</H2>
      <P>
        Same idea applies to replies, and I already made the longer case for it:{" "}
        <Link
          href="/weekly/why-replies-matter-on-x"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          Your Replies Are Doing More Work Than Your Posts
        </Link>
        . Some of the most interesting account discovery on X still happens sideways, inside
        someone else&apos;s thread, not through a person&apos;s own timeline. The July 2026 change
        above doesn&apos;t prove that. It doesn&apos;t contradict it either.
      </P>

      <H2 id="whats-going-stale">What feels stale lately</H2>
      <P>
        This part is just me watching a feed too closely, no data behind it. Generic motivational
        one-liners with no real situation attached seem to get scrolled past faster than they used
        to. Engagement-bait questions with nothing actually at stake are easy to clock and easy to
        ignore now. Neither is new. The tolerance for it just feels lower, maybe because there&apos;s
        more of it than ever competing for the same four seconds.
      </P>

      <H2 id="the-throughline">None of this proves a strategy. It still points somewhere.</H2>
      <P>
        I&apos;m not going to pretend one product change and a cultural mood around AI writing add
        up to a confirmed X strategy, because they don&apos;t. They&apos;re two separate things.
        What they both happen to point at, though, is worth taking seriously either way: being
        recognizable, sounding like an actual specific person, keeps showing up as the thing that
        works. Not necessarily because an algorithm rewards it, at least not one we can prove.
        Because that&apos;s what makes someone stop scrolling in the first place.
      </P>
      <P>
        We built{" "}
        <Link href="/" className="text-accent underline underline-offset-2 hover:text-accent/80">
          Aminta
        </Link>{" "}
        around that same idea. Not the point of this piece, just worth saying once.
      </P>
    </>
  )
}

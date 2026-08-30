import Link from "next/link"
import type { EditionMeta } from "../types"
import { Callout, H2, Lead, LI, P, UL } from "@/components/blog/Prose"

export const meta: EditionMeta = {
  edition: 5,
  slug: "what-the-x-algorithm-code-doesnt-tell-you",
  title: "The Weights Are Public. Most of the Takes About Them Aren't Right.",
  description:
    "Two weeks after X open-sourced its ranking code, the most widely shared number from it is a misreading. What the file actually supports, what it withholds, and what still holds up.",
  author: "Filip Stefanovski",
  publishedAt: "2026-08-30",
  tags: ["x-trends", "x-algorithm", "ai-writing", "replies"],
  status: "published",
  heroImage: "/blog/edition-005/misread-numbers.png",
  heroImageAlt:
    "A single clearly-sourced figure on the left, retold through progressively dimmer and more distorted copies until the last one is wrong.",
}

export default function Content() {
  return (
    <>
      <Lead>
        Last week I went through the ranking weights X published and flagged one caveat at the
        end. That caveat has turned into the story. Two weeks after the code went up, the number
        travelling furthest from it is one the file doesn&apos;t actually support, and watching it
        spread has been a better lesson than the weights themselves.
      </Lead>

      <H2 id="the-468-problem">Where &quot;a report costs you 468 likes&quot; comes from</H2>
      <P>
        You&apos;ve probably seen some version of it. Report is weighted -234. A like is 0.5. Divide
        one by the other and you get 468, so a single report supposedly wipes out 468 likes. It&apos;s
        a clean, quotable, screenshot-friendly number. It&apos;s also a category error.
      </P>
      <P>
        The repository says plainly that the weights scale predicted probabilities, not raw
        engagement counts. The model isn&apos;t tallying the likes a post received and subtracting
        for reports. For each viewer, it estimates the chance <em>that person</em> replies, shares,
        mutes, reports, then multiplies each estimate by its weight and sums them. Nothing in that
        loop counts what already happened to your post.
      </P>
      <P>
        So the -234 isn&apos;t a penalty applied after a report. It&apos;s how heavily the system
        weighs the <em>probability</em> that showing you this post produces one. For an ordinary
        post that probability is tiny, and a tiny number times a big number is still small. The
        arithmetic that makes 468 requires treating a probability as an event, which is the one
        thing the file tells you not to do.
      </P>

      <Callout>
        The general shape of the mistake is worth keeping: a real document got published, someone
        did plausible-looking maths on it, and the maths spread faster than the document. Almost
        everyone repeating the number has not opened the file. Neither had I, until I did.
      </Callout>

      <H2 id="per-viewer">There is no single score attached to your post</H2>
      <P>
        The second misreading follows from the first. People are talking about the weights as if
        every post carries one number that determines its fate. It doesn&apos;t. Scoring happens
        per candidate post <em>per viewer</em>, which means the same post is scored differently for
        every person it might reach.
      </P>
      <P>
        This kills a specific fear I&apos;ve seen a lot this month, that a coordinated group can
        mass-report you into oblivion. Recommendations are personalised, and an action can only be
        predicted for someone the timeline was going to show the post to in the first place. A
        brigade doesn&apos;t apply a global debuff, because there is no global number for it to
        apply one to.
      </P>
      <P>
        It also means the honest answer to &quot;why did this post do badly&quot; is usually
        boring: it was scored against many different people, and for most of them the model
        guessed they wouldn&apos;t reply.
      </P>

      <H2 id="whats-missing">What the release doesn&apos;t include</H2>
      <P>
        The code is real, but it isn&apos;t everything, and it&apos;s worth being clear-eyed about
        the gap. The prompts behind the Grok-based classifiers that judge posts for spam and rule
        violations were deliberately held back, on the reasoning that publishing them would make
        the system straightforward to game. That&apos;s a defensible call. It also means the layer
        deciding whether your post is <em>eligible</em> to be recommended is still closed, while
        the layer deciding how to <em>rank</em> it is open.
      </P>
      <P>
        This critique isn&apos;t new. When X open-sourced an earlier version of this code back in
        January, researchers{" "}
        <a
          href="https://www.engadget.com/social-media/xs-open-source-algorithm-isnt-a-win-for-transparency-researchers-say-181836233.html"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          told Engadget
        </a>{" "}
        that published code without the trained models or the training data gives you the pretense
        of transparency more than the substance of it. Cornell&apos;s John Thickstun made the sharper
        version of the point: once ranking runs through neural networks, the behaviour is partly out
        of view of the engineers who built it, never mind the public reading the repo. The August
        release is more than January&apos;s. It doesn&apos;t resolve that.
      </P>

      <H2 id="what-holds">What survives all the caveats</H2>
      <P>
        You can&apos;t do arithmetic with the weights. You can absolutely read their direction, and
        the direction is unambiguous:
      </P>
      <UL>
        <LI>Conversation is weighted far above approval. Replies over likes, by an order of magnitude.</LI>
        <LI>
          Private forwarding is weighted at the very top. Someone sending your post to one person
          counts for more than a public repost by a wide margin.
        </LI>
        <LI>
          Passive signals are close to worthless. Clicks, link opens, media expands, bookmarks sit
          at or near zero.
        </LI>
        <LI>
          Negative signals outweigh positive ones heavily. Being actively unwanted costs more than
          being wanted gains.
        </LI>
      </UL>
      <P>
        None of that requires trusting a decimal place. It&apos;s the ranking of the ranking, and
        it lines up with what{" "}
        <Link
          href="/blog/what-is-working-on-x-right-now"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          I was noticing before any of it was public
        </Link>
        , which is the main reason I believe it.
      </P>

      <H2 id="september">What I&apos;d test going into September</H2>
      <UL>
        <LI>
          Write for the reply, not the like. Post something a person who follows you would have an
          actual answer to, rather than something they&apos;d agree with and scroll past.
        </LI>
        <LI>
          Stop asking engagement-bait questions. They target the same weight, badly. A question
          with nothing at stake reads as a request for a favour, and people have got fast at
          spotting it.
        </LI>
        <LI>
          Notice which posts you personally send to one friend this week, and what they have in
          common. That&apos;s the copy-link weight, observed from the inside.
        </LI>
        <LI>
          Ignore anyone confidently quoting a single number from this release without linking the
          file.
        </LI>
      </UL>

      <H2 id="the-throughline">Transparency didn&apos;t make this easier, it made it more specific</H2>
      <P>
        I expected the code drop to settle arguments. Mostly it&apos;s produced new and more
        confident ones, because a real document is much better raw material for a bad take than
        pure speculation was. Two weeks in, the accounts sounding most certain about the algorithm
        are once again the ones you should trust least, which is roughly where we started.
      </P>
      <P>
        What hasn&apos;t moved: the weights describe predictions about whether a human will do
        something. Every one of them ultimately routes through a person deciding your post is worth
        a reply, or worth sending to a friend. There&apos;s no configuration file that gets you
        that.
      </P>
      <P>
        We build{" "}
        <Link href="/" className="text-accent underline underline-offset-2 hover:text-accent/80">
          Aminta
        </Link>{" "}
        on the assumption that sounding like a specific person is the durable part, and everything
        published this month made me more comfortable with that bet, not less. Learn someone&apos;s
        actual writing, keep their rules, don&apos;t flatten them into the average of the feed. That
        was the plan before there were numbers and it&apos;s the plan now.
      </P>
    </>
  )
}

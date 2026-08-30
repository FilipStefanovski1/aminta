import Link from "next/link"
import type { EditionMeta } from "../types"
import { Callout, H2, Lead, LI, P, UL } from "@/components/blog/Prose"

export const meta: EditionMeta = {
  edition: 4,
  slug: "x-published-its-ranking-weights",
  title: "X Published Its Ranking Weights. Here's What They Actually Say.",
  description:
    "On August 13 X put the For You ranking code on GitHub, weights included. A reply is weighted ten times a like, a copy-link share forty times, and a repost barely registers. What that does and doesn't tell you.",
  author: "Filip Stefanovski",
  publishedAt: "2026-08-22",
  tags: ["x-trends", "x-algorithm", "replies", "voice"],
  status: "published",
  heroImage: "/blog/edition-004/published-ranking-weights.png",
  heroImageAlt:
    "A scale of ranking weights: one dominant highlighted bar, a descending ladder of smaller ones, and a single large bar running the opposite direction.",
}

export default function Content() {
  return (
    <>
      <Lead>
        Two weeks ago I wrote that nobody posting confidently about the X algorithm actually has
        access to it. That changed on August 13. X published the code behind the For You feed,
        including the numbers it uses to score posts. You can now read the thing people have been
        guessing about for years, which is a genuinely strange feeling.
      </Lead>

      <H2 id="what-shipped">What actually shipped</H2>
      <P>
        The release went up at{" "}
        <a
          href="https://github.com/xai-org/x-algorithm"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          xai-org/x-algorithm
        </a>{" "}
        under Apache 2.0, and{" "}
        <a
          href="https://techcrunch.com/2026/08/13/x-open-sources-its-ranking-algorithm-letting-users-see-if-theyve-been-shadowbanned/"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          TechCrunch covered it
        </a>{" "}
        the same day. It&apos;s the retrieval layer, the ranking model, and the filters. Posts get
        pulled in three ways: recent posts from accounts you follow, a vector model that matches
        you against posts by similarity, and clusters built from engagement patterns. Then a model
        called Phoenix scores them.
      </P>
      <P>
        Phoenix doesn&apos;t count what already happened to a post. For every post it might show
        you, it predicts how likely <em>you specifically</em> are to reply, quote, copy the link,
        follow the author, mute them, report them. Each prediction gets multiplied by a published
        weight, and the results are added into one score. Those weights are the interesting part,
        and they live in a config file anyone can open.
      </P>

      <H2 id="replies">A reply is weighted ten times a like</H2>
      <P>
        A like scores 0.5. A reply scores 5.0. That&apos;s ten to one, in a file, from the company
        that runs the ranking.
      </P>
      <P>
        It gets more specific. When someone replies to a post from an account they mutually follow,
        there&apos;s an additional boost on the reply weight, published at 15. That takes a reply
        between mutuals to 20.0, which is forty times a like. Last edition I wrote about{" "}
        <a
          href="https://techcrunch.com/2026/07/13/x-just-tweaked-its-algorithm-to-make-it-more-friendly-less-battleground/"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          X&apos;s July change
        </a>{" "}
        to surface more mutuals inside reply sections and said it didn&apos;t prove anything about
        replies mattering. Now there&apos;s a number attached to the same idea. That&apos;s not
        proof either, but it&apos;s a lot closer than a product announcement.
      </P>
      <P>
        If you&apos;ve read{" "}
        <Link
          href="/blog/why-replies-matter-on-x"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          the replies edition
        </Link>
        , this is the part where the argument stops being a hunch.
      </P>

      <H2 id="copy-link">The highest positive weight is someone sending your post to one person</H2>
      <P>
        Copy-link share sits at 20.0. Same as a mutual reply, and the joint highest positive signal
        in the file. Not a repost to an audience. Someone hitting copy on the link so they can drop
        it into a DM, a group chat, a Slack.
      </P>
      <P>
        I find this the most useful number in the whole release, because it points at a completely
        different target than &quot;engagement.&quot; Posts that get sent privately tend to be
        useful, funny in a specific way, or about a person the sender knows. They&apos;re rarely
        the ones written to perform. If you want one thing to aim at, aim at being worth forwarding
        to a single person rather than worth applauding by a crowd.
      </P>

      <H2 id="what-barely-counts">What barely counts</H2>
      <P>
        The bottom of the scale is where a lot of received wisdom quietly falls apart.
      </P>
      <UL>
        <LI>A repost scores 1.0, twice a like. Less than a quote at 5.0.</LI>
        <LI>Clicking into a post scores 0.4, below a like.</LI>
        <LI>Opening a link scores 0.2.</LI>
        <LI>Expanding media scores 0.05, effectively nothing.</LI>
        <LI>
          Bookmarks and profile clicks are recorded in your history but carry no ranking weight at
          all.
        </LI>
      </UL>
      <P>
        The bookmark one surprised me most. &quot;Write bookmarkable posts&quot; has been standard
        advice for two years. It may still be good advice for the humans reading, since a saved
        post is a real signal that something landed. It just isn&apos;t doing what people said it
        was doing to distribution.
      </P>

      <H2 id="negative">The negative side is much steeper than the positive one</H2>
      <P>
        Report is published at -234. Mute at -58.8, not interested at -43.2, block at -31.2. Every
        negative weight dwarfs every positive one, which is a design choice worth sitting with: the
        system is far more responsive to people wanting less of you than to people wanting more.
      </P>

      <Callout>
        One caveat that changes how you should read all of this. The repo is explicit that the
        weights scale <em>predicted probabilities</em>, not raw engagement counts. So a report
        isn&apos;t &quot;worth&quot; some fixed number of likes, and you can&apos;t do arithmetic
        across the two. I&apos;ll come back to this next week, because the arithmetic version is
        already spreading and it&apos;s wrong.
      </Callout>

      <H2 id="what-to-test">What to test this week</H2>
      <P>
        Three things I&apos;d actually change, based on direction rather than decimal places.
      </P>
      <UL>
        <LI>
          Write at least one post that gives someone who already follows you a reason to reply,
          not a reason to nod. That&apos;s the single heaviest positive path in the file.
        </LI>
        <LI>
          Before posting, ask whether anyone would send this to one specific person. If not, it
          probably isn&apos;t a copy-link post, whatever else it is.
        </LI>
        <LI>
          Stop reading reposts as your success metric. They&apos;re near the bottom of the scale
          and they were never the thing you thought they were.
        </LI>
      </UL>
      <P>
        Also worth doing once: X shipped an &quot;Under the Hood&quot; page in settings alongside
        the code, currently a pilot for accounts over a year old with at least ten posts in the
        past month. It lets you download a JSON file showing whether any visibility labels landed
        on your account or posts in the last calendar month. Ten minutes, and it replaces a lot of
        anxious speculation with an actual answer.
      </P>

      <H2 id="the-throughline">Numbers don&apos;t change what makes someone stop scrolling</H2>
      <P>
        It would be easy to read a weights file and start optimising. I&apos;d push back on that
        gently. Every one of these weights is a prediction about whether a human will do something,
        and the model is guessing at human behaviour. A reply is heavy because replies are hard to
        earn, not because replying is magic. You still have to write something a person wants to
        answer.
      </P>
      <P>
        That&apos;s the part{" "}
        <Link href="/" className="text-accent underline underline-offset-2 hover:text-accent/80">
          Aminta
        </Link>{" "}
        is built around, and it&apos;s why the reply tooling in it works from the post you&apos;re
        actually looking at rather than generating something generic and agreeable. A reply that
        could have been left under any post is not the kind a 20.0 weight is describing.
      </P>
      <P>
        Next week: what people have been getting wrong about these numbers, and what the release
        still doesn&apos;t show you.
      </P>
    </>
  )
}

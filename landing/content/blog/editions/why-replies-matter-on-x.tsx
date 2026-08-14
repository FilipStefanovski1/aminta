import Link from "next/link"
import type { EditionMeta } from "../types"
import { Callout, H2, Lead, P } from "@/components/blog/Prose"

export const meta: EditionMeta = {
  edition: 2,
  slug: "why-replies-matter-on-x",
  title: "Your Replies Are Doing More Work Than Your Posts",
  description:
    "Most people spend the bulk of their effort on their own posts and treat replies as an afterthought. On X, that ratio is backwards.",
  author: "Filip Stefanovski",
  publishedAt: "2026-08-04",
  tags: ["replies", "identity", "x-trends", "building-aminta"],
  status: "published",
  heroImage: "/blog/edition-002/replies-conversation.png",
  heroImageAlt:
    "A single post with one reply branch breaking away and connecting outward to a wider conversation.",
}

export default function Content() {
  return (
    <>
      <Lead>
        People will spend twenty minutes on a post and four seconds on a reply. That ratio is
        backwards for what actually gets you found on X.
      </Lead>

      <H2 id="where-people-find-you">Where people actually find you</H2>
      <P>
        Some of the best account discovery on X happens sideways, inside someone else&apos;s
        replies. You&apos;re reading a thread that already has an audience, and one reply says
        something the other forty didn&apos;t. That reply just did more introduction work than most
        standalone posts ever will, and it&apos;s the part of X people spend the least time
        thinking about.
      </P>

      <H2 id="what-x-published-in-2023">What X actually published, and when</H2>
      <P>
        In March 2023, Twitter open-sourced part of its recommendation code, including the weights
        its ranking model used at the time. According to the{" "}
        <a
          href="https://github.com/twitter/the-algorithm-ml/blob/main/projects/home/recap/README.md"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          published README
        </a>
        , replies were weighted well above retweets and likes. The single highest weight in the
        whole list wasn&apos;t a reply itself. It was the original author replying back to someone
        who&apos;d replied to them.
      </P>
      <Callout>
        That&apos;s 2023 data. X hasn&apos;t republished updated weights since, and there&apos;s no
        confirmation those numbers still describe ranking in 2026. Historical context, not a
        current mechanical fact.
      </Callout>

      <H2 id="what-x-said-in-2026">What X actually said in July 2026</H2>
      <P>
        The stronger, more current signal came from{" "}
        <a
          href="https://techcrunch.com/2026/07/13/x-just-tweaked-its-algorithm-to-make-it-more-friendly-less-battleground/"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          TechCrunch
        </a>
        : in July 2026, X adjusted its algorithm to boost visibility of &quot;mutuals&quot;, people
        you follow who follow you back, specifically inside replies. Nikita Bier, X&apos;s head of
        product, put it plainly. The missing signal &quot;made your friends appear less in your
        replies,&quot; and the reply section ended up feeling &quot;more like a battleground with
        people you don&apos;t recognize.&quot; That&apos;s X&apos;s own product lead treating
        replies as a place familiarity is supposed to live.
      </P>

      <H2 id="useless-vs-real">The useless reply and the real one</H2>
      <P>
        &quot;Great post&quot; is not a reply, it&apos;s a receipt. It confirms you read something
        without adding anything a reader would&apos;ve missed by skipping it. The replies that
        actually travel, the ones that get quote-posted or screenshotted, supply something the
        original post didn&apos;t have. A counterexample. A number. A different angle from someone
        who&apos;s actually lived it. That&apos;s the difference between engagement and
        participation. Only one of them is worth the four seconds.
      </P>

      <H2 id="identity-not-tactic">Replies as identity, not tactic</H2>
      <P>
        This isn&apos;t an argument for replying more to grow faster. Smaller point, more
        interesting one: your replies are part of your public record on X in a way your posts
        aren&apos;t. A post is curated. You chose the topic, had time to edit it, it&apos;s you at
        your most composed. A reply is reactive. It shows how you actually think when someone else
        set the topic, in real time, no blank page to hide behind. People get a clearer picture of
        who you are from a year of your replies than a year of your posts, because replies are
        harder to fully polish into a persona.
      </P>
      <P>
        That&apos;s also why{" "}
        <Link href="/" className="text-accent underline underline-offset-2 hover:text-accent/80">
          Aminta
        </Link>{" "}
        treats reply generation as its own thing, not a smaller version of post generation. A
        reply has to react to something specific someone else just said, in your voice, in about
        the time it takes to read one. Getting that right matters more than most people typing
        &quot;great post&quot; under a stranger&apos;s tweet ever stop to consider.
      </P>
    </>
  )
}

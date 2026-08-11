import Link from "next/link"
import type { WeeklyEditionMeta } from "../types"
import { H2, Lead, P, Quote } from "@/components/weekly/Prose"

export const meta: WeeklyEditionMeta = {
  edition: 1,
  slug: "why-ai-posts-are-starting-to-sound-the-same",
  title: "Why So Much AI Writing Sounds the Same",
  description:
    "Generic AI writing isn't a problem with AI. It's a problem with AI that knows nothing about the person it's supposedly writing for.",
  author: "Filip Stefanovski",
  publishedAt: "2026-08-11",
  tags: ["ai-writing", "voice", "writing-craft", "building-aminta"],
  status: "published",
  heroImage: "/weekly/edition-001/ai-writing-sameness.png",
  heroImageAlt: "Repeated post cards with one distinct post breaking the pattern.",
}

export default function Content() {
  return (
    <>
      <Lead>
        You can usually tell by the second sentence. Not because anything is grammatically
        wrong, it&apos;s usually fine. Because nothing about it sounds like it came from a
        specific person, in a specific mood, on a specific day.
      </Lead>

      <H2 id="the-tell">The tell isn&apos;t the writing. It&apos;s the absence of one.</H2>
      <P>
        Generic AI writing doesn&apos;t fail because the models are bad at language. They&apos;re
        not. It fails because the sentence was built to be the safest version of an idea, not the
        truest one. Predict the next likely word with no other signal, and you keep landing on
        whatever shows up most in similar contexts. That&apos;s not a bug. That&apos;s what
        &quot;safe&quot; writing is.
      </P>
      <P>
        It reads fine. It also reads like nothing in particular. No stray habit. No odd word
        choice tied to the actual person typing. Nothing that couldn&apos;t have been written by
        anyone else asking for the same thing.
      </P>

      <H2 id="the-same-handful-of-moves">Everyone converged on the same handful of moves</H2>
      <P>
        Spend enough time on X and the pattern gets obvious fast. The hook that states something
        everyone already agrees with, dressed up as insight. The three-part structure that shows up
        no matter the topic. The closing line that reaches for uplift whether the post earned it or
        not. Even the vocabulary flattens, the same words and phrases showing up across totally
        unrelated accounts because they were the safe choice for a hundred thousand other prompts
        before yours.
      </P>
      <P>
        None of this is really about grammar. It&apos;s the small habits disappearing, the ones
        that make writing sound like a specific person instead of an average of everyone. The
        sentence that runs long because that&apos;s just how they think. The word they always
        reach for that a model never would.
      </P>

      <H2 id="mainstream-complaint">This stopped being a niche complaint</H2>
      <P>
        In November 2025, Macquarie Dictionary named{" "}
        <a
          href="https://www.macquariedictionary.com.au/macquarie-dictionary-word-of-the-year-for-2025/"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          &quot;AI slop&quot; its 2025 Word of the Year
        </a>
        , defined as low-quality generative content that lacks meaningful substance. That&apos;s not
        a niche internet complaint anymore. That&apos;s a dictionary committee saying enough people
        notice the pattern that it needed a name. Recognizing generic AI output is a mainstream
        skill now, not a party trick for people who use these tools all day.
      </P>

      <H2 id="the-actual-argument">The argument that actually matters here</H2>
      <P>
        It&apos;s tempting to frame this as AI versus human. Wrong axis. The real split is specific
        versus generic, and AI lands on both sides depending on how it&apos;s used. Give a model
        nothing but a topic and it invents a persona from the average of everything it&apos;s read.
        That&apos;s the flatness above. Give it your actual sentences and habits to work from, and
        it has something real to extend instead of a blank page to fill safely.
      </P>

      <Quote>
        The problem was never that a machine helped write it. The problem is a machine that
        doesn&apos;t know anything about the person it&apos;s supposedly writing for.
      </Quote>

      <H2 id="why-we-built-it-this-way">Why this shaped how we built Aminta</H2>
      <P>
        This is the whole bet behind{" "}
        <Link href="/" className="text-accent underline underline-offset-2 hover:text-accent/80">
          Aminta
        </Link>
        . A Voice Profile isn&apos;t a personality prompt you write once and forget. It&apos;s built
        from your actual past posts and the corrections you make, so every draft extends patterns
        that already exist instead of inventing a generic voice and hoping it&apos;s close enough.
        Narrower goal than &quot;write anything about anything.&quot; Also the one that actually
        matters if you want the output to sound like you, not like AI doing an impression of a
        person.
      </P>
      <P>
        None of this is an argument against using AI to write. It&apos;s an argument against AI
        that was never given anything real to work from. Different problems. Only one of them gets
        fixed by paying attention to who you&apos;re actually writing for.
      </P>
    </>
  )
}

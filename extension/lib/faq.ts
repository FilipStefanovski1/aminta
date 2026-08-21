// Duplicated from landing/components/faq-data.ts on purpose — separate
// deployables, no shared workspace between extension/ and landing/, same
// convention as lib/entitlements.ts. Keep the two in sync by hand when
// either changes.
export const FAQS: { q: string; a: string }[] = [
  {
    q: "What is Aminta?",
    a: "An AI side-panel that lives inside X (Twitter). It writes tweets, replies, and polished posts in your own voice, and inserts them straight into the composer. No copy-paste, no extra tabs.",
  },
  {
    q: "What does Generate / Reply / Polish do?",
    a: "Generate writes an original post from a topic. Reply writes a response to a post you're viewing (pull it from the page, or paste it). Polish rewrites a rough draft in your own voice — grammar and clarity, not a rewrite of your meaning.",
  },
  {
    q: "Do I need my own API key?",
    a: "No. Every plan includes Included AI credits, so Aminta works as soon as you install it: Free gets 5 credits a day, Pro/Founder get 1,000 a month. You can switch to your own key (BYOK) in Settings any time — Groq, OpenRouter, or Google Gemini — and it won't touch your Aminta credits.",
  },
  {
    q: "What's the difference between Included AI and BYOK?",
    a: "Included AI: your request goes to Aminta's backend, which calls Aminta's own Gemini key on your behalf and returns the result — nothing is stored beyond brief request logs needed for reliability and abuse prevention. BYOK: your request goes straight from your browser to your chosen provider using your own key, which never reaches Aminta's servers at all.",
  },
  {
    q: "What is Voice Refresh / Aminta DNA?",
    a: "Voice Refresh reads your recent original X posts (not replies or reposts) and distills how you actually write — tone, structure, pacing — into your Aminta DNA. Available once every 7 days per account, timed from your own last successful refresh, on Pro/Founder with X connected. Writing examples and Instincts (Train tab) keep teaching Aminta between refreshes.",
  },
  {
    q: "Why only once a week?",
    a: "Each refresh reads a fresh batch of your recent posts — weekly keeps your DNA current without re-reading the same posts repeatedly.",
  },
  {
    q: "What X data does Aminta read, and is it stored?",
    a: "Only your recent original posts, read via X's API when you run Voice Refresh. The raw post text is never stored — Aminta distills it into a structured style profile and discards the posts. Your X access token is encrypted at rest.",
  },
  {
    q: "What are writing examples and Instincts?",
    a: "Writing examples (Train tab) are real posts you paste in so Aminta learns your pacing and vocabulary directly. Instincts are standing rules Aminta follows in every generation (e.g. \"no hashtags\", \"keep it under 200 characters\"). Neither is overwritten by a successful Voice Refresh — they combine.",
  },
  {
    q: "Does a successful Voice Refresh overwrite my manual training?",
    a: "No. An X-sourced DNA profile stays authoritative for generation once you've refreshed, but your writing examples and Instincts are never deleted, and a later refresh can update the DNA again without losing them.",
  },
  {
    q: "What's the anti-spam cooldown?",
    a: "After Aminta confirms a post or reply you inserted actually published, it waits 15 seconds before letting you insert another post or reply — accidental-duplicate protection, not a claim about X's own spam rules. Generate, Polish, and editing are never affected.",
  },
  {
    q: "What's the difference between Pro and Founder?",
    a: "Founder is a one-time $49 purchase for lifetime Pro access — same Included AI credits and Voice Refresh access as monthly Pro, forever, plus a Founder badge. Pro is $9/month. Founder doesn't get a bigger AI allowance than Pro.",
  },
  {
    q: "Is the Discord Founder-only?",
    a: "No — the Aminta Discord is free and open to everyone.",
  },
  {
    q: "Is my data private?",
    a: "With BYOK, generations go directly from your browser to your provider — your key never touches Aminta's servers. With Included AI, requests are processed through Aminta's backend; we don't store your prompt, and generated text is only kept briefly for reliability before being scrubbed. Signing in syncs your XP, streak, and voice profile across devices.",
  },
  {
    q: "What happens if I miss a day?",
    a: "Your streak resets — that's the deal. XP, level, and evolutions are never lost, so one busy day doesn't erase progress.",
  },
  {
    q: "Something's not working — what do I check first?",
    a: "Confirm you're signed in (Settings → Account) and, for Voice Refresh, that X is connected. If Included AI seems stuck, check your credit balance in Settings. For anything else, the Aminta Discord is the fastest way to reach us.",
  },
]

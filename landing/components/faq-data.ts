// Shared FAQ content — plain data module (no "use client") so both the
// client-rendered FAQ accordion and the server-rendered FAQPage structured
// data can import the same source of truth without crossing the RSC
// client/server boundary.
export const FAQS = [
  {
    q: "What is Aminta?",
    a: "An AI side-panel that lives inside X (Twitter). It writes tweets, replies, and polished posts in your own voice, and inserts them straight into the composer. No copy-paste, no extra tabs.",
  },
  {
    q: "Is Aminta finished?",
    a: "Aminta is in open beta. The core loop is solid and it's free to use while we build. New features ship regularly, and beta feedback directly shapes what gets built next.",
  },
  {
    q: "What does “feed Aminta” actually mean?",
    a: "Publishing earns XP: posts +50, replies +25, polishes +15, and finishing all the daily missions adds +150. That XP levels Aminta through 9 evolutions, from Dormant all the way to its final hidden form. It's a fun, sticky reason to keep posting.",
  },
  {
    q: "Do I need my own API key?",
    a: "No. Every plan includes AI credits, so Aminta works as soon as you install it: Free gets 5 Included AI credits a day, Pro gets 1,000 a month. If you'd rather use your own key instead, you can switch to it in settings at any time — Groq's free tier, OpenRouter, or Google Gemini — and it won't touch your Aminta credits.",
  },
  {
    q: "Does it work inside X / Twitter?",
    a: "Yes. Aminta docks as a Chrome side panel next to x.com. It can read the tweet you're replying to and insert generated text directly into the X composer.",
  },
  {
    q: "Is my data private?",
    a: "Yes. If you use your own API key, generations go directly from your browser to your chosen AI provider, and your key is never sent to Aminta. With Included AI, requests are processed through Aminta and sent to our AI provider. We don't store your prompt, and generated text is only kept briefly for request reliability before being scrubbed. We keep limited non-content usage data for things like quotas and abuse prevention. Signing in also syncs your XP, streak, and voice profile across devices.",
  },
  {
    q: "What happens if I miss a day?",
    a: "Your streak resets, that's the deal. Your XP, level, and evolutions are never lost, so one busy day never wipes real progress.",
  },
  {
    q: "Which AI models can I use?",
    a: "Anything your provider offers: Llama 3.3, Gemini, GPT, and more via OpenRouter, or fast free models on Groq. Aminta auto-detects your key and routes to the right provider.",
  },
  {
    q: "What is Voice Refresh / Aminta DNA?",
    a: "Voice Refresh reads your recent original X posts (not replies or reposts) and distills how you actually write — tone, structure, pacing — into your Aminta DNA. It's available once every 7 days per account, timed from your own last successful refresh, on Pro/Founder plans with X connected. Your writing examples and Instincts (Train tab) feed the same DNA between refreshes.",
  },
  {
    q: "Why only once a week?",
    a: "Voice Refresh reads a batch of your recent posts each time, so weekly keeps your DNA current without re-reading the same posts over and over. You can keep training between refreshes with writing examples and Instincts.",
  },
  {
    q: "What X data does Aminta read, and is it stored?",
    a: "Only what's needed to build your DNA: your recent original posts, read via X's API when you run Voice Refresh. The raw post text is never stored — Aminta distills it into a structured style profile (tone, pacing, structure) and discards the posts themselves. Your X access token is encrypted at rest and only Aminta's backend can use it.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yep. Monthly cancels anytime, no lock-in. Lifetime is a one-time payment; pay once and feed Aminta forever.",
  },
  {
    q: "What's the difference between Pro and Founder?",
    a: "Founder is a one-time $49 purchase for lifetime Pro access — same Included AI credits and Voice Refresh access as monthly Pro, forever, plus a Founder badge. Pro is the $9/month subscription. Founder doesn't get a bigger AI allowance than Pro; the AI/X costs behind every generation are ongoing, so the two stay at parity there.",
  },
  {
    q: "Is the Discord Founder-only?",
    a: "No — the Aminta Discord is free and open to everyone, not a paid perk.",
  },
  {
    q: "What's the anti-spam cooldown?",
    a: "After Aminta confirms a post or reply you inserted actually published, it waits 15 seconds before letting you insert another post or reply — just accidental-duplicate protection, not a claim about X's own spam rules. Generating, polishing, and editing are never affected.",
  },
];

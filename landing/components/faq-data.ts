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
    q: "Can I cancel anytime?",
    a: "Yep. Monthly cancels anytime, no lock-in. Lifetime is a one-time payment; pay once and feed Aminta forever.",
  },
];

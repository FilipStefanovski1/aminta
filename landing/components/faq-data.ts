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
    a: "Yes. Aminta is BYOK (bring your own key). It works with Groq's free tier, OpenRouter, or Google Gemini. You only pay us for the app; the AI usage runs on your own key, which keeps everything cheap and private.",
  },
  {
    q: "Does it work inside X / Twitter?",
    a: "Yes. Aminta docks as a Chrome side panel next to x.com. It can read the tweet you're replying to and insert generated text directly into the X composer.",
  },
  {
    q: "Is my data private?",
    a: "Your API key never leaves your device, and generations go straight from your browser to your AI provider. We never see what you write. When you sign in, your XP, streak, and voice profile sync to your Aminta account so your progress follows you across devices.",
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

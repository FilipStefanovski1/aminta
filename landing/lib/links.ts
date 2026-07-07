// Single source of truth for every external product link.
// Production values are injected via env vars so no code change is needed at
// launch — set these in Vercel before going live:
//
//   NEXT_PUBLIC_EXTENSION_URL      → the real Chrome Web Store listing
//   NEXT_PUBLIC_CREEM_PRO_URL      → production Creem checkout (Pro monthly)
//   NEXT_PUBLIC_CREEM_FOUNDER_URL  → production Creem checkout (Founder lifetime)
//
// The fallbacks below are placeholders (store homepage / Creem TEST mode) and
// MUST NOT ship to production.

export const EXTENSION_URL =
  process.env.NEXT_PUBLIC_EXTENSION_URL ??
  "https://chromewebstore.google.com" // TODO: replace with real listing URL

export const CREEM_PRO_URL =
  process.env.NEXT_PUBLIC_CREEM_PRO_URL ??
  "https://www.creem.io/test/payment/prod_6l3U3WOanZI0BZl03d6XeP" // TEST MODE

export const CREEM_FOUNDER_URL =
  process.env.NEXT_PUBLIC_CREEM_FOUNDER_URL ??
  "https://www.creem.io/test/payment/prod_5BDQkBTIBnVesffOYY7CF6" // TEST MODE

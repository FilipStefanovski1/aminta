import { FAQS } from "./faq-data";

// SoftwareApplication schema — sitewide, rendered once in the root layout.
export function SoftwareApplicationSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Aminta",
    description:
      "Aminta is the AI writing sidekick that makes posting addictive. Write posts in your voice, feed your demon, stack XP, and grow your socials.",
    url: "https://amintaapp.com",
    applicationCategory: "BrowserApplication",
    operatingSystem: "Chrome",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro", price: "8.99", priceCurrency: "USD" },
      { "@type": "Offer", name: "Founder", price: "49", priceCurrency: "USD" },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

// FAQPage schema — derived from the same FAQS array FAQ.tsx renders, so the
// structured data can never drift out of sync with what's on the page.
export function FAQPageSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

import { FAQS } from "./faq-data";

// SoftwareApplication schema — sitewide, rendered once in the root layout.
export function SoftwareApplicationSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Aminta",
    description:
      "Aminta is your X companion for AI-assisted writing — draft posts and replies in your own voice, feed your demon, stack XP, and grow on X.",
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

// BlogPosting schema for a single Weekly edition — every field is sourced
// directly from that edition's own WeeklyEditionMeta, never invented.
// dateModified is only included when the edition actually has an
// updatedAt (a real revision), not defaulted to publish date.
export function ArticleSchema({
  headline,
  description,
  url,
  imageUrl,
  datePublished,
  dateModified,
  authorName,
}: {
  headline: string
  description: string
  url: string
  imageUrl: string
  datePublished: string
  dateModified?: string
  authorName: string
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline,
    description,
    image: [imageUrl],
    datePublished,
    ...(dateModified ? { dateModified } : {}),
    author: { "@type": "Person", name: authorName },
    publisher: {
      "@type": "Organization",
      name: "Aminta",
      url: "https://amintaapp.com",
      logo: { "@type": "ImageObject", url: "https://amintaapp.com/icon.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  )
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

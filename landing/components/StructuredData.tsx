import { FAQS } from "./faq-data";

// The one preferred public hostname. Production serves www and 308-redirects
// the apex, so every absolute URL emitted in structured data must use it —
// pointing schema at a redirecting URL weakens the entity signal.
const SITE_URL = "https://www.amintaapp.com";
const LOGO_URL = `${SITE_URL}/icon.png`;

// Stable @id values let the separate JSON-LD blocks below reference one
// another instead of describing three unrelated entities.
const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

// Official Aminta profiles. Every entry is a link that already appears in the
// site's own UI (Footer.tsx socials, Navbar/Pricing extension CTA) and was
// verified reachable — nothing here is assumed or invented.
const SAME_AS = [
  "https://x.com/amintaapp",
  "https://www.linkedin.com/company/amintaapp/",
  "https://www.instagram.com/amintaapp/",
  "https://chromewebstore.google.com/detail/aminta/meebmdkmkimhobegenimhhpafaapjbpb",
];

function JsonLd({ json }: { json: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

// Organization — the publisher entity behind both the product and Aminta
// Weekly. Rendered site-wide from the root layout. Deliberately omits
// foundingDate/founder/employee counts/ratings: none of that is verifiable
// from this repo, and fabricated values are worse than absent ones.
export function OrganizationSchema() {
  return (
    <JsonLd
      json={{
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": ORG_ID,
        name: "Aminta",
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: LOGO_URL },
        sameAs: SAME_AS,
      }}
    />
  );
}

// WebSite — establishes the preferred site name for search results. The name
// is the bare brand ("Aminta"), not "Aminta — Your X Companion": that is the
// tagline and belongs in titles/descriptions. No SearchAction, because the
// site has no internal search.
export function WebSiteSchema() {
  return (
    <JsonLd
      json={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": SITE_ID,
        name: "Aminta",
        url: SITE_URL,
        publisher: { "@id": ORG_ID },
      }}
    />
  );
}

// SoftwareApplication — the product itself. Emitted only on the homepage
// (app/page.tsx), not site-wide: describing the Chrome extension on the
// privacy policy or a Weekly article dilutes rather than strengthens the
// association. Stays SoftwareApplication (not WebApplication) because Aminta
// ships as a browser extension. Offers mirror the live pricing page.
export function SoftwareApplicationSchema() {
  return (
    <JsonLd
      json={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Aminta",
        description:
          "Aminta is your X companion for AI-assisted writing — draft posts and replies in your own voice, feed your demon, stack XP, and grow on X.",
        url: SITE_URL,
        applicationCategory: "BrowserApplication",
        operatingSystem: "Chrome",
        image: LOGO_URL,
        publisher: { "@id": ORG_ID },
        sameAs: SAME_AS,
        offers: [
          { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
          { "@type": "Offer", name: "Pro", price: "8.99", priceCurrency: "USD" },
          { "@type": "Offer", name: "Founder", price: "49", priceCurrency: "USD" },
        ],
      }}
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
  return (
    <JsonLd
      json={{
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline,
        description,
        image: [imageUrl],
        datePublished,
        ...(dateModified ? { dateModified } : {}),
        author: { "@type": "Person", name: authorName },
        // Points at the same Organization node the root layout emits, so the
        // article, the site and the product all resolve to one publisher.
        publisher: {
          "@id": ORG_ID,
          "@type": "Organization",
          name: "Aminta",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: LOGO_URL },
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
      }}
    />
  )
}

// FAQPage schema — derived from the same FAQS array FAQ.tsx renders, so the
// structured data can never drift out of sync with what's on the page.
export function FAQPageSchema() {
  return (
    <JsonLd
      json={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }}
    />
  );
}

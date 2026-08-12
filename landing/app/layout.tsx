import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import CursorTrail from "@/components/CursorTrail";
import { OrganizationSchema, WebSiteSchema } from "@/components/StructuredData";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pixel = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f1f1f",
};

export const metadata: Metadata = {
  // Production serves www and 308-redirects the apex, so every relative
  // metadata URL below must resolve against the www host to avoid pointing
  // canonicals and OG URLs at a redirect.
  metadataBase: new URL("https://www.amintaapp.com"),
  title: "Aminta | Your X Companion",
  description:
    "Aminta is your X companion for AI-assisted writing — draft posts and replies in your own voice, feed your demon, stack XP, and grow on X.",
  // No `alternates.canonical` here on purpose: a canonical set on the root
  // layout is inherited by every page that doesn't override it, which made
  // /privacy, /terms and the auth routes all canonicalise to the homepage.
  // Each indexable page declares its own self-referencing canonical instead.
  openGraph: {
    // Site name is the bare brand ("Aminta"); "Your X Companion" is the
    // tagline and stays in the title/description, not here.
    siteName: "Aminta",
    title: "Aminta | Your X Companion",
    description:
      "Aminta is your X companion for AI-assisted writing. Generate posts and replies in your voice, feed Aminta, stack XP, keep your streak alive.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aminta | Your X Companion",
    description:
      "Aminta is your X companion for AI-assisted writing. Generate posts and replies in your voice, feed Aminta, stack XP, keep your streak alive.",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${pixel.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-ink text-[#e7e7ef]">
        {/* Organization and WebSite describe the publisher and the site as a
            whole, so they belong on every page. SoftwareApplication describes
            the product and is emitted only on the homepage. */}
        <OrganizationSchema />
        <WebSiteSchema />
        <CursorTrail />
        <div className="relative z-[1] flex flex-col flex-1">{children}</div>
      </body>
    </html>
  );
}

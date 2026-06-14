import type { Metadata } from "next";
import { Geist, Press_Start_2P } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const pixel = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aminta — Feed Aminta. Grow on X.",
  description:
    "Aminta is the AI sidekick that makes posting on X addictive. Write tweets, replies, and polished posts in your voice — every post feeds Aminta and stacks XP.",
  openGraph: {
    title: "Aminta — Feed Aminta. Grow on X.",
    description:
      "The AI sidekick that makes posting on X addictive. Generate posts in your voice, feed Aminta, stack XP, keep your streak alive.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${pixel.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-ink text-[#e7e7ef]">{children}</body>
    </html>
  );
}

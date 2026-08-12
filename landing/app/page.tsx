import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ThreeModes from "@/components/ThreeModes";
import AmintaEvolutionGrid from "@/components/AmintaEvolutionGrid";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import MarqueeWall from "@/components/MarqueeWall";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import OnboardingCTA from "@/components/OnboardingCTA";
import Footer from "@/components/Footer";
import AuthCodeHandler from "@/components/AuthCodeHandler";
import { FAQPageSchema, SoftwareApplicationSchema } from "@/components/StructuredData";
import type { Metadata } from "next";

// Self-referencing canonical. The root layout deliberately sets no canonical,
// so each indexable page declares its own; resolved against metadataBase this
// becomes https://www.amintaapp.com.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <SoftwareApplicationSchema />
      <FAQPageSchema />
      <AuthCodeHandler />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ThreeModes />
        <HowItWorks />
        <AmintaEvolutionGrid />
        <Features />
        <Pricing />
        <OnboardingCTA />
        <MarqueeWall />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}

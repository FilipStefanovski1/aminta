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
import { FAQPageSchema } from "@/components/StructuredData";

export default function Home() {
  return (
    <>
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

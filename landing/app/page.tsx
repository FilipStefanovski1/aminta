import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ThreeModes from "@/components/ThreeModes";
import ScrollDemonProgress from "@/components/ScrollDemonProgress";
import AmintaEvolutionGrid from "@/components/AmintaEvolutionGrid";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import MarqueeWall from "@/components/MarqueeWall";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import OnboardingCTA from "@/components/OnboardingCTA";
import Footer from "@/components/Footer";
import AuthCodeHandler from "@/components/AuthCodeHandler";

export default function Home() {
  return (
    <>
      <AuthCodeHandler />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <ThreeModes />
        <ScrollDemonProgress />
        <AmintaEvolutionGrid />
        <Features />
        <MarqueeWall />
        <Pricing />
        <OnboardingCTA />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}

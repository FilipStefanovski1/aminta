import { redirect } from "next/navigation";
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
import WalletConnect from "@/components/WalletConnect";
import Footer from "@/components/Footer";

export default function Home({ searchParams }: { searchParams: Record<string, string> }) {
  if (searchParams.code) {
    redirect(`/auth/callback?code=${searchParams.code}`);
  }
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ThreeModes />
        <ScrollDemonProgress />
        <AmintaEvolutionGrid />
        <Features />
        <HowItWorks />
        <MarqueeWall />
        <Pricing />
        <OnboardingCTA />
        <WalletConnect />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ThreeModes from "@/components/ThreeModes";
import ProductDemo from "@/components/ProductDemo";
import ScrollDemonProgress from "@/components/ScrollDemonProgress";
import AmintaEvolutionGrid from "@/components/AmintaEvolutionGrid";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import MarqueeWall from "@/components/MarqueeWall";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import OnboardingCTA from "@/components/OnboardingCTA";
import AmintaSprite from "@/components/AmintaSprite";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ThreeModes />
        <ProductDemo />
        <ScrollDemonProgress />
        <AmintaEvolutionGrid />
        <Features />
        <HowItWorks />
        <MarqueeWall />
        <Pricing />
        <FAQ />
        <OnboardingCTA />
        <div className="flex items-center justify-center gap-8 py-12 flex-wrap">
          <AmintaSprite level={1} mood="sleeping" size={80} />
          <AmintaSprite level={2} mood="happy" size={80} />
          <AmintaSprite level={3} mood="happy" size={80} />
          <AmintaSprite level={5} mood="excited" size={80} />
          <AmintaSprite level={6} mood="proud" size={80} />
          <AmintaSprite level={9} mood="mischievous" size={80} />
        </div>
      </main>
      <Footer />
    </>
  );
}

import { HeroSection } from "@/components/home/HeroSection";
import { PlacementsMarquee } from "@/components/home/PlacementsMarquee";
import { ProductStory } from "@/components/home/ProductStory";
import { QuickTips } from "@/components/home/QuickTips";
import { CtaBand } from "@/components/home/CtaBand";
import { SiteFooter } from "@/components/home/SiteFooter";
import { AppShell } from "@/components/layout/AppShell";

export default function Home() {
  return (
    <AppShell>
      <HeroSection />
      <PlacementsMarquee />
      <ProductStory />
      <QuickTips />
      <CtaBand />
      <SiteFooter />
    </AppShell>
  );
}

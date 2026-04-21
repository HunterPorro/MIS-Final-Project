import { HeroSection } from "@/components/home/HeroSection";
import { ProofStrip } from "@/components/home/ProofStrip";
import { InteractiveDemo } from "@/components/home/InteractiveDemo";
import { HowItWorks } from "@/components/home/HowItWorks";
import { QuickTips } from "@/components/home/QuickTips";
import { CtaBand } from "@/components/home/CtaBand";
import { SiteFooter } from "@/components/home/SiteFooter";
import { AppShell } from "@/components/layout/AppShell";

export default function Home() {
  return (
    <AppShell>
      <HeroSection />
      <ProofStrip />
      <InteractiveDemo />
      <HowItWorks />
      <QuickTips />
      <CtaBand />
      <SiteFooter />
    </AppShell>
  );
}

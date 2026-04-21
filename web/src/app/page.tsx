import { HeroSection } from "@/components/home/HeroSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { QuickTips } from "@/components/home/QuickTips";
import { SiteFooter } from "@/components/home/SiteFooter";
import { AppShell } from "@/components/layout/AppShell";

export default function Home() {
  return (
    <AppShell>
      <HeroSection />
      <HowItWorks />
      <QuickTips />
      <SiteFooter />
    </AppShell>
  );
}

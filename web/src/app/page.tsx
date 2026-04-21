import { HeroSection } from "@/components/home/HeroSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { QuickTips } from "@/components/home/QuickTips";
import { SiteFooter } from "@/components/home/SiteFooter";
import { MockInterview } from "@/components/interview/MockInterview";
import { AppShell } from "@/components/layout/AppShell";

export default function Home() {
  return (
    <AppShell>
      <HeroSection />
      <HowItWorks />
      <QuickTips />
      <section
        id="assessment"
        className="scroll-mt-[5.5rem] border-b border-white/5 bg-zinc-950 py-16 sm:py-20"
        aria-labelledby="assessment-heading"
      >
        <MockInterview />
      </section>
      <SiteFooter />
    </AppShell>
  );
}

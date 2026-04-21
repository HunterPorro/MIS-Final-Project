import { AppShell } from "@/components/layout/AppShell";
import { MockInterview } from "@/components/interview/MockInterview";

export default function InterviewPage() {
  return (
    <AppShell>
      <section className="border-b border-white/5 bg-zinc-950 py-10 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Mock interview</h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
              Pick a prompt, record your answer, and review a structured report.
            </p>
          </div>
        </div>
      </section>
      <section className="bg-zinc-950 py-10 sm:py-14">
        <MockInterview />
      </section>
    </AppShell>
  );
}


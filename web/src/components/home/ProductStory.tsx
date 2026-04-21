import Link from "next/link";
import { InteractiveDemo } from "@/components/home/InteractiveDemo";

const pipelineSteps = [
  {
    step: "01",
    title: "Record once",
    body: "Pick a prompt, answer in one take. Space to start/stop—same muscle memory as a live video interview.",
  },
  {
    step: "02",
    title: "Transcribe & score",
    body: "Audio becomes a transcript; technical depth, delivery, and optional workspace frame feed a single Fit score.",
  },
  {
    step: "03",
    title: "Review & iterate",
    body: "Coaching and gaps are written for your next take—not a verdict on candidacy. Re-run to track progress.",
  },
];

export function ProductStory() {
  return (
    <section
      id="how-it-works"
      className="border-b border-white/5 py-16 sm:py-24 print:hidden scroll-mt-[4.5rem]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="type-h1">Built for fast reps</h2>
          <p className="mt-4 text-zinc-300">
            The point isn’t chasing a number—it’s{" "}
            <span className="font-medium text-zinc-200">specific coaching you can apply on the next take.</span> Choose how
            you want to practice, then follow one simple pipeline.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <article className="meet-panel frame-gradient flex h-full flex-col p-6 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Prep by topic</div>
            <h3 className="mt-3 text-xl font-semibold text-white">One prompt at a time</h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-300">
              Work through technical and behavioral questions from the bank individually. After each take you get a full
              report for <em>that</em> answer—ideal when you want to shore up a weak area.
            </p>
            <Link
              href="/interview"
              className="mt-6 inline-flex w-fit rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              Open prep room
            </Link>
          </article>
          <article className="meet-panel frame-gradient flex h-full flex-col p-6 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Full mock interview</div>
            <h3 className="mt-3 text-xl font-semibold text-white">Multi-question simulation</h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-300">
              A short sequence of timed takes with a <strong className="font-semibold text-zinc-200">single session report</strong>{" "}
              when you finish—closer to a Superday or HireVue-style round than single-question drills.
            </p>
            <Link
              href="/superday"
              className="mt-6 inline-flex w-fit rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
            >
              Run full mock interview
            </Link>
          </article>
        </div>

        <div className="mx-auto mt-14 max-w-2xl text-center">
          <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">One pipeline</h3>
          <p className="mt-2 text-sm text-zinc-500">
            Same three stages whether you&apos;re in prep mode or a full mock—only the session shape changes.
          </p>
        </div>

        <ol className="mt-10 grid gap-8 lg:grid-cols-3">
          {pipelineSteps.map((s) => (
            <li key={s.step}>
              <article className="meet-panel frame-gradient relative h-full p-6 pb-8 sm:p-8">
                <span className="relative inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs font-bold text-zinc-200">
                  {s.step}
                </span>
                <h4 className="relative mt-4 text-lg font-semibold text-white">{s.title}</h4>
                <p className="relative mt-3 text-sm leading-relaxed text-zinc-300">{s.body}</p>
              </article>
            </li>
          ))}
        </ol>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm leading-relaxed text-zinc-500">
          You always get a transcript, Fit score components, strengths, gaps, and coaching actions—minimal steps, keyboard
          shortcuts, one place to review.
        </p>

        <InteractiveDemo />
      </div>
    </section>
  );
}

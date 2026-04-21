const steps = [
  {
    step: "01",
    title: "Record once",
    body: "Choose a prompt and answer in one take. Use Space to start/stop like a real interview room.",
  },
  {
    step: "02",
    title: "Transcribe + score",
    body: "We transcribe audio, score technical depth + delivery, and compute a single Fit score.",
  },
  {
    step: "03",
    title: "Iterate with clarity",
    body: "Get coaching actions and gaps you can practice immediately—then re-run to track progress.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-b border-white/5 py-16 sm:py-24 print:hidden scroll-mt-[4.5rem]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="type-h1">How it works</h2>
          <p className="mt-4 text-zinc-300">
            A streamlined flow that mirrors a modern interview platform—record, transcribe, score, and review.
          </p>
        </div>

        <ol className="mt-14 grid gap-8 lg:grid-cols-3">
          {steps.map((s) => (
            <li key={s.step}>
              <article className="meet-panel frame-gradient relative h-full p-8 pb-10">
                <span className="relative inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs font-bold text-zinc-200">
                  {s.step}
                </span>
                <h3 className="relative mt-5 text-xl font-semibold text-white">{s.title}</h3>
                <p className="relative mt-3 text-sm leading-relaxed text-zinc-300">{s.body}</p>
              </article>
            </li>
          ))}
        </ol>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {[
            { k: "What you get", v: "Transcript, Fit score, strengths, gaps, coaching actions." },
            { k: "Designed for speed", v: "Minimal steps. One page. Keyboard shortcuts. Clear outputs." },
            { k: "Session mode", v: "Run a 3-question set and view an aggregated report." },
          ].map((x) => (
            <div key={x.k} className="meet-section">
              <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{x.k}</div>
              <div className="mt-2 text-sm font-semibold text-white">{x.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

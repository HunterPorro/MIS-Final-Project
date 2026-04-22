const steps = [
  {
    step: "01",
    title: "Workspace signal",
    body: "A ResNet18 classifier reads one still frame—lighting, framing, clutter.",
  },
  {
    step: "02",
    title: "Technical depth",
    body: "Fine-tuned DistilBERT estimates expertise on your chosen topic with keyword checks for missed concepts.",
  },
  {
    step: "03",
    title: "Fit score",
    body: "Environment and technical signals fuse into one score with a concise narrative.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-b border-zinc-800 bg-[#0A0A0A] py-16 sm:py-24 print:hidden scroll-mt-[4.5rem]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">How it works</h2>
          <p className="mt-4 text-zinc-400">
            Three components—computer vision, NLP, and fusion—mirror how teams screen quickly before a Superday.
          </p>
        </div>

        <ol className="mt-14 grid gap-8 lg:grid-cols-3">
          {steps.map((s) => (
            <li key={s.step}>
              <article className="ui-card ui-card-hover relative h-full rounded-xl border border-zinc-800 bg-[#0F0F11] p-8 pb-10">
                <span className="relative inline-flex rounded-lg border border-zinc-800 bg-[#0A0A0A] px-2.5 py-1 font-mono text-xs font-bold text-zinc-300">
                  {s.step}
                </span>
                <h3 className="relative mt-5 text-xl font-semibold text-white">{s.title}</h3>
                <p className="relative mt-3 text-sm leading-relaxed text-zinc-400">{s.body}</p>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

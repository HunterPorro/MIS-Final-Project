export function CtaBand() {
  return (
    <section className="py-14 sm:py-20 print:hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="cta-band p-6 sm:p-10">
          <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Ready to run a rep?</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Choose how you want to practice.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-300 sm:text-base">
                <span className="font-medium text-zinc-200">Prep by topic</span> when you want to drill one technical or
                behavioral prompt at a time. <span className="font-medium text-zinc-200">Full mock interview</span> is a
                short multi-question simulation with one combined report at the end—like a Superday or HireVue round.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <a href="/interview" className="ui-btn-primary w-full sm:w-auto px-7 py-3.5">
                Start topic prep
              </a>
              <a href="/superday" className="ui-btn-ghost w-full sm:w-auto px-7 py-3.5">
                Run full mock interview
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


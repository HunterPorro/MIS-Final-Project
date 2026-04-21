export function CtaBand() {
  return (
    <section className="py-14 sm:py-20 print:hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="cta-band p-6 sm:p-10">
          <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Ready to run a rep?</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Join the interview room and generate a report.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-300 sm:text-base">
                Use the mock interview room for a single prompt, or run a short Superday-style session for an aggregated report.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <a href="/interview" className="ui-btn-primary w-full sm:w-auto px-7 py-3.5">
                Start mock interview
              </a>
              <a href="/superday" className="ui-btn-ghost w-full sm:w-auto px-7 py-3.5">
                Run Superday session
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


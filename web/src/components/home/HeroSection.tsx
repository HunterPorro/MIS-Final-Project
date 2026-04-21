export function HeroSection() {
  return (
    <section
      id="overview"
      className="relative overflow-hidden border-b border-zinc-800 bg-[#0A0A0A] print:hidden scroll-mt-[4.5rem]"
    >
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:pb-32 lg:pt-28">
        <div className="mx-auto max-w-4xl text-center">
          <p className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">
            MIS Capstone Prototype
          </p>
          <h1 className="mt-8 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Hire-ready{" "}
            <span className="text-zinc-500">
              interview feedback.
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
            One snapshot of your setup plus a technical finance answer. Our workspace CNN and language
            model produce a Fit Score and coaching narrative in seconds.
          </p>
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#assessment"
              className="inline-flex w-full items-center justify-center rounded-lg bg-white px-8 py-4 text-sm font-semibold tracking-wide text-black transition hover:bg-zinc-200 sm:w-auto"
            >
              Run readiness check
            </a>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-800 bg-transparent px-8 py-4 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white sm:w-auto"
            >
              How it works
            </a>
          </div>
        </div>

        <div className="mx-auto mt-24 grid max-w-5xl grid-cols-1 gap-px bg-zinc-800 sm:grid-cols-3 border border-zinc-800 rounded-xl overflow-hidden">
          {[
            { k: "Environment", v: "Professional vs unprofessional framing" },
            { k: "Technical", v: "M&A, LBO, or valuation depth analysis" },
            { k: "Output", v: "Comprehensive fit score & gaps" },
          ].map((item) => (
            <div
              key={item.k}
              className="bg-[#0A0A0A] px-6 py-8 text-center"
            >
              <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-300">{item.k}</dt>
              <dd className="mt-3 text-sm leading-snug text-zinc-500">{item.v}</dd>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

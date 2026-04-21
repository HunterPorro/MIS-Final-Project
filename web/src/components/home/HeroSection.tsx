export function HeroSection() {
  return (
    <section
      id="overview"
      className="app-backdrop relative overflow-hidden border-b border-white/5 print:hidden scroll-mt-[4.5rem]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="orb left-[-120px] top-[-140px] h-[360px] w-[360px] opacity-70" />
        <div className="orb orb-2 right-[-140px] top-[120px] h-[420px] w-[420px] opacity-60" />
        <div className="orb orb-3 left-[35%] top-[55%] h-[320px] w-[320px] opacity-45" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16 lg:pb-28 lg:pt-20">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="meet-chip">Final Round</span>
              <span className="meet-chip">Mock interview room</span>
              <span className="meet-chip">Superday session</span>
            </div>

            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Practice like it’s{" "}
              <span className="text-zinc-400">the real call.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-300 sm:text-lg">
              Record a one-take answer, get a transcript, and review a structured report across technical depth,
              delivery, and environment signal.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="/interview" className="ui-btn-primary w-full sm:w-auto px-7 py-3.5">
                Start mock interview
              </a>
              <a href="/superday" className="ui-btn-ghost w-full sm:w-auto px-7 py-3.5">
                Run Superday session
              </a>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                { k: "Audio", v: "Transcribe and analyze in one pass" },
                { k: "Report", v: "Fit score + clear coaching actions" },
                { k: "Flow", v: "Keyboard shortcuts + Meet-style controls" },
              ].map((x) => (
                <div key={x.k} className="meet-section">
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{x.k}</div>
                  <div className="mt-2 text-sm font-semibold text-white">{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="frame-gradient">
            <div className="overflow-hidden rounded-2xl bg-black shadow-[0_18px_50px_-35px_rgba(0,0,0,0.85)]">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-100">Interview room preview</div>
                  <div className="mt-0.5 text-xs text-zinc-500">Prompt · Report · Transcript</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                  <span className="text-xs text-zinc-400">Connected</span>
                </div>
              </div>

              <div className="relative aspect-video bg-zinc-950">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-xl font-semibold text-zinc-200">
                      FR
                    </div>
                    <div className="mt-3 text-sm text-zinc-300">Meet-style controls</div>
                    <div className="mt-1 text-xs text-zinc-600">Space to record · Enter to generate</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/5 bg-zinc-950/50 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { k: "Fit", v: "78" },
                    { k: "Technical", v: "72" },
                    { k: "Behavioral", v: "84" },
                  ].map((m) => (
                    <div key={m.k} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{m.k}</div>
                      <div className="mt-2 text-3xl font-semibold text-white tabular-nums">{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

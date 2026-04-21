export function ProofStrip() {
  return (
    <section className="border-b border-white/5 py-10 sm:py-12 print:hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div className="meet-section">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Designed for iteration</div>
            <div className="mt-2 text-lg font-semibold text-white">Tight loop: prompt → record → report → repeat</div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              The goal isn’t “a score.” It’s fast, specific coaching you can apply on the next take.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { k: "One-take", v: "HireVue-style flow" },
              { k: "Clarity", v: "Actionable gaps & coaching" },
              { k: "Speed", v: "Minimal steps to feedback" },
            ].map((x) => (
              <div key={x.k} className="meet-section">
                <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{x.k}</div>
                <div className="mt-2 text-sm font-semibold text-white">{x.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


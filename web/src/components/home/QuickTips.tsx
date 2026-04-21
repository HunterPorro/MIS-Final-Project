export function QuickTips() {
  return (
    <section
      id="tips"
      className="scroll-mt-[5.5rem] border-b border-white/5 py-10 sm:py-12 print:hidden"
      aria-labelledby="tips-heading"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <details className="group meet-panel frame-gradient overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-white marker:content-none sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
            <span id="tips-heading" className="flex items-center gap-3 text-sm sm:text-base">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 sm:h-10 sm:w-10">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </span>
              Before you record
            </span>
            <svg
              className="h-5 w-5 shrink-0 text-zinc-500 transition group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="border-t border-white/5 bg-black/35 px-5 pb-5 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
            <ul className="space-y-3 text-sm leading-relaxed text-zinc-300">
              <li className="flex gap-3 text-zinc-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
                <span>
                  <strong className="text-zinc-300">Frame:</strong> Face the camera, soft front light, tidy background—same
                  as a virtual superday if you upload or capture a still for environment signal.
                </span>
              </li>
              <li className="flex gap-3 text-zinc-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
                <span>
                  <strong className="text-zinc-300">Technical answers:</strong> You&apos;re scored on{" "}
                  <em className="text-zinc-400 not-italic">speech</em>—signpost structure (&quot;First… then…&quot;), name
                  concepts explicitly (e.g. WACC, synergies), and avoid a single unstructured ramble.
                </span>
              </li>
              <li className="flex gap-3 text-zinc-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
                <span>
                  <strong className="text-zinc-300">Behavioral answers:</strong> Use STAR beats out loud; add one number or
                  timeframe so impact is concrete.
                </span>
              </li>
              <li className="flex gap-3 text-zinc-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
                <span>
                  <strong className="text-zinc-300">Scores:</strong> Fit blends environment, technical, and delivery signals.
                  Treat the report as coaching feedback—not a hiring verdict.
                </span>
              </li>
            </ul>
          </div>
        </details>
      </div>
    </section>
  );
}

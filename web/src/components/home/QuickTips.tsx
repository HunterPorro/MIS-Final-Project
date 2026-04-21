export function QuickTips() {
  return (
    <section
      id="tips"
      className="scroll-mt-[5.5rem] border-b border-white/5 py-12 sm:py-16 print:hidden"
      aria-labelledby="tips-heading"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <details className="group ui-card overflow-hidden border-zinc-800 open:border-zinc-600 bg-[#0A0A0A]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-medium text-white marker:content-none [&::-webkit-details-marker]:hidden">
            <span id="tips-heading" className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F0F11] ring-1 ring-zinc-800">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </span>
              Quick tips before you start
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
          <div className="border-t border-zinc-800 bg-[#0F0F11] px-6 pb-6 pt-4">
            <ul className="space-y-4 text-sm leading-relaxed text-zinc-400">
              <li className="flex gap-3 text-zinc-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
                <span>
                  <strong className="text-zinc-300">Environment:</strong> Face the camera, use soft front light, clear the
                  background, and dress as you would for a virtual superday.
                </span>
              </li>
              <li className="flex gap-3 text-zinc-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
                <span>
                  <strong className="text-zinc-300">Technical:</strong> Pick the topic that matches your answer. Write in
                  complete sentences—structure beats stream-of-consciousness for the model.
                </span>
              </li>
              <li className="flex gap-3 text-zinc-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
                <span>
                  <strong className="text-zinc-300">Scores:</strong> Fit blends environment and technical signals; use the
                  output as feedback, not a verdict on candidacy.
                </span>
              </li>
            </ul>
          </div>
        </details>
      </div>
    </section>
  );
}

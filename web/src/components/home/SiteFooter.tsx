export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-[#0A0A0A] print:hidden">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-white ring-1 ring-zinc-700">
                FR
              </span>
              Final Round
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
              Prototype for finance interview readiness. Not a hiring decision or legal advice.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Jump</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href="#overview" className="text-zinc-400 hover:text-white">
                    Overview
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-zinc-400 hover:text-white">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#tips" className="text-zinc-400 hover:text-white">
                    Tips
                  </a>
                </li>
                <li>
                  <a href="#assessment" className="text-zinc-400 hover:text-white">
                    Assessment
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Note</p>
              <p className="mt-3 text-sm text-zinc-500">
                Camera access captures one frame only. No video upload; images are not stored by default in this demo.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-white/5 pt-8 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Built for MIS capstone — finance recruitment prep tooling.</span>
          <span className="text-zinc-600">© {new Date().getFullYear()} Final Round prototype</span>
        </div>
      </div>
    </footer>
  );
}

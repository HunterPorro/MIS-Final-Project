export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-black/20 print:hidden">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-white">
              <span className="flex h-9 w-9 items-center justify-center">
                {/* keep footer dependency-free from app shell; inline mark */}
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.85)]"
                  style={{ boxShadow: "0 18px 50px -30px rgba(79, 70, 229, 0.55)" }}
                  aria-hidden
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6.5 7.2c0-1 0.8-1.8 1.8-1.8h7.4c1 0 1.8.8 1.8 1.8v9.6c0 1-.8 1.8-1.8 1.8H8.3c-1 0-1.8-.8-1.8-1.8V7.2Z"
                      stroke="rgba(255,255,255,0.75)"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M9 9h6M9 12h4.8M9 15h5.4"
                      stroke="rgba(96,165,250,0.85)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </span>
              Final Round
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
              Prototype for finance interview readiness. Not a hiring decision or legal advice.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Product</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href="/interview" className="text-zinc-400 hover:text-white">
                    Mock interview
                  </a>
                </li>
                <li>
                  <a href="/superday" className="text-zinc-400 hover:text-white">
                    Superday session
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-zinc-400 hover:text-white">
                    How it works
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

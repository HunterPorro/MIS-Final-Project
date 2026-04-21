import Link from "next/link";
import { BrandMark, BrandWordmark } from "@/components/brand/BrandMark";

const footerLink =
  "rounded-sm text-zinc-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-black/20 print:hidden">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="group flex items-center gap-2.5 text-white">
              <BrandMark size={36} />
              <BrandWordmark />
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
                  <Link href="/interview" className={footerLink}>
                    Prep by topic
                  </Link>
                </li>
                <li>
                  <Link href="/superday" className={footerLink}>
                    Full mock interview
                  </Link>
                </li>
                <li>
                  <Link href="/team" className={footerLink}>
                    Team
                  </Link>
                </li>
                <li>
                  <a href="#how-it-works" className={footerLink}>
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const nav = [
  { href: "#overview", label: "Overview" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#tips", label: "Tips" },
  { href: "#assessment", label: "Assessment" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <a
        href="#assessment"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-emerald-950"
      >
        Skip to assessment
      </a>

      <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-lg font-bold text-emerald-950 shadow-lg shadow-emerald-900/40">
              FR
            </span>
            <span className="hidden sm:inline">Final Round</span>
          </Link>

          <nav className="hidden md:flex md:items-center md:gap-1">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="#assessment"
              className="hidden rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-md shadow-emerald-900/30 transition hover:bg-emerald-400 sm:inline-flex"
            >
              Start
            </a>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="mobile-nav" className="border-t border-white/5 bg-zinc-950 px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-1">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-3 text-zinc-200 hover:bg-white/5"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <a
                href="#assessment"
                className="mt-2 rounded-full bg-emerald-500 px-4 py-3 text-center text-sm font-semibold text-emerald-950"
                onClick={() => setMenuOpen(false)}
              >
                Start assessment
              </a>
            </nav>
          </div>
        )}
      </header>

      <main className="relative flex-1">{children}</main>
    </div>
  );
}

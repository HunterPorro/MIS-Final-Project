"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark, BrandWordmark } from "@/components/brand/BrandMark";

const nav = [
  { href: "/", label: "Home" },
  { href: "/interview", label: "Prep by topic" },
  { href: "/superday", label: "Full mock interview" },
  { href: "/team", label: "Team" },
];

const navLinkClass =
  "rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";
const navInactive = "text-zinc-400 hover:bg-white/5 hover:text-white";
const navActive = "bg-white/10 text-white";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
      <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            aria-label="Final Round home"
            className="group flex items-center gap-2.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-lg"
          >
            <BrandMark size={36} />
            <BrandWordmark className="hidden sm:inline" />
          </Link>

          <nav className="hidden md:flex md:items-center md:gap-1" aria-label="Primary">
            {nav.map((item) => {
              const isHome = item.href === "/";
              const isActive = isHome ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${navLinkClass} ${isActive ? navActive : navInactive}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/interview"
              className="hidden rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:inline-flex"
            >
              Open prep room
            </Link>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 md:hidden"
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
            <nav className="flex flex-col gap-1" aria-label="Mobile primary">
              {nav.map((item) => {
                const isHome = item.href === "/";
                const isActive = isHome ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25 ${isActive ? "bg-white/10 text-white" : "text-zinc-200 hover:bg-white/5"}`}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/interview"
                className="mt-2 rounded-full bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                onClick={() => setMenuOpen(false)}
              >
                Open prep room
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main className="relative flex-1">{children}</main>
    </div>
  );
}

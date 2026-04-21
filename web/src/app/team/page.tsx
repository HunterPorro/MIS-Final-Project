"use client";

import Link from "next/link";
import Image from "next/image";

type Founder = {
  name: string;
  title: string;
  bio: string;
  imageSrc?: string;
  links?: { label: string; href: string }[];
};

const FOUNDERS: Founder[] = [
  {
    name: "Hunter Porro",
    title: "Incoming Investment Banking Summer Analyst at UBS",
    imageSrc: "/team/hunter-porro.png",
    bio: "Building Final Round as a HireVue-style practice room for finance interviews: fast reps, clear rubrics, and actionable coaching.",
    links: [
      { label: "LinkedIn", href: "#" },
      { label: "Email", href: "#" },
    ],
  },
];

function FounderCard({ f }: { f: Founder }) {
  return (
    <article className="meet-panel frame-gradient p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {f.imageSrc ? (
            <div
              className="relative h-12 w-12 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.85)]"
              style={{ boxShadow: "0 18px 50px -30px rgba(79, 70, 229, 0.55)" }}
            >
              <Image
                src={f.imageSrc}
                alt={`${f.name} headshot`}
                fill
                sizes="48px"
                className="object-cover"
                priority
              />
            </div>
          ) : null}
          <div>
            <div className="text-lg font-semibold text-white">{f.name}</div>
            <div className="text-sm text-zinc-400">{f.title}</div>
          </div>
        </div>
        {f.links?.length ? (
          <div className="flex items-center gap-2">
            {f.links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
              >
                {l.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-zinc-300">{f.bio}</p>
    </article>
  );
}

export default function TeamPage() {
  return (
    <div className="app-backdrop mx-auto min-h-[calc(100vh-64px)] max-w-6xl px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Team</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Founders</h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
          Final Round is built as a focused interview practice product: record once, get a rubric-driven report, iterate fast.
        </p>
      </div>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        {FOUNDERS.map((f) => (
          <FounderCard key={f.name} f={f} />
        ))}

        <div className="meet-panel frame-gradient p-6 sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Want to reach us?</div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            Add real contact links in `web/src/app/team/page.tsx` (LinkedIn/email) before you ship public beta.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/interview"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-200"
            >
              Join interview room
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}


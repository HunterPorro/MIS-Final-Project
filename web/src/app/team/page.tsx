"use client";

import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/layout/AppShell";

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
    links: [{ label: "LinkedIn", href: "https://www.linkedin.com/in/hunterporro/" }],
  },
  {
    name: "Jackson Kohls",
    title: "Incoming Investment Banking Summer Analyst at Deutsche Bank",
    imageSrc: "/team/jackson-kohls.png",
    bio: "Co-building Final Round to make finance interview practice feel like the real thing: structured prompts, feedback you can act on, and room to improve.",
    links: [{ label: "LinkedIn", href: "https://www.linkedin.com/in/jackson-kohls/" }],
  },
  {
    name: "Michael Galbato",
    title: "Incoming Investor Relations Summer Analyst at Goldman Sachs",
    imageSrc: "/team/michael-galbato.png",
    bio: "Helping shape Final Round so candidates get clear, repeatable practice and feedback that mirrors how they’ll be evaluated on the desk.",
    links: [{ label: "LinkedIn", href: "https://www.linkedin.com/in/michaelgalbato/" }],
  },
  {
    name: "Michael Minchak",
    title: "Incoming Sales and Trading Summer Analyst at JP Morgan",
    imageSrc: "/team/michael-minchak.png",
    bio: "Contributing to Final Round’s product direction so practice sessions stay realistic for markets-facing interviews and feedback stays practical.",
  },
];

function FounderCard({ f }: { f: Founder }) {
  return (
    <article className="meet-panel frame-gradient flex h-full flex-col p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {f.imageSrc ? (
            <div
              className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.85)]"
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
          <div className="min-w-0">
            <div className="text-lg font-semibold text-white">{f.name}</div>
            <div className="text-sm text-zinc-400">{f.title}</div>
          </div>
        </div>
        {f.links?.length ? (
          <div className="flex shrink-0 items-center gap-2">
            {f.links.map((l) => {
              const external = l.href.startsWith("http");
              return (
                <a
                  key={l.label}
                  href={l.href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  {l.label}
                </a>
              );
            })}
          </div>
        ) : null}
      </div>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-300">{f.bio}</p>
    </article>
  );
}

export default function TeamPage() {
  return (
    <AppShell>
    <div className="app-backdrop mx-auto min-h-[calc(100vh-64px)] max-w-6xl px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Team</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Founders</h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
          Final Round is for candidates preparing for finance interviews: practice that feels like the real platform, rubric-driven
          feedback, and fast iteration. It&apos;s a coaching tool—not a substitute for how firms make hiring decisions.
        </p>
        <p className="mt-4 text-xs leading-relaxed text-zinc-600 sm:text-sm">
          <span className="text-zinc-500">Stack:</span> Whisper ASR, DistilBERT technical classifier, ResNet workspace CNN, and
          rule-based behavioral scoring—see the{" "}
          <Link href="/#how-it-works" className="font-medium text-zinc-400 underline-offset-4 hover:text-zinc-300 hover:underline">
            product walkthrough
          </Link>{" "}
          or repo README for detail.
        </p>
      </div>

      <section className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2" aria-label="Founding team">
        {FOUNDERS.map((f) => (
          <FounderCard key={f.name} f={f} />
        ))}
      </section>

      <section className="meet-panel frame-gradient mx-auto mt-10 max-w-2xl p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Get practicing</div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          Reach founders via LinkedIn on the cards above—or jump straight into a session.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/interview"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-200"
          >
            Open prep room
          </Link>
          <Link
            href="/superday"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
          >
            Run full mock interview
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            Back to home
          </Link>
        </div>
      </section>
    </div>
    </AppShell>
  );
}

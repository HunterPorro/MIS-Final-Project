"use client";

import { useMemo, useState } from "react";

type DemoTab = "prompt" | "record" | "report";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function ScoreBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  const pct = Math.round(clamp01(value / 100) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-zinc-200">{label}</span>
        <span className="tabular-nums text-zinc-400">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-white/5">
        <div className={`h-full rounded-full ${tone} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function InteractiveDemo() {
  const [tab, setTab] = useState<DemoTab>("prompt");

  const prompt = useMemo(
    () => ({
      title: "Tell me about yourself",
      body: "Give a 60–90 second overview: who you are, what you’ve done, why finance, and why you’re a strong fit for this role.",
    }),
    [],
  );

  return (
    <section className="border-b border-white/5 py-16 sm:py-24 print:hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="type-h1">See the flow</h2>
          <p className="mt-4 text-zinc-300">
            An interactive walkthrough of what happens from prompt to report—without leaving the homepage.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="frame-gradient">
            <div className="overflow-hidden rounded-2xl bg-black shadow-[0_18px_50px_-35px_rgba(0,0,0,0.85)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-100">Demo room</div>
                  <div className="mt-0.5 text-xs text-zinc-500">Prompt · Record · Report</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                  Connected
                </div>
              </div>

              <div className="relative aspect-video bg-zinc-950">
                {tab === "prompt" && (
                  <div className="absolute inset-0 grid place-items-center p-6">
                    <div className="w-full max-w-xl meet-section">
                      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Prompt</div>
                      <div className="mt-2 text-xl font-semibold text-white">{prompt.title}</div>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{prompt.body}</p>
                    </div>
                  </div>
                )}
                {tab === "record" && (
                  <div className="absolute inset-0 grid place-items-center p-6">
                    <div className="w-full max-w-xl meet-section">
                      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Recording</div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-sm font-semibold text-white">Live mic level</div>
                        <div className="meet-meter" aria-hidden>
                          <div className="meet-meter-fill h-full w-[62%]" />
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                        Record a one-take answer with keyboard shortcuts (Space). Upload or capture a frame if you want the environment signal.
                      </p>
                    </div>
                  </div>
                )}
                {tab === "report" && (
                  <div className="absolute inset-0 grid place-items-center p-6">
                    <div className="w-full max-w-xl grid gap-3">
                      <div className="meet-section">
                        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Fit</div>
                        <div className="mt-2 flex items-end justify-between gap-4">
                          <div className="meet-kpi tabular-nums">78</div>
                          <div className="text-right">
                            <div className="meet-subtle">Composite score</div>
                            <div className="meet-subtle">Environment · Technical · Behavioral</div>
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          <ScoreBar label="Environment" value={64} tone="bg-emerald-400/70" />
                          <ScoreBar label="Technical" value={72} tone="bg-sky-400/70" />
                          <ScoreBar label="Behavioral" value={84} tone="bg-violet-400/70" />
                        </div>
                      </div>
                      <div className="meet-section">
                        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Coaching</div>
                        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                          {[
                            "Add one quantified outcome (%, $, volume) to strengthen impact.",
                            "Slow down slightly and land a clear closing sentence.",
                            "Cover one missing concept explicitly (e.g., WACC assumptions).",
                          ].map((s) => (
                            <li key={s} className="flex gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-white/5 bg-zinc-950/50 p-3">
                <div className="flex flex-wrap gap-2">
                  {([
                    { id: "prompt", label: "Prompt" },
                    { id: "record", label: "Record" },
                    { id: "report", label: "Report" },
                  ] as const).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`meet-tab pressable ${tab === t.id ? "meet-tab-active" : ""}`}
                      onClick={() => setTab(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {[
              { k: "Why it feels real", v: "A room-style UI with shortcuts, live mic level, and one-take flow." },
              { k: "Why it helps", v: "You get specific gaps and coaching actions—not generic tips." },
              { k: "How to use it", v: "Do 3 reps per prompt, then run a Superday session to consolidate." },
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


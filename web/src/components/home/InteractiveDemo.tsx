"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type DemoMode = "prep" | "fullmock";
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

const PREP_PROMPT = {
  title: "Walk me through a DCF",
  body: "Technical prompt from the bank—answer in one take, then review fit, gaps, and coaching for this question only.",
};

const FULL_PROMPT = {
  title: "Question 2 of 3 · Behavioral",
  body: "Timed take (max 1:30). Submit each answer; you get one combined session report after the final question—like a Superday or HireVue round.",
};

export function InteractiveDemo() {
  const [mode, setMode] = useState<DemoMode>("prep");
  const [tab, setTab] = useState<DemoTab>("prompt");

  const prompt = useMemo(() => (mode === "prep" ? PREP_PROMPT : FULL_PROMPT), [mode]);

  return (
    <div className="mt-10">
      <div className="mx-auto max-w-2xl text-center">
        <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Try the flow</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Switch modes to see how a single-topic rep differs from a multi-question run—then step through prompt → record → report.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="frame-gradient">
          <div className="relative flex flex-col overflow-hidden rounded-2xl bg-black shadow-[0_18px_50px_-35px_rgba(0,0,0,0.85)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-100">Interactive preview</div>
                <div className="mt-0.5 text-xs text-zinc-500">Same pipeline—different session shape</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} aria-hidden />
                Connected
              </div>
            </div>

            <div className="border-b border-white/5 bg-zinc-950/80 px-3 py-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`meet-tab pressable text-xs sm:text-[13px] ${mode === "prep" ? "meet-tab-active" : ""}`}
                  onClick={() => {
                    setMode("prep");
                    setTab("prompt");
                  }}
                >
                  Prep by topic
                </button>
                <button
                  type="button"
                  className={`meet-tab pressable text-xs sm:text-[13px] ${mode === "fullmock" ? "meet-tab-active" : ""}`}
                  onClick={() => {
                    setMode("fullmock");
                    setTab("prompt");
                  }}
                >
                  Full mock interview
                </button>
              </div>
            </div>

            <div className="relative aspect-video overflow-hidden bg-zinc-950">
              {tab === "prompt" && (
                <div className="absolute inset-0 flex items-center justify-center overflow-y-auto overscroll-contain p-4 sm:p-6">
                  <div className="w-full max-w-xl meet-section">
                    <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Prompt</div>
                    <div className="mt-2 text-xl font-semibold text-white">{prompt.title}</div>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-300">{prompt.body}</p>
                  </div>
                </div>
              )}
              {tab === "record" && (
                <div className="absolute inset-0 flex items-center justify-center overflow-y-auto overscroll-contain p-4 sm:p-6">
                  <div className="w-full max-w-xl meet-section">
                    <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Recording</div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">Live mic level</div>
                      <div className="meet-meter" aria-hidden>
                        <div
                          className="meet-meter-fill h-full transition-[width]"
                          style={{ width: mode === "prep" ? "62%" : "58%" }}
                        />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                      {mode === "prep"
                        ? "One take per prompt—Space to start/stop. Optional environment frame for scoring."
                        : "Timed takes with countdown; submit each answer, then move on. Feedback rolls up at the end of the session."}
                    </p>
                  </div>
                </div>
              )}
              {tab === "report" && (
                <div className="absolute inset-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                  <div className="mx-auto grid w-full max-w-xl gap-3 pb-1">
                    {mode === "prep" ? (
                      <>
                        <div className="meet-section">
                          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Fit</div>
                          <div className="mt-2 flex items-end justify-between gap-4">
                            <div className="meet-kpi tabular-nums">78</div>
                            <div className="text-right">
                              <div className="meet-subtle">This question</div>
                              <div className="meet-subtle">Env · Tech · Behavioral</div>
                            </div>
                          </div>
                          <div className="mt-4 space-y-3">
                            <ScoreBar label="Environment" value={64} tone="bg-indigo-400/70" />
                            <ScoreBar label="Technical" value={72} tone="bg-sky-400/70" />
                            <ScoreBar label="Behavioral" value={84} tone="bg-indigo-300/70" />
                          </div>
                        </div>
                        <div className="meet-section">
                          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Coaching</div>
                          <ul className="mt-2 space-y-2 text-xs leading-snug text-zinc-300 sm:mt-3 sm:text-sm sm:leading-relaxed">
                            {[
                              "Name one more terminal value assumption explicitly.",
                              "Tie WACC components to your story.",
                              "Add a single quantified outcome.",
                            ].map((s) => (
                              <li key={s} className="flex gap-2">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="meet-section">
                          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Session report</div>
                          <div className="mt-2 flex items-end justify-between gap-4">
                            <div className="meet-kpi tabular-nums">74</div>
                            <div className="text-right">
                              <div className="meet-subtle">Avg fit · 3 questions</div>
                              <div className="meet-subtle">Aggregated coaching</div>
                            </div>
                          </div>
                          <div className="mt-4 space-y-3">
                            <ScoreBar label="Avg technical" value={71} tone="bg-sky-400/70" />
                            <ScoreBar label="Avg behavioral" value={79} tone="bg-indigo-300/70" />
                            <ScoreBar label="Avg environment" value={68} tone="bg-indigo-400/70" />
                          </div>
                        </div>
                        <div className="meet-section">
                          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Top themes</div>
                          <ul className="mt-2 space-y-2 text-xs leading-snug text-zinc-300 sm:mt-3 sm:text-sm sm:leading-relaxed">
                            {[
                              "Tighten STAR structure on behavioral prompts.",
                              "Bring more comps language into technical answers.",
                              "Strong quant habit—keep tying numbers to outcomes.",
                            ].map((s) => (
                              <li key={s} className="flex gap-2">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative z-10 shrink-0 border-t border-white/5 bg-zinc-950/95 p-3 backdrop-blur-sm">
              <div className="flex flex-wrap gap-2">
                {(["prompt", "record", "report"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`meet-tab pressable ${tab === t ? "meet-tab-active" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "prompt" ? "Prompt" : t === "record" ? "Record" : "Report"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4 rounded-2xl border border-white/10 bg-black/25 p-6">
          <p className="text-sm leading-relaxed text-zinc-300">
            <span className="font-semibold text-zinc-100">Prep by topic</span> is for drilling one bank-style prompt at a time.
            <span className="font-semibold text-zinc-100"> Full mock interview</span> strings prompts together with a single
            session-level report—closer to a real multi-station day.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/interview"
              className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              Open prep room
            </Link>
            <Link
              href="/superday"
              className="inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
            >
              Start full mock
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

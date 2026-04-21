"use client";

import { useEffect, useState } from "react";

const STEPS = {
  mock: [
    "Transcribing speech",
    "Behavioral & delivery rubric",
    "Technical depth scan",
    "Workspace signal (if frame)",
    "Composing narrative",
  ],
  assess: [
    "Transcribing & parsing answer",
    "Workspace image scoring",
    "Technical model & rubric",
    "Fit & narrative",
  ],
  session: [
    "Uploading take",
    "Transcribing speech",
    "Scoring answer",
    "Session rollup",
  ],
} as const;

type Variant = keyof typeof STEPS;

export function AnalysisProgress({
  variant,
  className = "",
}: {
  variant: Variant;
  className?: string;
}) {
  const steps = STEPS[variant];
  const [phase, setPhase] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % steps.length);
    }, 1350);
    return () => window.clearInterval(id);
  }, [reduceMotion, steps.length]);

  return (
    <div
      className={`analysis-progress-root w-full max-w-[min(100%,280px)] text-left ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="analysis-progress-track h-1 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="analysis-progress-indeterminate h-full rounded-full bg-gradient-to-r from-sky-500/30 via-sky-400/80 to-sky-500/30" />
      </div>
      {reduceMotion ? (
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
          Running analysis (transcription, scoring, narrative). This can take up to a couple of minutes on first load.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {steps.map((label, i) => {
            const active = i === phase;
            return (
              <li
                key={label}
                className={`flex items-center gap-2 text-xs transition-colors duration-300 ${
                  active ? "font-medium text-sky-200/95" : "text-zinc-500"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300 ${
                    active ? "scale-110 bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.45)]" : "bg-zinc-600"
                  }`}
                  aria-hidden
                />
                <span>{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

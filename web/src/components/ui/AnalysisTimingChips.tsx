"use client";

/** Compact stage timing chips after a successful run (from API `timings_ms`). */
export function AnalysisTimingChips({ timings }: { timings: Record<string, number> }) {
  const entries = Object.entries(timings).filter(([k]) => k !== "total");
  if (entries.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <span key={k} className="meet-chip text-[0.65rem]">
          <span className="text-zinc-500">{k}</span>{" "}
          <span className="tabular-nums font-medium text-zinc-200">{Math.round(v)}ms</span>
        </span>
      ))}
      {"total" in timings ? (
        <span className="meet-chip text-[0.65rem]">
          <span className="text-zinc-500">total</span>{" "}
          <span className="tabular-nums font-medium text-zinc-200">{Math.round(timings.total)}ms</span>
        </span>
      ) : null}
    </div>
  );
}

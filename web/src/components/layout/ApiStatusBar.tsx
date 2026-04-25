"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiUrl, getApiConnectionDiagnostics } from "@/lib/api";

type HealthJson = {
  ok?: boolean;
  ready?: boolean;
  status?: string;
};

export function ApiStatusBar() {
  const diag = getApiConnectionDiagnostics();
  const [ready, setReady] = useState<boolean | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [warmupMs, setWarmupMs] = useState<number | null>(null);
  const [warming, setWarming] = useState(false);

  const ping = useCallback(async () => {
    try {
      const res = await apiFetch(apiUrl("/health"), { method: "GET" });
      if (!res.ok) {
        setReady(false);
        setLastError(`HTTP ${res.status}`);
        return;
      }
      const j = (await res.json()) as HealthJson;
      setReady(Boolean(j.ready));
      setLastError(null);
    } catch (e) {
      setReady(false);
      setLastError(e instanceof Error ? e.message : "Unreachable");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void ping(), 0);
    const id = window.setInterval(() => void ping(), 20_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, [ping]);

  const runWarmup = async () => {
    setWarming(true);
    setWarmupMs(null);
    try {
      const t0 = performance.now();
      const res = await apiFetch(apiUrl("/warmup"), { method: "POST" });
      setWarmupMs(Math.round(performance.now() - t0));
      if (res.ok) void ping();
    } finally {
      setWarming(false);
    }
  };

  const ok = ready === true;
  const down = ready === false;

  return (
    <div className="border-b border-white/5 bg-zinc-950/60 px-4 py-2 text-xs text-zinc-400 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-zinc-300">API</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[0.65rem] text-zinc-300">
            {diag.mode === "proxy" ? "proxy /api/py" : "direct"}
          </span>
          <span className="truncate font-mono text-[0.65rem] text-zinc-500" title={diag.resolvedBase}>
            {diag.resolvedBase}
          </span>
          {ready === null ? (
            <span className="text-zinc-500">Checking…</span>
          ) : ok ? (
            <span className="text-emerald-300/90">Ready</span>
          ) : (
            <span className="text-amber-200/90">Down</span>
          )}
          {lastError ? <span className="text-red-200/80">({lastError})</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="max-w-[min(100%,420px)] text-[0.7rem] leading-snug text-zinc-500">
            {diag.hint}{" "}
            <span className="text-zinc-600">
              Prod: set <code className="text-zinc-400">NEXT_PUBLIC_USE_PROXY=0</code> +{" "}
              <code className="text-zinc-400">NEXT_PUBLIC_API_URL</code> and <code className="text-zinc-400">CORS_ORIGINS</code> on the API.
            </span>
          </p>
          <button
            type="button"
            disabled={warming || down}
            onClick={() => void runWarmup()}
            className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[0.7rem] font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-50"
          >
            {warming ? "Warmup…" : "Warmup"}
          </button>
          {warmupMs != null ? <span className="tabular-nums text-zinc-500">{warmupMs}ms</span> : null}
        </div>
      </div>
    </div>
  );
}

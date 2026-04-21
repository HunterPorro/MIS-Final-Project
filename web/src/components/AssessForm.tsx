"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssessResponse, Topic } from "@/lib/types";
import { apiUrl } from "@/lib/api";

type ApiHealth = {
  ok: boolean;
  service?: string;
  version?: string;
  workspace_ckpt: boolean;
  technical_model: boolean;
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) {
      return j.detail
        .map((d: { msg?: string; loc?: unknown }) => d.msg ?? JSON.stringify(d))
        .join("; ");
    }
  } catch {
    // not JSON
  }
  const trimmed = text.trim();
  if (trimmed.length > 0 && trimmed.length < 800) return trimmed;
  return `Request failed (HTTP ${res.status})`;
}

const MIN_ANSWER_CHARS = 10;
const MAX_ANSWER_CHARS = 12000;

function friendlyError(status: number, message: string): string {
  if (status === 503) {
    return `${message} Train models with ./scripts/train_all.sh (see README) and ensure the API can load models/workspace/ and models/technical/.`;
  }
  if (status === 502) {
    return `${message} If using the Next.js proxy, set BACKEND_URL to your FastAPI base URL.`;
  }
  return message;
}

export function AssessForm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [topic, setTopic] = useState<Topic>("M&A");
  const [answer, setAnswer] = useState("");
  const [snapshotFile, setSnapshotFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }, [stream]);

  const refreshHealth = useCallback(async () => {
    setHealth(null);
    setHealthError(null);
    try {
      const res = await fetch(apiUrl("/health"), { cache: "no-store" });
      if (!res.ok) {
        setHealthError(`Health check failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as ApiHealth;
      setHealth(data);
      setHealthError(null);
    } catch {
      setHealthError(
        "Cannot reach the API. Activate your venv, run uvicorn, or ./scripts/dev.sh / npm run dev.",
      );
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!result) return;
    const el = document.getElementById("assessment-print");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const startCamera = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 1280, height: 720 },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
    } catch {
      setError("Camera access denied or unavailable. Upload an image instead.");
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "webcam-snapshot.jpg", { type: "image/jpeg" });
        setSnapshotFile(file);
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.92,
    );
  };

  const onPickFile = (f: File | null) => {
    if (!f) return;
    setSnapshotFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!snapshotFile) {
      setError("Add a webcam snapshot or upload an image.");
      return;
    }
    if (answer.trim().length < MIN_ANSWER_CHARS) {
      setError(`Write at least ${MIN_ANSWER_CHARS}+ characters for your technical answer.`);
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("answer_text", answer.trim());
      fd.append("image", snapshotFile);
      const res = await fetch(apiUrl("/assess"), {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const raw = await parseErrorMessage(res);
        throw new Error(friendlyError(res.status, raw));
      }
      const data = (await res.json()) as AssessResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const copyAssessment = async () => {
    if (!result) return;
    const text = [
      `Final Round — Readiness assessment`,
      `Fit score: ${result.fit.fit_score}`,
      `Environment: ${result.fit.environment_component} · Technical: ${result.fit.technical_component}`,
      `Workspace: ${result.workspace.label} (${Math.round(result.workspace.confidence * 100)}% conf.)`,
      `Technical: ${result.technical.expertise_label} · ${result.technical.topic}`,
      `Skills: ${result.technical.skills_identified.join("; ") || "—"}`,
      `Reinforce: ${result.technical.concepts_missed.join("; ") || "—"}`,
      ``,
      result.narrative,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied to clipboard.");
      setError(null);
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopyFeedback(null);
        copyTimerRef.current = undefined;
      }, 2500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const modelsReady = health?.workspace_ckpt === true && health?.technical_model === true;

  const resetAssessment = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSnapshotFile(null);
    setResult(null);
    setError(null);
    setCopyFeedback(null);
    setAnswer("");
    setTopic("M&A");
    requestAnimationFrame(() => {
      document.getElementById("assessment-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [stream, previewUrl]);

  const checkingHealth = !health && !healthError;

  return (
    <div className="mx-auto max-w-6xl px-4 print:max-w-none print:px-6">
      <div className="mb-10 text-center print:hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Assessment</p>
        <h2 id="assessment-heading" className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Run your readiness check
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Capture your environment once, answer in your own words, and get a Fit Score with narrative feedback.
        </p>
      </div>

      <div
        className={`mx-auto mb-8 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm print:hidden ${
          healthError
            ? "border-amber-500/30 bg-amber-950/35 text-amber-100"
            : modelsReady
              ? "border-zinc-800 bg-zinc-900/50 text-white"
              : checkingHealth
                ? "border-zinc-800 bg-zinc-900/20 text-zinc-400"
                : "border-zinc-800 bg-zinc-900/50 text-zinc-300"
        }`}
        role="status"
        aria-busy={checkingHealth}
      >
        {checkingHealth ? (
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <span className="sr-only">Checking API status</span>
            <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-zinc-500" aria-hidden />
            <div className="h-3 max-w-[14rem] flex-1 animate-pulse rounded bg-zinc-700" aria-hidden />
            <div className="hidden h-3 w-24 animate-pulse rounded bg-zinc-700 sm:block" aria-hidden />
          </div>
        ) : (
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                healthError ? "bg-amber-400" : modelsReady ? "bg-white" : health ? "bg-zinc-500" : "bg-zinc-600"
              }`}
              aria-hidden
            />
            {healthError ? (
              healthError
            ) : health ? (
              <>
                API online
                {health.version ? ` (v${health.version})` : ""}
                {modelsReady
                  ? " — models loaded."
                  : " — models missing: run ./scripts/train_all.sh (see README)."}
              </>
            ) : (
              <span className="text-zinc-500">Status unavailable</span>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => void refreshHealth()}
          className="ui-btn-ghost shrink-0 border-white/15 py-2 text-xs"
        >
          Retry health
        </button>
      </div>

      <aside className="ui-card mx-auto mb-10 max-w-3xl p-5 print:hidden">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Privacy</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Your webcam captures one still frame only for this session. This prototype does not upload video or retain
          images on the server by default. Results are coaching feedback—not a hiring outcome.
        </p>
      </aside>

      <form onSubmit={onSubmit} className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 print:hidden">
        <section className="ui-card ui-card-hover space-y-5 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#0F0F11] text-lg font-bold text-white ring-1 ring-zinc-800">
              1
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-white">Interview environment</h3>
              <p className="mt-1 text-sm text-zinc-500">Webcam snapshot or upload</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!stream && !previewUrl && (
              <button type="button" onClick={startCamera} className="ui-btn-primary max-w-none sm:w-auto sm:min-w-[140px]">
                Start webcam
              </button>
            )}
            {stream && (
              <>
                <button
                  type="button"
                  onClick={captureFrame}
                  className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow hover:bg-zinc-100"
                >
                  Capture frame
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="ui-btn-ghost py-3"
                >
                  Stop camera
                </button>
              </>
            )}
            <label className="ui-btn-ghost cursor-pointer border-dashed py-3">
              Upload image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black/50 ring-1 ring-black/40">
            {stream ? (
              <video ref={videoRef} className="aspect-video w-full object-cover" playsInline muted />
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Snapshot preview" className="aspect-video w-full object-cover" />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 px-6 text-center text-sm text-zinc-500">
                <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-600">Preview</span>
                Start the camera or upload a photo
              </div>
            )}
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">
            Tip: neutral background, face the light, remove clutter from the frame.
          </p>
        </section>

        <section className="ui-card ui-card-hover flex flex-col space-y-5 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#0F0F11] text-lg font-bold text-white ring-1 ring-zinc-800">
              2
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-white">Technical response</h3>
              <p className="mt-1 text-sm text-zinc-500">Topic + written answer</p>
            </div>
          </div>

          <div>
            <label className="ui-label" htmlFor="topic">
              Topic
            </label>
            <select
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value as Topic)}
              className="ui-input"
            >
              <option>M&A</option>
              <option>LBO</option>
              <option>Valuation</option>
            </select>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <label className="ui-label" htmlFor="answer">
              Answer
            </label>
            <textarea
              id="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value.slice(0, MAX_ANSWER_CHARS))}
              rows={11}
              maxLength={MAX_ANSWER_CHARS}
              placeholder="Example: Walk through accretion/dilution for a stock deal, or how sponsor IRR is driven in an LBO..."
              className="ui-input min-h-[220px] resize-y font-[family-name:var(--font-geist-sans)] leading-relaxed"
              aria-describedby="answer-hint"
            />
            <div
              id="answer-hint"
              className={`mt-2 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums ${
                answer.trim().length < MIN_ANSWER_CHARS ? "text-amber-400/90" : "text-zinc-500"
              }`}
            >
              <span>
                {answer.length} / {MAX_ANSWER_CHARS} characters
                {answer.trim().length < MIN_ANSWER_CHARS && (
                  <span className="text-zinc-500"> · need at least {MIN_ANSWER_CHARS}</span>
                )}
              </span>
              {answer.length >= MAX_ANSWER_CHARS * 0.95 && (
                <span className="text-amber-400/80">Approaching limit</span>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="ui-btn-primary mt-auto"
          >
            {loading ? (
              <>
                <Spinner className="h-5 w-5 motion-reduce:animate-none" />
                Running models…
              </>
            ) : (
              "Generate readiness report"
            )}
          </button>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm leading-relaxed text-red-100"
            >
              {error}
            </div>
          )}
        </section>
      </form>

      {result && (
        <section
          id="assessment-print"
          className="animate-fade-in ui-card mx-auto mt-12 max-w-6xl border-zinc-800 bg-[#0F0F11] p-6 shadow-xl sm:p-10 print:mt-0 print:border print:border-zinc-300 print:bg-white print:text-zinc-900 print:shadow-none"
        >
          <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 pb-8 print:hidden">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Fit score</p>
              <p className="mt-3 text-6xl font-bold tracking-tight text-white">
                {result.fit.fit_score}
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Weighted blend of environment ({result.fit.weights.environment}) and technical ({result.fit.weights.technical})
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={resetAssessment} className="ui-btn-ghost text-zinc-300 hover:border-zinc-500">
                New assessment
              </button>
              <button type="button" onClick={() => copyAssessment()} className="ui-btn-ghost">
                Copy assessment
              </button>
              {copyFeedback && (
                <span className="text-xs font-medium text-white" aria-live="polite">
                  {copyFeedback}
                </span>
              )}
              <button type="button" onClick={() => window.print()} className="ui-btn-ghost">
                Print / PDF
              </button>
            </div>
            <div className="text-right text-sm tabular-nums text-zinc-400">
              <div>Environment · {result.fit.environment_component}</div>
              <div>Technical · {result.fit.technical_component}</div>
            </div>
          </div>

          <div className="hidden border-b border-zinc-200 pb-6 print:block">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600">Fit score</p>
            <p className="text-5xl font-bold text-zinc-900">{result.fit.fit_score}</p>
            <p className="mt-2 text-sm text-zinc-600">
              Environment {result.fit.environment_component} · Technical {result.fit.technical_component}
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-5 print:border-zinc-200 print:bg-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 print:text-zinc-600">
                Workspace CNN
              </p>
              <p className="mt-3 text-xl font-semibold text-white print:text-zinc-900">
                {result.workspace.label}
                <span className="text-base font-normal text-zinc-500 print:text-zinc-600">
                  {" "}
                  ({Math.round(result.workspace.confidence * 100)}%)
                </span>
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-5 print:border-zinc-200 print:bg-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 print:text-zinc-600">
                Technical model
              </p>
              <p className="mt-3 text-xl font-semibold text-white print:text-zinc-900">
                {result.technical.expertise_label}
                <span className="text-base font-normal text-zinc-500 print:text-zinc-600">
                  {" "}
                  · {result.technical.topic}
                </span>
              </p>
              <p className="mt-2 text-xs tabular-nums text-zinc-500 print:text-zinc-600">
                Classifier confidence · {Math.round(result.technical.level_confidence * 100)}%
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 print:text-zinc-600">
                Skills flagged
              </p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300 print:text-zinc-800">
                {result.technical.skills_identified.length === 0 ? (
                  <li className="text-zinc-500">None matched from lexicon.</li>
                ) : (
                  result.technical.skills_identified.map((s) => (
                    <li key={s} className="flex gap-2 text-zinc-400">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                      {s}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 print:text-zinc-600">
                Concepts to reinforce
              </p>
              <ul className="mt-3 space-y-2 text-sm text-amber-200/95 print:text-amber-900">
                {result.technical.concepts_missed.length === 0 ? (
                  <li className="text-zinc-500 print:text-zinc-600">No checklist gaps flagged.</li>
                ) : (
                  result.technical.concepts_missed.map((s) => (
                    <li key={s} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      {s}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-white/10 pt-8 print:border-zinc-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 print:text-zinc-600">
              Narrative
            </p>
            <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-zinc-200 print:text-zinc-900">
              {result.narrative}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

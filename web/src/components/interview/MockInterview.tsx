"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MockInterviewResponse, Topic } from "@/lib/types";
import { apiUrl } from "@/lib/api";
import { QUESTION_BANK, type InterviewQuestion } from "@/components/interview/QuestionBank";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Spinner() {
  return (
    <svg className="h-5 w-5 motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function encodeWavMonoPCM16(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;

  const mono = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numChannels;
  }

  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let o = 44;
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i] ?? 0));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function blobWebmToWav(webm: Blob): Promise<Blob> {
  const arrayBuf = await webm.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
  const wav = encodeWavMonoPCM16(audioBuf);
  await ctx.close();
  return wav;
}

async function parseError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
  } catch {
    // ignore
  }
  return t.trim() || `HTTP ${res.status}`;
}

export function MockInterview() {
  const [questionId, setQuestionId] = useState<string>(QUESTION_BANK[0]?.id ?? "");
  const question = useMemo<InterviewQuestion>(() => {
    return QUESTION_BANK.find((q) => q.id === questionId) ?? QUESTION_BANK[0];
  }, [questionId]);

  const [topic, setTopic] = useState<Topic>(question?.topicHint ?? "M&A");
  useEffect(() => {
    if (question?.topicHint) setTopic(question.topicHint);
  }, [question?.topicHint]);

  type RightTab = "prompt" | "report" | "transcript";
  const [rightTab, setRightTab] = useState<RightTab>("prompt");

  // optional environment snapshot
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [snapshotFile, setSnapshotFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MockInterviewResponse | null>(null);

  const stopCamera = useCallback(() => {
    camStream?.getTracks().forEach((t) => t.stop());
    setCamStream(null);
  }, [camStream]);

  const startCamera = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 1280, height: 720 },
        audio: false,
      });
      setCamStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
    } catch {
      setError("Camera access denied or unavailable.");
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
        const file = new File([blob], "environment.jpg", { type: "image/jpeg" });
        setSnapshotFile(file);
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.92,
    );
  };

  const startRecording = async () => {
    setError(null);
    setAudioBlob(null);
    setSeconds(0);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const rec = new MediaRecorder(s);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      setRecording(true);
      if (tickRef.current !== undefined) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    } catch {
      setError("Mic access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // ignore
    }
    recorderRef.current = null;
    setRecording(false);
    if (tickRef.current !== undefined) window.clearInterval(tickRef.current);
    tickRef.current = undefined;
    setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
  };

  const submit = async () => {
    setError(null);
    setResult(null);
    if (!audioBlob) {
      setError("Record an answer before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const wav = await blobWebmToWav(audioBlob);
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("question_id", question.id);
      fd.append("question_track", question.track);
      fd.append("audio_wav", new File([wav], "answer.wav", { type: "audio/wav" }));
      if (snapshotFile) fd.append("image", snapshotFile);
      const res = await fetch(apiUrl("/mock-interview"), { method: "POST", body: fd });
      if (!res.ok) throw new Error(await parseError(res));
      const data = (await res.json()) as MockInterviewResponse;
      setResult(data);
      setRightTab("report");
      document.getElementById("report")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSnapshotFile(null);
    setAudioBlob(null);
    setSeconds(0);
    setResult(null);
    setError(null);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (tickRef.current !== undefined) window.clearInterval(tickRef.current);
    };
  }, [stopCamera, previewUrl]);

  return (
    <div className="mx-auto min-h-[calc(100vh-64px)] max-w-6xl px-4 pb-28 pt-6 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-sm">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-100">{question.title}</p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {question.track.toUpperCase()} · Suggested {formatTime(question.suggestedSeconds)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${recording ? "bg-red-400 animate-pulse" : "bg-zinc-600"}`}
                aria-hidden
              />
              <span className="text-xs tabular-nums text-zinc-400">{formatTime(seconds)}</span>
            </div>
          </div>

          <div className="relative aspect-video w-full bg-zinc-950">
            {camStream ? (
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Environment preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-xl font-semibold text-zinc-200">
                    FR
                  </div>
                  <div className="mt-3 text-sm text-zinc-400">Camera off</div>
                  <div className="mt-1 text-xs text-zinc-600">You can still record audio and generate a report.</div>
                </div>
              </div>
            )}

            {audioBlob && !recording && (
              <div className="absolute left-3 top-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                Recorded
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-800 bg-[#0F0F11] shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-white/5 p-3">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={`meet-tab ${rightTab === "prompt" ? "meet-tab-active" : ""}`}
                onClick={() => setRightTab("prompt")}
              >
                Prompt
              </button>
              <button
                type="button"
                className={`meet-tab ${rightTab === "report" ? "meet-tab-active" : ""}`}
                onClick={() => setRightTab("report")}
              >
                Report
              </button>
              <button
                type="button"
                className={`meet-tab ${rightTab === "transcript" ? "meet-tab-active" : ""}`}
                onClick={() => setRightTab("transcript")}
              >
                Transcript
              </button>
            </div>
            <div className="text-xs text-zinc-500">{result ? `Fit ${result.fit.fit_score}` : "No report"}</div>
          </div>

          {rightTab === "prompt" && (
            <div className="p-4">
              <div className="grid gap-3">
                <label className="text-xs font-medium text-zinc-400">
                  Question
                  <select
                    className="mt-2 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                    value={questionId}
                    onChange={(e) => setQuestionId(e.target.value)}
                  >
                    {QUESTION_BANK.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.track.toUpperCase()} · {q.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-zinc-400">
                  Topic
                  <select
                    className="mt-2 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value as Topic)}
                  >
                    <option>M&A</option>
                    <option>LBO</option>
                    <option>Valuation</option>
                  </select>
                </label>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-zinc-100">{question.title}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{question.prompt}</p>
              </div>
            </div>
          )}

          {rightTab === "report" && (
            <div className="p-4">
              {!result ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-400">
                  Record an answer, then generate a report.
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                    <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Summary</div>
                    <div className="mt-2 text-4xl font-semibold text-white">{result.fit.fit_score}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Env {result.fit.environment_component} · Tech {result.fit.technical_component} · Beh{" "}
                      {result.behavioral.score}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                    <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Narrative</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{result.narrative}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {rightTab === "transcript" && (
            <div className="p-4">
              {!result ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-400">
                  Transcript appears after you generate a report.
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Transcript</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{result.transcript}</p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <div className="meet-dock">
        <div className="flex items-center gap-2">
          {!recording ? (
            <button type="button" className="meet-btn meet-btn-primary" onClick={startRecording} aria-label="Start recording">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12a7 7 0 01-14 0" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19v3" />
              </svg>
            </button>
          ) : (
            <button type="button" className="meet-btn meet-btn-danger" onClick={stopRecording} aria-label="Stop recording">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12v12H6z" />
              </svg>
            </button>
          )}

          {!camStream ? (
            <button type="button" className="meet-btn" onClick={startCamera} aria-label="Start camera">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14" />
                <rect x="3" y="7" width="12" height="10" rx="2" ry="2" />
              </svg>
            </button>
          ) : (
            <button type="button" className="meet-btn" onClick={stopCamera} aria-label="Stop camera">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h12a2 2 0 012 2v6a2 2 0 01-2 2H3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" />
              </svg>
            </button>
          )}

          <label className="meet-btn cursor-pointer" aria-label="Upload environment frame">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 10l5-5 5 5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14" />
            </svg>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setSnapshotFile(f);
                setPreviewUrl(URL.createObjectURL(f));
              }}
            />
          </label>

          {camStream && (
            <button type="button" className="meet-btn" onClick={captureFrame} aria-label="Capture environment frame">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h4l2-2h4l2 2h4v12H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </button>
          )}

          <button
            type="button"
            className="meet-btn meet-btn-primary"
            disabled={submitting || !audioBlob}
            onClick={submit}
            aria-busy={submitting}
            aria-label="Generate report"
          >
            {submitting ? (
              <Spinner />
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12" />
              </svg>
            )}
          </button>

          <button type="button" className="meet-btn" onClick={reset} aria-label="Reset">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 101-4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4v6h6" />
            </svg>
          </button>
        </div>
        {error && (
          <div className="mt-2 max-w-[420px] rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}
      </div>

      {result && (
        <section id="report" className="ui-card mx-auto mt-10 max-w-6xl p-6 sm:p-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Fit score</p>
              <p className="mt-2 text-6xl font-bold tracking-tight text-white">{result.fit.fit_score}</p>
              <p className="mt-2 text-sm text-zinc-500">
                Environment {result.fit.environment_component} · Technical {result.fit.technical_component}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Transcript</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{result.transcript}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Narrative</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{result.narrative}</p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Behavioral score</p>
                <p className="mt-2 text-3xl font-semibold text-white">{result.behavioral.score}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Words {result.behavioral.word_count}
                  {result.behavioral.speaking_rate_wpm !== null
                    ? ` · Pace ${Math.round(result.behavioral.speaking_rate_wpm)} wpm`
                    : ""}
                  {result.behavioral.has_numbers ? " · Quantified impact" : " · No numbers"}
                  {` · Fillers ${result.behavioral.filler_total}`}
                </p>
              </div>
              <div className="text-right text-xs text-zinc-500">
                STAR coverage
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  {(["situation", "task", "action", "result"] as const).map((k) => (
                    <span
                      key={k}
                      className={`rounded-full border px-3 py-1 ${
                        result.behavioral.star_coverage[k]
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-700 bg-zinc-900/30 text-zinc-400"
                      }`}
                    >
                      {k.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Coaching</p>
                <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                  {result.behavioral.feedback.length ? (
                    result.behavioral.feedback.map((s) => (
                      <li key={s} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden />
                        {s}
                      </li>
                    ))
                  ) : (
                    <li className="text-zinc-500">No major behavioral flags.</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Filler words</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-zinc-300 sm:grid-cols-3">
                  {Object.entries(result.behavioral.filler_words)
                    .filter(([, v]) => v > 0)
                    .slice(0, 9)
                    .map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-white/10 bg-zinc-900/30 px-3 py-2">
                        <div className="text-xs text-zinc-500">{k}</div>
                        <div className="mt-1 font-semibold tabular-nums text-white">{v}</div>
                      </div>
                    ))}
                  {Object.values(result.behavioral.filler_words).every((v) => v === 0) && (
                    <div className="text-zinc-500">No filler words detected.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Strengths</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                {result.technical.skills_identified.length ? (
                  result.technical.skills_identified.map((s) => (
                    <li key={s} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                      {s}
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">No lexicon strengths matched.</li>
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Gaps</p>
              <ul className="mt-3 space-y-2 text-sm text-amber-200/90">
                {result.technical.concepts_missed.length ? (
                  result.technical.concepts_missed.map((s) => (
                    <li key={s} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
                      {s}
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">No checklist gaps flagged.</li>
                )}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}


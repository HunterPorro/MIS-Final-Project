"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MockInterviewResponse, Topic } from "@/lib/types";
import { apiUrl } from "@/lib/api";
import { QUESTION_BANK, type InterviewQuestion } from "@/components/interview/QuestionBank";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

function average(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

export function SessionInterview() {
  const sessionQuestions = useMemo<InterviewQuestion[]>(() => {
    // Default 3-question flow: 1 behavioral + 2 technical
    const pick = (id: string) => QUESTION_BANK.find((q) => q.id === id);
    return [
      pick("behav-tell-me"),
      pick("tech-valuation"),
      pick("tech-ma"),
    ].filter(Boolean) as InterviewQuestion[];
  }, []);

  const [idx, setIdx] = useState(0);
  const q = sessionQuestions[idx];
  const [topic, setTopic] = useState<Topic>(q?.topicHint ?? "M&A");
  useEffect(() => {
    if (q?.topicHint) setTopic(q.topicHint);
  }, [q?.topicHint]);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | undefined>(undefined);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const [micLevel, setMicLevel] = useState(0); // 0..1

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<MockInterviewResponse[]>([]);
  const done = reports.length === sessionQuestions.length;

  const startRecording = async () => {
    setError(null);
    setAudioBlob(null);
    setSeconds(0);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = s;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.85;
      src.connect(analyser);
      analyserRef.current = analyser;

      const rec = new MediaRecorder(s);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => s.getTracks().forEach((t) => t.stop());
      rec.start();
      setRecording(true);
      if (tickRef.current !== undefined) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => setSeconds((v) => v + 1), 1000);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        const a = analyserRef.current;
        if (!a) return;
        a.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const x = (data[i]! - 128) / 128;
          sum += x * x;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(1, rms * 3.2));
        rafRef.current = window.requestAnimationFrame(loop);
      };
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(loop);
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
    setMicLevel(0);
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
  };

  const submitAnswer = async () => {
    if (!q) return;
    setError(null);
    if (!audioBlob) {
      setError("Record an answer before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const wav = await blobWebmToWav(audioBlob);
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("question_id", q.id);
      fd.append("question_track", q.track);
      fd.append("audio_wav", new File([wav], `${q.id}.wav`, { type: "audio/wav" }));
      const res = await fetch(apiUrl("/mock-interview"), { method: "POST", body: fd });
      if (!res.ok) throw new Error(await parseError(res));
      const data = (await res.json()) as MockInterviewResponse;
      setReports((prev) => [...prev, data]);
      setAudioBlob(null);
      setSeconds(0);
      setIdx((v) => Math.min(v + 1, sessionQuestions.length - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setIdx(0);
    setReports([]);
    setAudioBlob(null);
    setSeconds(0);
    setError(null);
  };

  useEffect(() => {
    return () => {
      if (tickRef.current !== undefined) window.clearInterval(tickRef.current);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      analyserRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const summary = useMemo(() => {
    const fits = reports.map((r) => r.fit.fit_score);
    const tech = reports.map((r) => r.fit.technical_component);
    const env = reports.map((r) => r.fit.environment_component);
    const beh = reports.map((r) => r.behavioral.score);
    const gaps = uniq(reports.flatMap((r) => r.technical.concepts_missed)).slice(0, 7);
    const coaching = uniq(reports.flatMap((r) => r.behavioral.feedback)).slice(0, 7);
    return {
      avgFit: Math.round(average(fits) * 10) / 10,
      avgTech: Math.round(average(tech) * 10) / 10,
      avgEnv: Math.round(average(env) * 10) / 10,
      avgBeh: Math.round(average(beh) * 10) / 10,
      topGaps: gaps,
      topCoaching: coaching,
    };
  }, [reports]);

  return (
    <div className="app-backdrop mx-auto min-h-[calc(100vh-64px)] max-w-6xl px-4 pb-28 pt-6 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Superday session</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Session</h2>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
          Run a short session and get a single aggregated report at the end.
        </p>
      </div>

      <div className="meet-panel mt-10 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Question {Math.min(idx + 1, sessionQuestions.length)} / {sessionQuestions.length}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">{q?.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{q?.prompt}</p>
          </div>
          <div className="shrink-0 text-right text-xs text-zinc-500">
            Suggested time
            <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-200">
              {q ? formatTime(q.suggestedSeconds) : "—"}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="ui-label">
            Topic
            <select className="ui-input" value={topic} onChange={(e) => setTopic(e.target.value as Topic)} disabled={done}>
              <option>M&A</option>
              <option>LBO</option>
              <option>Valuation</option>
            </select>
            <span className="mt-2 block text-xs text-zinc-500">Auto-set for technical prompts; adjustable for behavioral.</span>
          </label>
          <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recording</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <span className={`h-2 w-2 rounded-full ${recording ? "bg-red-400 animate-pulse" : "bg-zinc-600"}`} aria-hidden />
                <span className="tabular-nums">{formatTime(seconds)}</span>
                <span className="meet-meter" aria-hidden>
                  <span className="meet-meter-fill" style={{ width: `${Math.round(micLevel * 100)}%` }} />
                </span>
                {audioBlob ? <span className="text-emerald-400">Recorded</span> : <span className="text-zinc-500">Not recorded</span>}
              </div>
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              Use the control dock below to record, submit, and move through the session.
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}
      </div>

      {done && (
        <section className="ui-card mx-auto mt-10 max-w-6xl p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Session report</p>
          <div className="mt-4 grid gap-6 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="text-xs text-zinc-500">Avg Fit</div>
              <div className="mt-2 text-3xl font-semibold text-white">{summary.avgFit}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="text-xs text-zinc-500">Avg Technical</div>
              <div className="mt-2 text-3xl font-semibold text-white">{summary.avgTech}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="text-xs text-zinc-500">Avg Behavioral</div>
              <div className="mt-2 text-3xl font-semibold text-white">{summary.avgBeh}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="text-xs text-zinc-500">Avg Environment</div>
              <div className="mt-2 text-3xl font-semibold text-white">{summary.avgEnv}</div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Top technical gaps</p>
              <ul className="mt-3 space-y-2 text-sm text-amber-200/90">
                {summary.topGaps.length ? summary.topGaps.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
                    {s}
                  </li>
                )) : <li className="text-zinc-500">None flagged.</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Top behavioral coaching</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                {summary.topCoaching.length ? summary.topCoaching.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden />
                    {s}
                  </li>
                )) : <li className="text-zinc-500">No major flags.</li>}
              </ul>
            </div>
          </div>
        </section>
      )}

      <div className="meet-dock">
        <div className="flex items-center gap-2">
          {!recording ? (
            <div className="group relative">
              <button type="button" className="meet-btn meet-btn-primary" onClick={startRecording} disabled={done} aria-label="Start recording">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 12a7 7 0 01-14 0" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19v3" />
                </svg>
              </button>
              <span className="meet-tooltip">Record</span>
            </div>
          ) : (
            <div className="group relative">
              <button type="button" className="meet-btn meet-btn-danger" onClick={stopRecording} aria-label="Stop recording">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12v12H6z" />
                </svg>
              </button>
              <span className="meet-tooltip">Stop</span>
            </div>
          )}

          <div className="group relative">
            <button
              type="button"
              className="meet-btn meet-btn-primary"
              onClick={submitAnswer}
              disabled={done || submitting || !audioBlob}
              aria-busy={submitting}
              aria-label="Submit answer"
            >
              {submitting ? (
                <span className="text-xs font-semibold">…</span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7" />
                </svg>
              )}
            </button>
            <span className="meet-tooltip">Submit</span>
          </div>

          <div className="group relative">
            <button type="button" className="meet-btn" onClick={reset} aria-label="Reset session">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 101-4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4v6h6" />
              </svg>
            </button>
            <span className="meet-tooltip">Reset</span>
          </div>
        </div>
        {error && (
          <div className="mt-2 max-w-[420px] rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}


"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MockInterviewResponse, SessionCreateResponse, Topic } from "@/lib/types";
import { apiFetch, apiUrl } from "@/lib/api";
import { waitForVideoDimensions } from "@/lib/video";
import { buildSuperdaySession, type InterviewQuestion } from "@/components/interview/QuestionBank";
import { computeMicLevel, createMicBuffers, emaNext, type MicAnalysisBuffers } from "@/lib/micLevel";
import { captureVideoJpegFile } from "@/lib/gazeFrames";
import { AnalysisProgress } from "@/components/ui/AnalysisProgress";
import { AnalysisTimingChips } from "@/components/ui/AnalysisTimingChips";

const SUPERDAY_MAX_SECONDS = 90;

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

function encodeWavMonoPCM16FromPCM(mono: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = mono.length * bytesPerSample;
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
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i] ?? 0));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function rmsLevel(x: Float32Array): number {
  if (x.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / x.length);
}

async function parseError(res: Response): Promise<string> {
  const t = await res.text();
  if (t.includes("Vercel Security Checkpoint") || t.includes("vercel.link/security-checkpoint")) {
    return "Backend request was blocked by Vercel Security Checkpoint. Set NEXT_PUBLIC_USE_PROXY=1 and BACKEND_URL to your FastAPI host.";
  }
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
  const [sessionQuestions, setSessionQuestions] = useState<InterviewQuestion[]>(() => buildSuperdaySession());
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  const q = sessionQuestions[idx];
  const topic: Topic = q?.topicHint ?? "M&A";

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | undefined>(undefined);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(48000);
  const rafRef = useRef<number | null>(null);
  const [micLevel, setMicLevel] = useState(0); // 0..1
  const [noInputStreakMs, setNoInputStreakMs] = useState(0);
  const micEmaRef = useRef(0);
  const micBufRef = useRef<MicAnalysisBuffers | null>(null);
  const gazeFramesRef = useRef<File[]>([]);
  const gazeIntervalRef = useRef<number | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<MockInterviewResponse[]>([]);
  const autoSubmitRef = useRef<Blob | null>(null);
  const [warmupStatus, setWarmupStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [warmupNote, setWarmupNote] = useState<string | null>(null);
  const [awaitingNext, setAwaitingNext] = useState(false);
  const done = reports.length === sessionQuestions.length;

  useEffect(() => {
    let cancelled = false;
    const create = async () => {
      setSessionId(null);
      try {
        const res = await apiFetch(apiUrl("/sessions"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            topic,
            questions: sessionQuestions.map((qq) => ({
              id: qq.id,
              track: qq.track,
              title: qq.title,
              topicHint: qq.topicHint ?? null,
              suggestedSeconds: qq.suggestedSeconds,
            })),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as SessionCreateResponse;
        if (cancelled) return;
        setSessionId(data.id);
      } catch {
        // Persistence is optional; ignore failures.
      }
    };
    create();
    return () => {
      cancelled = true;
    };
  }, [sessionQuestions, topic]);

  const downloadJson = useCallback((filename: string, value: unknown) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [snapshotFile, setSnapshotFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const wakeOnceRef = useRef(false);

  const wakeBackend = useCallback(() => {
    if (wakeOnceRef.current) return;
    wakeOnceRef.current = true;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 8000);
    // Fire-and-forget: wake a sleeping free-tier API while the user records.
    void apiFetch(apiUrl("/health"), { method: "GET", signal: ctrl.signal, cache: "no-store" }).finally(() =>
      window.clearTimeout(t),
    );
  }, []);

  const stopCamera = useCallback(() => {
    camStream?.getTracks().forEach((t) => t.stop());
    setCamStream(null);
  }, [camStream]);

  const videoRefCb = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  }, []);

  useEffect(() => {
    camStreamRef.current = camStream;
  }, [camStream]);
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!camStream) {
      el.srcObject = null;
      return;
    }
    el.srcObject = camStream;
    const play = () => el.play().catch(() => {});
    el.onloadedmetadata = play;
    play();
    return () => {
      el.onloadedmetadata = null;
    };
  }, [camStream, videoEl]);

  useEffect(() => {
    if (!recording || !camStream) return;
    const v = videoRef.current;
    if (!v) return;
    const snap = async () => {
      if (gazeFramesRef.current.length >= 5) return;
      const f = await captureVideoJpegFile(v);
      if (f) gazeFramesRef.current.push(f);
    };
    void snap();
    gazeIntervalRef.current = window.setInterval(() => void snap(), 2000);
    return () => {
      if (gazeIntervalRef.current !== undefined) window.clearInterval(gazeIntervalRef.current);
      gazeIntervalRef.current = undefined;
    };
  }, [recording, camStream]);

  const startCamera = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setCamStream(s);
    } catch (e) {
      const msg =
        e instanceof Error && e.message ? `Camera error: ${e.message}` : "Camera access denied or unavailable.";
      setError(msg);
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video) return;
    const ready = await waitForVideoDimensions(video, 8000);
    if (!ready) {
      setError("Camera preview is not ready yet. Wait a moment, then try Capture again.");
      return;
    }
    const file = await captureVideoJpegFile(video, 0.82);
    if (file) setSnapshotFile(new File([file], "environment.jpg", { type: "image/jpeg" }));
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 8000);
        const res = await apiFetch(apiUrl("/health"), { method: "GET", signal: ctrl.signal });
        window.clearTimeout(t);
        if (cancelled) return;
        setApiOk(res.ok);
      } catch {
        if (cancelled) return;
        setApiOk(false);
      }
    };
    run();
    const id = window.setInterval(run, 25_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const stopRecording = useCallback(() => {
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
    const chunks = pcmRef.current;
    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (!total) {
      setError("No audio captured. Check your mic permissions and input device.");
    } else {
      const mono = new Float32Array(total);
      let off = 0;
      for (const c of chunks) {
        mono.set(c, off);
        off += c.length;
      }
      const level = rmsLevel(mono);
      if (level < 0.006) {
        setError("Audio is almost silent. Select the correct input device and speak for at least 6–10 seconds, then try again.");
        setAudioBlob(null);
      } else {
        setAudioBlob(encodeWavMonoPCM16FromPCM(mono, sampleRateRef.current));
      }
    }
    setMicLevel(0);
    micEmaRef.current = 0;
    micBufRef.current = null;
    setNoInputStreakMs(0);
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
  }, []);

  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    if (!recording) return;
    if (seconds >= SUPERDAY_MAX_SECONDS) {
      stopRecordingRef.current();
    }
  }, [recording, seconds]);

  const startRecording = async () => {
    wakeBackend();
    setError(null);
    setAudioBlob(null);
    setSeconds(0);
    gazeFramesRef.current = [];
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = s;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      src.connect(analyser);
      analyserRef.current = analyser;
      micBufRef.current = createMicBuffers(analyser);
      micEmaRef.current = 0;

      pcmRef.current = [];
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = proc;
      proc.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        pcmRef.current.push(new Float32Array(input));
      };
      src.connect(proc);
      proc.connect(ctx.destination);

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
      tickRef.current = window.setInterval(() => {
        setSeconds((v) => Math.min(v + 1, SUPERDAY_MAX_SECONDS));
      }, 1000);

      const loop = () => {
        const a = analyserRef.current;
        const bufs = micBufRef.current;
        if (!a || !bufs) return;
        const raw = computeMicLevel(a, bufs.time, bufs.freq);
        micEmaRef.current = emaNext(micEmaRef.current, raw, 0.32);
        const level = micEmaRef.current;
        setMicLevel(level);
        setNoInputStreakMs((ms) => (level < 0.018 ? Math.min(8000, ms + 16) : 0));
        rafRef.current = window.requestAnimationFrame(loop);
      };
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(loop);
    } catch {
      setError("Mic access denied or unavailable.");
    }
  };

  const submitAnswer = useCallback(async () => {
    if (!q) return;
    setError(null);
    if (!audioBlob) {
      setError("Record an answer before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("question_id", q.id);
      fd.append("question_track", q.track);
      if (sessionId) fd.append("session_id", sessionId);
      fd.append("audio_wav", new File([audioBlob], `${q.id}.wav`, { type: "audio/wav" }));
      if (snapshotFile) fd.append("image", snapshotFile);
      for (const gf of gazeFramesRef.current) fd.append("gaze_frames", gf);
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 360_000);
      const res = await apiFetch(apiUrl("/mock-interview"), { method: "POST", body: fd, signal: ctrl.signal });
      window.clearTimeout(t);
      if (!res.ok) throw new Error(await parseError(res));
      const data = (await res.json()) as MockInterviewResponse;
      gazeFramesRef.current = [];
      setReports((prev) => [...prev, data]);
      const completedAll = reports.length + 1 >= sessionQuestions.length;
      if (completedAll) {
        setAwaitingNext(false);
        window.setTimeout(() => {
          document.getElementById("superday-summary")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 140);
      } else {
        setAwaitingNext(true);
      }
      setAudioBlob(null);
      setSeconds(0);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "Request timed out. If this is the first run, the backend may still be loading Whisper—wait 30–60s and try again."
            : e.message
          : "Request failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [audioBlob, q, reports.length, sessionId, sessionQuestions.length, snapshotFile, topic]);

  const runWarmupSelfTest = useCallback(async () => {
    setWarmupStatus("running");
    setWarmupNote(null);
    try {
      const warm = await apiFetch(apiUrl("/warmup"), { method: "POST" });
      if (!warm.ok) throw new Error(`Warmup failed (HTTP ${warm.status})`);

      const sr = 16000;
      const mono = new Float32Array(sr);
      const wav = encodeWavMonoPCM16FromPCM(mono, sr);
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("question_id", "self-test");
      fd.append("question_track", q?.track ?? "technical");
      fd.append(
        "transcript_override",
        `[${topic}] I would structure the answer, name key drivers explicitly, and connect each step to why it changes the output. I would add one metric and a clear takeaway.`,
      );
      fd.append("audio_wav", new File([wav], "self-test.wav", { type: "audio/wav" }));
      const res = await apiFetch(apiUrl("/mock-interview"), { method: "POST", body: fd });
      if (!res.ok) throw new Error(await parseError(res));
      setWarmupStatus("ok");
      setWarmupNote("Backend warm. Self-test report generated.");
    } catch (e) {
      setWarmupStatus("error");
      setWarmupNote(e instanceof Error ? e.message : "Warmup/self-test failed");
    }
  }, [q, topic]);

  // Auto-submit once audio is captured (hands-free superday flow).
  useEffect(() => {
    if (recording) return;
    if (awaitingNext) return;
    if (submitting) return;
    if (!audioBlob) return;
    if (autoSubmitRef.current === audioBlob) return;
    autoSubmitRef.current = audioBlob;
    void submitAnswer();
  }, [audioBlob, awaitingNext, recording, submitAnswer, submitting]);

  const goNextQuestion = () => {
    setAwaitingNext(false);
    setIdx((i) => Math.min(i + 1, sessionQuestions.length - 1));
  };

  const reset = () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSnapshotFile(null);
    setSessionQuestions(buildSuperdaySession());
    setSessionId(null);
    setIdx(0);
    setReports([]);
    setAwaitingNext(false);
    setAudioBlob(null);
    setSeconds(0);
    setError(null);
  };

  // Unmount cleanup only — do not depend on camStream/stopCamera/previewUrl or the camera will stop when the stream updates.
  useEffect(() => {
    return () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
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
    const dels = reports.map((r) => r.fit.delivery_component).filter((x): x is number => x != null);
    const gaps = uniq(reports.flatMap((r) => r.technical.concepts_missed)).slice(0, 7);
    const coaching = uniq(reports.flatMap((r) => r.behavioral.feedback)).slice(0, 7);
    return {
      avgFit: Math.round(average(fits) * 10) / 10,
      avgTech: Math.round(average(tech) * 10) / 10,
      avgEnv: Math.round(average(env) * 10) / 10,
      avgBeh: Math.round(average(beh) * 10) / 10,
      avgDelivery: dels.length ? Math.round(average(dels) * 10) / 10 : null,
      topGaps: gaps,
      topCoaching: coaching,
    };
  }, [reports]);

  return (
    <div className="app-backdrop min-h-[calc(100vh-64px)] w-full">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="type-h1">Full mock interview</div>
          <div className="type-muted mt-1">
            {sessionQuestions.length} questions · behavioral first, then technical (randomized each session) ·{" "}
            {formatTime(SUPERDAY_MAX_SECONDS)} max per take · Full session report at the end
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="meet-chip">Web</span>
          <span className="meet-chip">
            API{" "}
            {apiOk === null ? (
              <span className="text-zinc-500">…</span>
            ) : apiOk ? (
              <span className="text-zinc-200">OK</span>
            ) : (
              <span className="text-amber-200/90">Down</span>
            )}
          </span>
          <span className="meet-chip">
            Q {Math.min(idx + 1, sessionQuestions.length)} / {sessionQuestions.length}
          </span>
          <span className="meet-chip">{q?.track?.toUpperCase?.() ?? "—"}</span>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Backend</div>
            <div className="mt-1 text-sm text-zinc-200">Warm up models and run a deterministic self-test.</div>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-60"
            onClick={() => void runWarmupSelfTest()}
            disabled={warmupStatus === "running"}
          >
            {warmupStatus === "running" ? "Warming…" : "Warmup + self-test"}
          </button>
        </div>
        {warmupNote && (
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-xs ${
              warmupStatus === "ok"
                ? "border border-emerald-500/20 bg-emerald-950/30 text-emerald-100"
                : warmupStatus === "error"
                  ? "border border-red-500/20 bg-red-950/30 text-red-100"
                  : "border border-white/10 bg-black/30 text-zinc-300"
            }`}
            role="status"
            aria-live="polite"
          >
            {warmupNote}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="frame-gradient bg-black shadow-[0_18px_50px_-35px_rgba(0,0,0,0.85)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-100">Full mock</p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">{q?.title ?? "—"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="meet-chip">
                <span
                  className={`h-2 w-2 rounded-full ${recording ? "bg-red-400 animate-pulse" : "bg-zinc-600"}`}
                  aria-hidden
                />
                {recording ? "Recording" : "Ready"}
              </span>
              <span className="meet-chip">
                <span className="text-zinc-400">{recording ? "Time left" : "Elapsed"}</span>
                <span className="tabular-nums">
                  {recording ? formatTime(Math.max(0, SUPERDAY_MAX_SECONDS - seconds)) : formatTime(seconds)}
                </span>
              </span>
              <span className="meet-chip">
                <span className="text-zinc-400">Mic</span>
                <span className="meet-meter" aria-hidden>
                  <span
                    className="meet-meter-fill transition-[width] duration-75 ease-out"
                    style={{ width: `${Math.round(micLevel * 100)}%` }}
                  />
                </span>
              </span>
              {recording && noInputStreakMs >= 2000 && (
                <span className="meet-chip border-amber-500/25 text-amber-100/90">Unable to detect microphone input</span>
              )}
              <span className="meet-chip">{q?.track?.toUpperCase?.() ?? "—"}</span>
              {q && <span className="meet-chip">Suggested {formatTime(q.suggestedSeconds)}</span>}
            </div>
          </div>

          <div className="relative aspect-video w-full bg-zinc-950">
            {camStream ? (
              <video ref={videoRefCb} className="h-full w-full object-cover" playsInline muted autoPlay />
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Environment preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-xl font-semibold text-zinc-200">
                    SD
                  </div>
                  <div className="mt-3 text-sm text-zinc-400">Camera off</div>
                  <div className="mt-1 text-xs text-zinc-600">You can still record audio and submit answers.</div>
                </div>
              </div>
            )}

            {!camStream && !done && (
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-xs text-zinc-200 backdrop-blur">
                <span className="text-zinc-300">
                  <span className="font-semibold text-zinc-100">Tip:</span> turn on the camera for a virtual-interview feel,
                  or upload a frame for environment scoring.
                </span>
                <button
                  type="button"
                  className="rounded-full bg-white px-3 py-1 font-semibold text-zinc-900 hover:bg-zinc-200"
                  onClick={startCamera}
                >
                  Turn on camera
                </button>
              </div>
            )}

            {audioBlob && !recording && (
              <div
                className="absolute left-3 top-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-100"
                style={{ boxShadow: "0 14px 40px -25px rgba(79,70,229,0.55)" }}
              >
                Recorded
              </div>
            )}
            {snapshotFile && (
              <div
                className="absolute right-3 top-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-100"
                style={{ boxShadow: "0 14px 40px -25px rgba(79,70,229,0.55)" }}
              >
                Env frame ready
              </div>
            )}

            {submitting && (
              <div className="evaluate-overlay" role="status" aria-live="polite">
                <div className="evaluate-orb" aria-hidden>
                  <span className="evaluate-ring" />
                  <span className="evaluate-ring-2" />
                </div>
                <p className="text-sm font-semibold tracking-tight text-zinc-50">Saving and scoring</p>
                <AnalysisProgress
                  variant="session"
                  className="mx-auto"
                  helpText="First run can be slower while models load. Keep answers focused for faster scoring."
                />
                <p className="max-w-[260px] text-xs leading-relaxed text-zinc-500">
                  Feedback unlocks when you complete the full session.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="meet-panel frame-gradient">
          <div className="border-b border-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Question {Math.min(idx + 1, sessionQuestions.length)} / {sessionQuestions.length}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">{q?.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{q?.prompt}</p>
            {q?.topicHint && (
              <p className="mt-3 text-xs text-zinc-500">
                Scoring focus: <span className="font-medium text-zinc-300">{q.topicHint}</span>
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-xs leading-relaxed text-zinc-400">
                One timed response per prompt ({formatTime(SUPERDAY_MAX_SECONDS)} max). Recording stops automatically at
                zero. Submit each take; you&apos;ll get a full session report when you finish all questions.
              </div>
              <div className="shrink-0 text-right text-xs text-zinc-500">
                Suggested pace
                <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-200">
                  {q ? formatTime(Math.min(q.suggestedSeconds, SUPERDAY_MAX_SECONDS)) : "—"}
                </div>
              </div>
            </div>
            {awaitingNext && !done && (
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-100/95">Answer saved</p>
                <p className="mt-1 text-xs text-zinc-400">When you&apos;re ready, continue to the next prompt.</p>
                <button
                  type="button"
                  className="mt-3 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
                  onClick={goNextQuestion}
                >
                  Next question
                </button>
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recording</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                  <span className={`h-2 w-2 rounded-full ${recording ? "bg-red-400 animate-pulse" : "bg-zinc-600"}`} aria-hidden />
                  <span className="tabular-nums">
                    {recording ? formatTime(Math.max(0, SUPERDAY_MAX_SECONDS - seconds)) : formatTime(seconds)}
                  </span>
                  <span className="meet-meter" aria-hidden>
                    <span
                      className="meet-meter-fill transition-[width] duration-75 ease-out"
                      style={{ width: `${Math.round(micLevel * 100)}%` }}
                    />
                  </span>
                  {audioBlob ? (
                    <span className="text-zinc-100">Recorded</span>
                  ) : (
                    <span className="text-zinc-500">Not recorded</span>
                  )}
                  {recording && noInputStreakMs >= 2000 && (
                    <span className="text-amber-200/90">Mic unclear</span>
                  )}
                </div>
              </div>
              <div className="mt-3 text-xs text-zinc-500">
                Use the dock below for mic, camera, record, submit, and reset.
              </div>
            </div>
          </div>
        </aside>
      </div>

      {done && (
        <section id="superday-summary" className="ui-card mx-auto mt-10 max-w-6xl p-6 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Session report</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                onClick={() => downloadJson("full-mock-report.json", { summary, reports })}
              >
                Download JSON
              </button>
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      [
                        `Full mock summary: Fit ${summary.avgFit} (Env ${summary.avgEnv} · Tech ${summary.avgTech} · Beh ${summary.avgBeh}${
                          summary.avgDelivery != null ? ` · Delivery ${summary.avgDelivery}` : ""
                        })`,
                        "",
                        "Top technical gaps:",
                        ...(summary.topGaps.length ? summary.topGaps : ["None flagged."]),
                        "",
                        "Top coaching:",
                        ...(summary.topCoaching.length ? summary.topCoaching : ["No major flags."]),
                      ].join("\n"),
                    );
                  } catch {
                    // ignore
                  }
                }}
              >
                Copy summary
              </button>
            </div>
          </div>
          <div
            className={`mt-4 grid gap-6 ${summary.avgDelivery != null ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-4"}`}
          >
            <div className="meet-section">
              <div className="text-xs text-zinc-500">Avg Fit</div>
              <div className="mt-2 text-3xl font-semibold text-white">{summary.avgFit}</div>
            </div>
            <div className="meet-section">
              <div className="text-xs text-zinc-500">Avg Technical</div>
              <div className="mt-2 text-3xl font-semibold text-white">{summary.avgTech}</div>
            </div>
            <div className="meet-section">
              <div className="text-xs text-zinc-500">Avg Behavioral</div>
              <div className="mt-2 text-3xl font-semibold text-white">{summary.avgBeh}</div>
            </div>
            <div className="meet-section">
              <div className="text-xs text-zinc-500">Avg Environment</div>
              <div className="mt-2 text-3xl font-semibold text-white">{summary.avgEnv}</div>
            </div>
            {summary.avgDelivery != null && (
              <div className="meet-section">
                <div className="text-xs text-zinc-500">Avg Delivery</div>
                <div className="mt-2 text-3xl font-semibold text-white">{summary.avgDelivery}</div>
              </div>
            )}
          </div>

          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Question by question</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {reports.map((r, i) => {
                const sq = sessionQuestions[i];
                return (
                  <div key={sq?.id ?? `r-${i}`} className="meet-section">
                    <div className="text-xs text-zinc-500">Question {i + 1}</div>
                    <div className="mt-1 text-sm font-semibold leading-snug text-zinc-100">{sq?.title ?? "—"}</div>
                    <div className="mt-3 text-2xl font-semibold tabular-nums text-white">{r.fit.fit_score}</div>
                    <div className="mt-1 text-xs text-zinc-500">Fit score</div>
                    {r.timings_ms ? <AnalysisTimingChips timings={r.timings_ms} /> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="meet-section">
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
            <div className="meet-section">
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
              <button
                type="button"
                className="meet-btn meet-btn-primary"
                onClick={startRecording}
                disabled={done || submitting || awaitingNext}
                aria-label="Start recording"
              >
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

          {!camStream ? (
            <div className="group relative">
              <button type="button" className="meet-btn" onClick={startCamera} disabled={done} aria-label="Start camera">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14" />
                  <rect x="3" y="7" width="12" height="10" rx="2" ry="2" />
                </svg>
              </button>
              <span className="meet-tooltip">Camera</span>
            </div>
          ) : (
            <div className="group relative">
              <button type="button" className="meet-btn" onClick={stopCamera} aria-label="Stop camera">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h12a2 2 0 012 2v6a2 2 0 01-2 2H3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" />
                </svg>
              </button>
              <span className="meet-tooltip">Camera off</span>
            </div>
          )}

          <div className="group relative">
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
                disabled={done}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setSnapshotFile(f);
                  setPreviewUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return URL.createObjectURL(f);
                  });
                }}
              />
            </label>
            <span className="meet-tooltip">Upload frame</span>
          </div>

          {camStream && (
            <div className="group relative">
              <button type="button" className="meet-btn" onClick={captureFrame} disabled={done} aria-label="Capture environment frame">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h4l2-2h4l2 2h4v12H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </button>
              <span className="meet-tooltip">Capture</span>
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
                <Spinner />
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
        {(error || reports.at(-1)?.warnings?.length) && (
          <div className="mt-2 max-w-[420px] rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            {error ? <div>{error}</div> : null}
            {reports.at(-1)?.warnings?.length ? (
              <ul className="mt-2 space-y-1 text-xs text-red-100/90">
                {reports
                  .at(-1)
                  ?.warnings?.slice(0, 3)
                  .map((w) => (
                    <li key={w} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-200/80" aria-hidden />
                      <span>{w}</span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        )}
        {reports.at(-1) && (
          <div className="mt-2 flex max-w-[420px] flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
              onClick={async () => {
                const last = reports.at(-1);
                if (!last) return;
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(
                      {
                        question_id: last.question_id,
                        question_track: last.question_track,
                        warnings: last.warnings ?? null,
                        timings_ms: last.timings_ms ?? null,
                        analysis_meta: last.analysis_meta ?? null,
                      },
                      null,
                      2,
                    ),
                  );
                } catch {
                  // ignore
                }
              }}
            >
              Copy debug bundle
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}


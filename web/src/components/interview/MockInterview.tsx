"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MockInterviewResponse, Topic } from "@/lib/types";
import { apiFetch, apiUrl } from "@/lib/api";
import { waitForVideoDimensions } from "@/lib/video";
import { QUESTION_BANK, type InterviewQuestion } from "@/components/interview/QuestionBank";
import { AnalysisProgress } from "@/components/ui/AnalysisProgress";
import { AnalysisTimingChips } from "@/components/ui/AnalysisTimingChips";
import { computeMicLevel, createMicBuffers, emaNext, type MicAnalysisBuffers } from "@/lib/micLevel";
import { captureVideoJpegFile } from "@/lib/gazeFrames";

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
    return "Backend request was blocked by Vercel Security Checkpoint. Fix: set NEXT_PUBLIC_USE_PROXY=1 and set BACKEND_URL to your external FastAPI host (Render/Railway/Fly/VM), not your Vercel domain.";
  }
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

  const topic: Topic = question?.topicHint ?? "M&A";

  type RightTab = "prompt" | "report" | "transcript";
  const [rightTab, setRightTab] = useState<RightTab>("prompt");
  const [warmupStatus, setWarmupStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [warmupNote, setWarmupNote] = useState<string | null>(null);

  // optional environment snapshot
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [snapshotFile, setSnapshotFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const tickRef = useRef<number | undefined>(undefined);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(48000);
  const recordingRef = useRef(false);
  const autoSubmitRef = useRef<Blob | null>(null);

  const MAX_SECONDS = 90;
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);
  const rafRef = useRef<number | null>(null);
  const [micLevel, setMicLevel] = useState(0); // 0..1
  const [noInputStreakMs, setNoInputStreakMs] = useState(0);
  const micEmaRef = useRef(0);
  const micBufRef = useRef<MicAnalysisBuffers | null>(null);
  const gazeFramesRef = useRef<File[]>([]);
  const gazeIntervalRef = useRef<number | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MockInterviewResponse | null>(null);
  const [sessionResults, setSessionResults] = useState<MockInterviewResponse[]>([]);
  const [apiOk, setApiOk] = useState<boolean | null>(null);

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

  const stopCamera = useCallback(() => {
    camStream?.getTracks().forEach((t) => t.stop());
    setCamStream(null);
  }, [camStream]);

  useEffect(() => {
    camStreamRef.current = camStream;
  }, [camStream]);
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  const videoRefCb = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  }, []);

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
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
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
      setError("Camera preview is not ready yet. Wait a moment after turning the camera on, then try Capture again.");
      return;
    }
    const file = await captureVideoJpegFile(video, 0.82);
    if (file) {
      const renamed = new File([file], "environment.jpg", { type: "image/jpeg" });
      setSnapshotFile(renamed);
    }
  };

  const startRecording = useCallback(async () => {
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

      recordingRef.current = true;
      setRecording(true);
      if (tickRef.current !== undefined) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => setSeconds((v) => Math.min(MAX_SECONDS, v + 1)), 1000);

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
  }, []);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
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

  useEffect(() => {
    if (!recording) return;
    if (seconds >= MAX_SECONDS) stopRecording();
  }, [recording, seconds, stopRecording]);

  const questionIndex = QUESTION_BANK.findIndex((x) => x.id === question.id);
  const hasNextQuestion = questionIndex >= 0 && questionIndex < QUESTION_BANK.length - 1;

  const goNextQuestion = useCallback(() => {
    const i = QUESTION_BANK.findIndex((x) => x.id === questionId);
    const next = QUESTION_BANK[i + 1];
    if (!next) return;
    setQuestionId(next.id);
    setAudioBlob(null);
    setSeconds(0);
    setResult(null);
    setRightTab("prompt");
  }, [questionId]);

  const submit = useCallback(async () => {
    setError(null);
    setResult(null);
    if (!audioBlob) {
      setError("Record an answer before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("question_id", question.id);
      fd.append("question_track", question.track);
      fd.append("audio_wav", new File([audioBlob], "answer.wav", { type: "audio/wav" }));
      if (snapshotFile) fd.append("image", snapshotFile);
      for (const gf of gazeFramesRef.current) fd.append("gaze_frames", gf);
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 360_000);
      const res = await apiFetch(apiUrl("/mock-interview"), { method: "POST", body: fd, signal: ctrl.signal });
      window.clearTimeout(t);
      if (!res.ok) throw new Error(await parseError(res));
      const data = (await res.json()) as MockInterviewResponse;
      gazeFramesRef.current = [];
      setResult(data);
      setSessionResults((prev) => [...prev, data]);
      setRightTab("report");
      document.getElementById("report")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  }, [audioBlob, question, snapshotFile, topic]);

  const runWarmupSelfTest = useCallback(async () => {
    setWarmupStatus("running");
    setWarmupNote(null);
    try {
      const warm = await apiFetch(apiUrl("/warmup"), { method: "POST" });
      if (!warm.ok) throw new Error(`Warmup failed (HTTP ${warm.status})`);
      const warmJson = (await warm.json()) as { timings?: Record<string, unknown> };

      // Deterministic dev self-test (does not rely on mic). Backend accepts transcript_override in dev.
      const sr = 16000;
      const mono = new Float32Array(sr); // 1s of silence; transcript_override drives analysis
      const wav = encodeWavMonoPCM16FromPCM(mono, sr);
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("question_id", "self-test");
      fd.append("question_track", question.track);
      fd.append(
        "transcript_override",
        `[${topic}] I would build sources & uses, adjust the balance sheet with purchase accounting, and assess accretion/dilution under a financing mix. I would sanity check synergies and integration risks.`,
      );
      fd.append("audio_wav", new File([wav], "self-test.wav", { type: "audio/wav" }));

      const res = await apiFetch(apiUrl("/mock-interview"), { method: "POST", body: fd });
      if (!res.ok) {
        const msg = await parseError(res);
        throw new Error(`Self-test failed: ${msg}`);
      }
      setWarmupStatus("ok");
      setWarmupNote(
        `Backend warm. ${warmJson.timings ? "Warmup timings captured." : "Warmup OK."} Self-test report generated.`,
      );
    } catch (e) {
      setWarmupStatus("error");
      setWarmupNote(e instanceof Error ? e.message : "Warmup/self-test failed");
    }
  }, [question.track, topic]);

  // Auto-generate report once recording produces audio.
  useEffect(() => {
    if (recording) return;
    if (!audioBlob) return;
    if (submitting) return;
    if (result) return;
    if (autoSubmitRef.current === audioBlob) return;
    autoSubmitRef.current = audioBlob;
    submit();
  }, [audioBlob, recording, result, submit, submitting]);

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

  const reset = () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSnapshotFile(null);
    setAudioBlob(null);
    setSeconds(0);
    setResult(null);
    setSessionResults([]);
    setError(null);
  };

  const sessionSummary = useMemo(() => {
    if (sessionResults.length < 2) return null;
    const fits = sessionResults.map((r) => r.fit.fit_score);
    const avgFit = Math.round((fits.reduce((a, b) => a + b, 0) / fits.length) * 10) / 10;
    return { avgFit, n: sessionResults.length };
  }, [sessionResults]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      const isTypingTarget = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (isTypingTarget) return;

      if (e.key === " ") {
        e.preventDefault();
        if (recording) stopRecording();
        else startRecording();
      }
      if (e.key === "Enter") {
        if (!recording && audioBlob && !submitting) submit();
      }
      if (e.key === "Escape") {
        if (recording) stopRecording();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [audioBlob, recording, startRecording, stopRecording, submit, submitting]);

  // Unmount cleanup only — do NOT depend on camStream/stopCamera/previewUrl or turning the camera on will re-run cleanup and stop the stream.
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

  return (
    <div className="app-backdrop min-h-[calc(100vh-64px)] w-full">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="type-h1">Prep by topic</div>
          <div className="type-muted mt-1">
            Drill one technical or behavioral prompt at a time—then review your report.{" "}
            <span className="text-zinc-600">·</span>{" "}
            <span className="font-semibold text-zinc-200">Space</span> record ·{" "}
            <span className="font-semibold text-zinc-200">Enter</span> generate
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
          <span className="meet-chip">{question.track.toUpperCase()}</span>
          <span className="meet-chip">{question.title}</span>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="frame-gradient bg-black shadow-[0_18px_50px_-35px_rgba(0,0,0,0.85)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-100">Topic prep</p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">{question.title}</p>
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
                <span className="tabular-nums">{formatTime(seconds)}</span>
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
              <span className="meet-chip">{question.track.toUpperCase()}</span>
              <span className="meet-chip">Suggested {formatTime(question.suggestedSeconds)}</span>
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
                    FR
                  </div>
                  <div className="mt-3 text-sm text-zinc-400">Camera off</div>
                  <div className="mt-1 text-xs text-zinc-600">You can still record audio and generate a report.</div>
                </div>
              </div>
            )}

                {!camStream && (
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-xs text-zinc-200 backdrop-blur">
                    <span className="text-zinc-300">
                      <span className="font-semibold text-zinc-100">Tip:</span> camera is optional — but capture/upload a
                      frame for environment scoring.
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
                <p className="text-sm font-semibold tracking-tight text-zinc-50">Evaluating</p>
                <AnalysisProgress
                  variant="mock"
                  className="mx-auto"
                  helpText="First run can be slower while models load. ASR uses a capped slice of long answers for speed."
                />
              </div>
            )}
          </div>
        </section>

        <aside className="meet-panel frame-gradient">
          <div className="flex items-center justify-between gap-3 border-b border-white/5 p-3">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={`meet-tab pressable ${rightTab === "prompt" ? "meet-tab-active" : ""}`}
                onClick={() => setRightTab("prompt")}
              >
                Prompt
              </button>
              <button
                type="button"
                className={`meet-tab pressable ${rightTab === "report" ? "meet-tab-active" : ""}`}
                onClick={() => setRightTab("report")}
              >
                Report
              </button>
              <button
                type="button"
                className={`meet-tab pressable ${rightTab === "transcript" ? "meet-tab-active" : ""}`}
                onClick={() => setRightTab("transcript")}
              >
                Transcript
              </button>
            </div>
            <div className="text-xs text-zinc-500">{result ? `Fit ${result.fit.fit_score}` : "—"}</div>
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
                {question.topicHint && (
                  <p className="text-xs text-zinc-500">
                    Scoring focus: <span className="font-medium text-zinc-300">{question.topicHint}</span>
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Backend</div>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    onClick={() => void runWarmupSelfTest()}
                    disabled={warmupStatus === "running"}
                  >
                    {warmupStatus === "running" ? "Warming…" : "Warmup + self-test"}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  Use this before demos. It loads ASR/models and confirms the report pipeline works without relying on your mic.
                </p>
                {warmupNote && (
                  <div
                    className={`mt-2 rounded-lg px-3 py-2 text-xs ${
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

              <details className="mt-4 meet-panel frame-gradient overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
                  Setup checklist
                  <svg className="h-5 w-5 shrink-0 text-zinc-500 transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M19 9l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div className="border-t border-white/5 bg-black/35 px-4 py-4 text-sm text-zinc-300">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                      <span>
                        <span className="font-semibold text-zinc-200">Mic</span>: speak and confirm the meter moves.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                      <span>
                        <span className="font-semibold text-zinc-200">Room</span>: camera optional; capture a frame if you
                        want environment scoring.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                      <span>
                        <span className="font-semibold text-zinc-200">One take</span>: Space to start/stop, then Enter to
                        generate the report.
                      </span>
                    </li>
                  </ul>
                </div>
              </details>

              <div className="mt-4">
                <p className="text-sm font-semibold text-zinc-100">{question.title}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{question.prompt}</p>
              </div>
            </div>
          )}

          {rightTab === "report" && (
            <div className="p-4">
              {submitting ? (
                <div className="meet-section">
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Generating</div>
                  <AnalysisProgress
                    variant="mock"
                    className="mt-3"
                    helpText="First run can be slower while models load. ASR uses a capped slice of long answers for speed."
                  />
                  <div className="mt-4 space-y-2">
                    <div className="h-2 w-full rounded-full bg-white/5" />
                    <div className="h-2 w-11/12 rounded-full bg-white/5" />
                    <div className="h-2 w-10/12 rounded-full bg-white/5" />
                  </div>
                </div>
              ) : !result ? (
                <div className="meet-section text-sm text-zinc-300">
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Setup</div>
                  <div className="mt-3 grid gap-2 text-sm text-zinc-300">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                      <span>
                        <span className="font-semibold text-zinc-200">Mic:</span> allow permissions and verify the meter
                        moves.
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                      <span>
                        <span className="font-semibold text-zinc-200">Record:</span> Space to start/stop. Aim for{" "}
                        {formatTime(question.suggestedSeconds)}.
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                      <span>
                        <span className="font-semibold text-zinc-200">Generate:</span> Enter to run transcription + scoring.
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="meet-section">
                    <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Summary</div>
                    <div className="mt-2 flex items-end justify-between gap-4">
                      <div className="meet-kpi">{result.fit.fit_score}</div>
                      <div className="text-right">
                        <div className="meet-subtle">Fit score</div>
                        <div className="meet-subtle">
                          Env · Tech · Beh
                          {result.fit.delivery_component != null ? " · Delivery" : ""}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {[
                        { label: "Environment", v: result.fit.environment_component, tone: "bg-indigo-400/70" },
                        { label: "Technical", v: result.fit.technical_component, tone: "bg-sky-400/70" },
                        { label: "Behavioral", v: result.behavioral.score, tone: "bg-indigo-300/70" },
                        ...(result.fit.delivery_component != null
                          ? [
                              {
                                label: "Delivery",
                                v: result.fit.delivery_component,
                                tone: "bg-emerald-400/60",
                              },
                            ]
                          : []),
                      ].map((row) => (
                        <div key={row.label}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-zinc-200">{row.label}</span>
                            <span className="tabular-nums text-zinc-400">{row.v}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-white/5">
                            <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${Math.max(0, Math.min(100, row.v))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {(result.sentiment || result.prosody || result.gaze) && (
                      <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-zinc-950/35 p-3 text-xs leading-relaxed text-zinc-400">
                        <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-zinc-500">
                          Tone &amp; delivery (experimental)
                        </div>
                        {result.sentiment && (
                          <p>
                            <span className="font-semibold text-zinc-200">Transcript tone:</span> {result.sentiment.tone}
                            {result.sentiment.dominant_emotion ? ` (${result.sentiment.dominant_emotion})` : ""}.{" "}
                            {result.sentiment.note ?? ""}
                          </p>
                        )}
                        {result.prosody && (
                          <p>
                            <span className="font-semibold text-zinc-200">Vocal prosody:</span> {result.prosody.label}
                            {result.prosody.words_per_minute != null ? ` · ~${Math.round(result.prosody.words_per_minute)} wpm` : ""}.{" "}
                            {result.prosody.note ?? ""}
                          </p>
                        )}
                        {result.gaze && result.gaze.status !== "unavailable" && (
                          <p>
                            <span className="font-semibold text-zinc-200">Gaze heuristic:</span>{" "}
                            {result.gaze.status === "insufficient_frames"
                              ? "Not enough camera samples during recording (keep the camera on while answering)."
                              : result.gaze.pattern
                                ? `Pattern ${result.gaze.pattern}${
                                    result.gaze.confidence != null
                                      ? ` (~${Math.round(result.gaze.confidence * 100)}% model confidence)`
                                      : ""
                                  }.`
                                : "No pattern."}{" "}
                            {result.gaze.warning ? <span className="text-zinc-500">{result.gaze.warning}</span> : null}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                        onClick={() => downloadJson(`report-${question.id}.json`, result)}
                      >
                        Download JSON
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              JSON.stringify(
                                {
                                  question_id: result.question_id,
                                  question_track: result.question_track,
                                  warnings: result.warnings ?? null,
                                  timings_ms: result.timings_ms ?? null,
                                  analysis_meta: result.analysis_meta ?? null,
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
                        Copy debug
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              [
                                `Prompt: ${question.title}`,
                                "",
                                `Fit: ${result.fit.fit_score} (Env ${result.fit.environment_component} · Tech ${result.fit.technical_component} · Beh ${result.behavioral.score}${
                                  result.fit.delivery_component != null
                                    ? ` · Delivery ${result.fit.delivery_component}`
                                    : ""
                                })`,
                                "",
                                "Narrative:",
                                result.narrative,
                                "",
                                "Transcript:",
                                result.transcript,
                              ].join("\n"),
                            );
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        Copy report
                      </button>
                    </div>
                    {hasNextQuestion && (
                      <button
                        type="button"
                        className="mt-4 w-full rounded-xl border border-white/15 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100"
                        onClick={goNextQuestion}
                      >
                        Next question
                      </button>
                    )}
                  </div>

                  <div className="meet-section">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Narrative</div>
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(result.narrative);
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{result.narrative}</p>
                    {result.timings_ms ? <AnalysisTimingChips timings={result.timings_ms} /> : null}
                  </div>
                </div>
              )}
            </div>
          )}

          {rightTab === "transcript" && (
            <div className="p-4">
              {submitting ? (
                <div className="meet-section">
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Generating</div>
                  <AnalysisProgress
                    variant="mock"
                    className="mt-3"
                    helpText="First run can be slower while models load. ASR uses a capped slice of long answers for speed."
                  />
                  <div className="mt-4 space-y-2">
                    <div className="h-2 w-full rounded-full bg-white/5" />
                    <div className="h-2 w-11/12 rounded-full bg-white/5" />
                    <div className="h-2 w-10/12 rounded-full bg-white/5" />
                  </div>
                </div>
              ) : !result ? (
                <div className="meet-section text-sm text-zinc-300">
                  Transcript appears after you generate a report.
                </div>
              ) : (
                <div className="meet-section">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Transcript</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(result.transcript);
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                        onClick={() => downloadJson(`transcript-${question.id}.json`, { transcript: result.transcript })}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{result.transcript}</p>
                  {result.timings_ms && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
                      <div className="font-semibold text-zinc-200">Timing breakdown</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(result.timings_ms)
                          .filter(([k]) => k !== "total")
                          .map(([k, v]) => (
                            <span key={k} className="meet-chip">
                              <span className="text-zinc-400">{k}</span>{" "}
                              <span className="tabular-nums text-zinc-200">{Math.round(v)}ms</span>
                            </span>
                          ))}
                        {"total" in result.timings_ms ? (
                          <span className="meet-chip">
                            <span className="text-zinc-400">total</span>{" "}
                            <span className="tabular-nums text-zinc-200">{Math.round(result.timings_ms.total)}ms</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {result.analysis_meta && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
                      <div className="font-semibold text-zinc-200">Analysis notes</div>
                      <div className="mt-2 space-y-1.5 text-zinc-300">
                        {result.analysis_meta.asr_trimmed === true && (
                          <div>
                            ASR used the first{" "}
                            <span className="tabular-nums font-semibold text-zinc-100">
                              {typeof result.analysis_meta.audio_seconds_asr_used === "number"
                                ? `${Math.round(result.analysis_meta.audio_seconds_asr_used)}s`
                                : "part"}
                            </span>{" "}
                            for speed (uploaded{" "}
                            <span className="tabular-nums font-semibold text-zinc-100">
                              {typeof result.analysis_meta.audio_seconds_uploaded === "number"
                                ? `${Math.round(result.analysis_meta.audio_seconds_uploaded)}s`
                                : "audio"}
                            </span>
                            ).
                          </div>
                        )}
                        <div>
                          ASR model:{" "}
                          <span className="font-semibold text-zinc-100">
                            {typeof result.analysis_meta.asr_model === "string" ? result.analysis_meta.asr_model : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <div className="meet-dock">
        <div className="flex items-center gap-2">
          {!recording ? (
            <div className="group relative">
              <button type="button" className="meet-btn meet-btn-primary pressable" onClick={startRecording} aria-label="Start recording">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 12a7 7 0 01-14 0" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19v3" />
                </svg>
              </button>
              <span className="meet-tooltip">Record (Space)</span>
            </div>
          ) : (
            <div className="group relative">
              <button type="button" className="meet-btn meet-btn-danger pressable" onClick={stopRecording} aria-label="Stop recording">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12v12H6z" />
                </svg>
              </button>
              <span className="meet-tooltip">Stop (Space)</span>
            </div>
          )}

          {!camStream ? (
            <div className="group relative">
              <button type="button" className="meet-btn pressable" onClick={startCamera} aria-label="Start camera">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14" />
                  <rect x="3" y="7" width="12" height="10" rx="2" ry="2" />
                </svg>
              </button>
              <span className="meet-tooltip">Camera</span>
            </div>
          ) : (
            <div className="group relative">
              <button type="button" className="meet-btn pressable" onClick={stopCamera} aria-label="Stop camera">
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
              <button type="button" className="meet-btn pressable" onClick={captureFrame} aria-label="Capture environment frame">
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
              className="meet-btn meet-btn-primary pressable"
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
            <span className="meet-tooltip">Generate (Enter)</span>
          </div>

          <div className="group relative">
            <button type="button" className="meet-btn pressable" onClick={reset} aria-label="Reset">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 101-4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4v6h6" />
              </svg>
            </button>
            <span className="meet-tooltip">Reset</span>
          </div>
        </div>
        {(error || result?.warnings?.length) && (
          <div className="mt-2 max-w-[420px] rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            {error ? <div>{error}</div> : null}
            {result?.warnings?.length ? (
              <ul className="mt-2 space-y-1 text-xs text-red-100/90">
                {result.warnings.slice(0, 3).map((w) => (
                  <li key={w} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-200/80" aria-hidden />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : null}
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

          {result.recommendations?.length ? (
            <div className="mt-8 rounded-2xl border border-white/10 bg-zinc-950/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Next practice plan</p>
                <p className="text-xs text-zinc-500">
                  {result.analysis_meta?.google_enriched === true ? "Enhanced" : "Standard"}
                </p>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-zinc-200">
                {result.recommendations.slice(0, 7).map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                    <span className="text-zinc-200">{s}</span>
                  </li>
                ))}
              </ul>
              {result.analysis_meta?.google_enriched !== true && result.analysis_meta?.google_skip_reason ? (
                <p className="mt-3 text-xs text-zinc-500">
                  Tip: set <code className="text-zinc-300">GOOGLE_API_KEY</code> to enhance recommendations (
                  {String(result.analysis_meta.google_skip_reason)}).
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-zinc-400">
            <span>
              Technical read · <span className="text-zinc-200">{result.technical.expertise_label}</span>{" "}
              <span className="text-zinc-500">({result.technical.topic})</span>
            </span>
            {result.technical.coverage_score != null && result.technical.coverage_score > 0 && (
              <span className="tabular-nums text-zinc-500">
                Structure coverage · {Math.round(result.technical.coverage_score)}%
              </span>
            )}
            {result.technical.explanation_score != null && result.technical.explanation_score > 0 && (
              <span className="tabular-nums text-zinc-500">
                Causal clarity · {Math.round(result.technical.explanation_score)}%
              </span>
            )}
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
                {result.behavioral.question_coverage && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
                    <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-zinc-500">
                      Question-specific beats
                      {result.behavioral.question_template ? (
                        <span className="ml-2 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 font-mono text-[0.65rem] text-zinc-400">
                          {result.behavioral.question_template}
                        </span>
                      ) : null}
                    </div>
                    {result.behavioral.top_fixes?.length ? (
                      <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
                        <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-amber-200/80">
                          Top fixes
                        </div>
                        <ul className="mt-2 space-y-1">
                          {result.behavioral.top_fixes.slice(0, 3).map((s) => (
                            <li key={s} className="flex items-start gap-2">
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-200/80" aria-hidden />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {result.behavioral.question_outline?.length ? (
                      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                        <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-zinc-500">
                          Ideal outline
                        </div>
                        <ol className="mt-2 space-y-1">
                          {result.behavioral.question_outline.slice(0, 6).map((s) => (
                            <li key={s} className="flex items-start gap-2">
                              <span className="mt-0.5 font-mono text-zinc-500">•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(result.behavioral.question_coverage).map(([k, v]) => (
                        <span
                          key={k}
                          className={`rounded-full border px-3 py-1 ${
                            v
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                              : "border-zinc-700 bg-zinc-900/30 text-zinc-400"
                          }`}
                        >
                          {k.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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

      {sessionSummary && (
        <section id="session-summary" className="ui-card mx-auto mt-10 max-w-6xl p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Session summary</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{sessionSummary.avgFit}</p>
          <p className="mt-1 text-sm text-zinc-500">
            Average fit score across {sessionSummary.n} completed reports this session.
          </p>
        </section>
      )}
      </div>
    </div>
  );
}


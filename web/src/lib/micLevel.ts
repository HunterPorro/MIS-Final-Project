/**
 * Live mic meter: blend time-domain RMS + frequency energy for responsive, fluctuating levels.
 * Use fftSize-length buffer for getByteTimeDomainData (not frequencyBinCount).
 */

export type MicAnalysisBuffers = {
  time: Uint8Array<ArrayBuffer>;
  freq: Uint8Array<ArrayBuffer>;
};

export function createMicBuffers(analyser: AnalyserNode): MicAnalysisBuffers {
  const timeBuf = new ArrayBuffer(analyser.fftSize);
  const freqBuf = new ArrayBuffer(analyser.frequencyBinCount);
  return {
    time: new Uint8Array(timeBuf) as MicAnalysisBuffers["time"],
    freq: new Uint8Array(freqBuf) as MicAnalysisBuffers["freq"],
  };
}

export function computeMicLevel(analyser: AnalyserNode, time: MicAnalysisBuffers["time"], freq: MicAnalysisBuffers["freq"]): number {
  analyser.getByteTimeDomainData(time);
  analyser.getByteFrequencyData(freq);
  let sum = 0;
  for (let i = 0; i < time.length; i++) {
    const x = (time[i]! - 128) / 128;
    sum += x * x;
  }
  const rms = Math.sqrt(sum / time.length);
  const n = freq.length;
  const start = Math.max(1, Math.floor(n * 0.04));
  const end = Math.floor(n * 0.45);
  let fsum = 0;
  for (let i = start; i < end; i++) fsum += freq[i]!;
  const favg = fsum / Math.max(1, end - start) / 255;
  return Math.min(1, rms * 2.8 + favg * 1.35);
}

export function emaNext(prev: number, raw: number, alpha = 0.28): number {
  return prev * (1 - alpha) + raw * alpha;
}

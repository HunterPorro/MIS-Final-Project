import { waitForVideoDimensions } from "@/lib/video";

const MAX_CAPTURE_WIDTH = 640;

function downscaleCanvas(source: HTMLVideoElement, maxWidth: number): HTMLCanvasElement {
  const w = source.videoWidth;
  const h = source.videoHeight;
  if (!w || !h) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c;
  }
  const scale = w > maxWidth ? maxWidth / w : 1;
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.width = w;
    canvas.height = h;
    const ctx2 = canvas.getContext("2d");
    if (ctx2) ctx2.drawImage(source, 0, 0);
    return canvas;
  }
  ctx.drawImage(source, 0, 0, tw, th);
  return canvas;
}

/** Sample one JPEG frame from a live video element for gaze heuristics (server-side). Downscaled for speed. */
export async function captureVideoJpegFile(video: HTMLVideoElement, quality = 0.68): Promise<File | null> {
  const ready = await waitForVideoDimensions(video, 2000);
  if (!ready || !video.videoWidth || !video.videoHeight) return null;
  const canvas = downscaleCanvas(video, MAX_CAPTURE_WIDTH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve(null);
        resolve(new File([blob], `gaze-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      quality,
    );
  });
}

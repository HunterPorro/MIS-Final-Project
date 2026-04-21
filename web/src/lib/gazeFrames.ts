import { waitForVideoDimensions } from "@/lib/video";

/** Sample one JPEG frame from a live video element for gaze heuristics (server-side). */
export async function captureVideoJpegFile(video: HTMLVideoElement, quality = 0.72): Promise<File | null> {
  const ready = await waitForVideoDimensions(video, 2000);
  if (!ready || !video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
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

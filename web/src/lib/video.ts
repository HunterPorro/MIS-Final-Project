/** Wait until <video> has non-zero dimensions (Safari/Chrome can lag after getUserMedia). */
export function waitForVideoDimensions(video: HTMLVideoElement, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

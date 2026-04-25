from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

_face_cascade = None
_eye_cascade = None


def _get_face_cascade():
    global _face_cascade
    if _face_cascade is None:
        import cv2

        _face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    return _face_cascade


def _get_eye_cascade():
    global _eye_cascade
    if _eye_cascade is None:
        import cv2

        _eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")
    return _eye_cascade


@dataclass(frozen=True)
class GazeResult:
    status: str  # ok | insufficient_frames | unavailable
    pattern: str | None  # steady | reading_like | unknown
    confidence: float | None
    frames_used: int
    warning: str | None


def _pil_to_gray_bgr(img: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    rgb = np.array(img.convert("RGB"))
    gray = np.dot(rgb[..., :3], [0.299, 0.587, 0.114]).astype(np.uint8)
    bgr = rgb[:, :, ::-1].copy()
    return gray, bgr


def _eye_x_norm(gray: np.ndarray, face_rect: tuple[int, int, int, int]) -> float | None:
    try:
        eye_cascade = _get_eye_cascade()
    except Exception:
        return None

    fx, fy, fw, fh = face_rect
    roi = gray[fy : fy + fh, fx : fx + fw]
    if roi.size == 0:
        return None
    eyes = eye_cascade.detectMultiScale(roi, scaleFactor=1.1, minNeighbors=4, minSize=(18, 18))
    if len(eyes) == 0:
        return None
    xs = []
    for (ex, ey, ew, eh) in eyes[:2]:
        xs.append(ex + ew / 2.0)
    if not xs:
        return None
    x_mean = float(np.mean(xs))
    return x_mean / max(float(fw), 1.0)


def analyze_gaze_sequence(frames: list[Image.Image]) -> GazeResult:
    """
    Weak gaze / reading heuristic from horizontal eye movement across frames.
    High false-positive rate—use only as a secondary integrity/readiness cue.
    """
    try:
        import cv2
    except ImportError:
        return GazeResult(
            status="unavailable",
            pattern=None,
            confidence=None,
            frames_used=0,
            warning="OpenCV not installed; gaze cue disabled.",
        )

    if len(frames) < 3:
        return GazeResult(
            status="insufficient_frames",
            pattern=None,
            confidence=None,
            frames_used=len(frames),
            warning="Need at least 3 camera samples during recording for gaze heuristics.",
        )

    face_cascade = _get_face_cascade()
    xs: list[float] = []
    ok = 0
    for im in frames[:8]:
        gray, _ = _pil_to_gray_bgr(im)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(80, 80))
        if len(faces) == 0:
            continue
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        xn = _eye_x_norm(gray, (int(x), int(y), int(w), int(h)))
        if xn is None:
            continue
        xs.append(xn)
        ok += 1

    if len(xs) < 3:
        return GazeResult(
            status="insufficient_frames",
            pattern=None,
            confidence=None,
            frames_used=ok,
            warning="Could not reliably detect eyes across samples—try brighter lighting and face the camera.",
        )

    x = np.array(xs, dtype=np.float64)
    dx = np.diff(x)
    if dx.size == 0:
        pattern = "unknown"
        conf = 0.25
    else:
        # Direction reversals in horizontal drift (weak proxy for scanning vs. steady gaze).
        s0 = np.sign(dx[:-1])
        s1 = np.sign(dx[1:])
        changes = int(np.sum((s0 != 0) & (s1 != 0) & (s0 != s1)))
        osc_rate = float(changes) / float(max(len(dx) - 1, 1))
        x_std = float(np.std(x))
        # Horizontal scanning often shows frequent direction flips + non-trivial variance
        reading_like = osc_rate >= 0.42 and x_std >= 0.07
        steady = x_std <= 0.045 and osc_rate <= 0.35
        if reading_like:
            pattern = "reading_like"
            conf = min(0.78, 0.35 + osc_rate * 0.45 + min(x_std * 3.0, 0.25))
        elif steady:
            pattern = "steady"
            conf = min(0.75, 0.4 + (0.06 - x_std) * 5.0 + (0.35 - osc_rate))
        else:
            pattern = "unknown"
            conf = 0.4

    warn = (
        "Heuristic only: lighting, glasses, and head turns can mimic a reading pattern. "
        "Do not treat as proof of misconduct."
    )

    return GazeResult(
        status="ok",
        pattern=pattern,
        confidence=round(conf, 2),
        frames_used=ok,
        warning=warn,
    )

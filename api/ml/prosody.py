from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ProsodyResult:
    label: str  # rushed | steady | uneven
    words_per_minute: float | None
    pause_fraction: float | None
    pitch_std_hz: float | None
    rms_cv: float | None
    note: str


def _frame_rms(y: np.ndarray, *, frame: int, hop: int) -> np.ndarray:
    """
    Lightweight RMS frame extractor using NumPy only.

    Returns shape (n_frames,) float32 array.
    """
    y = np.asarray(y, dtype=np.float32)
    if y.size < frame or frame <= 0 or hop <= 0:
        return np.asarray([], dtype=np.float32)
    n_frames = 1 + (y.size - frame) // hop
    # Copy-free framing (read-only view).
    frames = np.lib.stride_tricks.as_strided(
        y,
        shape=(n_frames, frame),
        strides=(y.strides[0] * hop, y.strides[0]),
        writeable=False,
    )
    return np.sqrt(np.mean(frames * frames, axis=1) + 1e-12).astype(np.float32)


def _pause_fraction(y: np.ndarray, sr: int, frame_ms: int = 25, hop_ms: int = 10) -> float:
    hop = max(1, int(sr * hop_ms / 1000))
    frame = max(1, int(sr * frame_ms / 1000))
    rms = _frame_rms(y, frame=frame, hop=hop)
    if rms.size == 0:
        return 0.0
    floor = float(np.percentile(rms, 15)) * 0.35
    return float(np.mean(rms < max(floor, 1e-6)))


def _pitch_std_hz(y: np.ndarray, sr: int) -> float | None:
    try:
        import librosa
    except ImportError:
        return None

    if len(y) < sr // 4:
        return None
    f0 = librosa.yin(y, fmin=60.0, fmax=400.0, sr=sr)
    f0 = f0[np.isfinite(f0)]
    f0 = f0[(f0 > 50) & (f0 < 500)]
    if f0.size < 4:
        return None
    return float(np.std(f0))


def _rms_cv(y: np.ndarray, sr: int) -> float | None:
    hop = max(1, int(sr * 0.01))
    frame = max(1, int(sr * 0.025))
    rms = _frame_rms(y, frame=frame, hop=hop)
    if rms.size < 3:
        return None
    m = float(np.mean(rms)) + 1e-9
    return float(np.std(rms) / m)


def analyze_prosody(
    y: np.ndarray,
    sr: int,
    *,
    transcript_word_count: int,
    audio_seconds: float | None,
    speaking_rate_wpm: float | None,
) -> ProsodyResult:
    """
    Classify delivery from audio dynamics. Uses transcript WPM when provided and plausible;
    otherwise estimates from word count / duration.
    """
    y = np.asarray(y, dtype=np.float32)
    if y.size == 0 or sr <= 0:
        return ProsodyResult(
            label="uneven",
            words_per_minute=None,
            pause_fraction=None,
            pitch_std_hz=None,
            rms_cv=None,
            note="No usable audio for prosody.",
        )

    pause_frac = _pause_fraction(y, sr)
    p_std = _pitch_std_hz(y, sr)
    r_cv = _rms_cv(y, sr)

    wpm = speaking_rate_wpm
    if wpm is None and audio_seconds and audio_seconds > 0 and transcript_word_count > 0:
        wpm = (transcript_word_count / float(audio_seconds)) * 60.0
        if audio_seconds < 12 or wpm > 260 or wpm < 60:
            wpm = None

    rushed = False
    uneven = False
    if wpm is not None and wpm > 182:
        rushed = True
    if wpm is not None and wpm > 168 and pause_frac < 0.06:
        rushed = True
    if pause_frac > 0.38:
        uneven = True
    if p_std is not None and p_std > 52:
        uneven = True
    if r_cv is not None and r_cv > 1.35:
        uneven = True
    if wpm is not None and wpm < 105 and pause_frac > 0.42:
        uneven = True

    if rushed and not uneven:
        label = "rushed"
        note = "Fast pace and/or few pauses—slow slightly for clarity."
    elif uneven:
        label = "uneven"
        note = "Uneven rhythm or pitch—use deliberate pauses between ideas."
    else:
        label = "steady"
        note = "Pacing and pauses look reasonably balanced for delivery."

    return ProsodyResult(
        label=label,
        words_per_minute=round(wpm, 1) if wpm is not None else None,
        pause_fraction=round(pause_frac, 3),
        pitch_std_hz=round(p_std, 2) if p_std is not None else None,
        rms_cv=round(r_cv, 3) if r_cv is not None else None,
        note=note,
    )

from __future__ import annotations

import io
import wave

import numpy as np


def read_wav_bytes(raw: bytes) -> tuple[np.ndarray, int]:
    """
    Read PCM WAV bytes into a mono float32 numpy array in [-1, 1].
    Supports 16-bit PCM and 32-bit PCM.
    """
    with wave.open(io.BytesIO(raw), "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        pcm = wf.readframes(n_frames)

    if sampwidth == 2:
        x = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 4:
        x = np.frombuffer(pcm, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise ValueError(f"Unsupported WAV sample width: {sampwidth} bytes")

    if n_channels > 1:
        x = x.reshape(-1, n_channels).mean(axis=1)

    return x, int(framerate)


from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from transformers import pipeline

# Default Whisper checkpoint used by `ASRTranscriber` (first run may download weights).
# Runtime uses `settings.asr_model` (default: whisper-base) for better interview accuracy.
DEFAULT_ASR_MODEL = "openai/whisper-base"


@dataclass(frozen=True)
class TranscriptResult:
    text: str


class ASRTranscriber:
    """
    Local automatic speech recognition using a Whisper-family model via Transformers.

    Note: the first run will download weights from Hugging Face.
    """

    def __init__(self, model_name: str = DEFAULT_ASR_MODEL) -> None:
        self.model_name = model_name
        self._pipe = pipeline(
            task="automatic-speech-recognition",
            model=model_name,
            # For CPU-only dev this is fine. If you have CUDA, you can set device=0.
        )

    def transcribe(self, audio: np.ndarray, sampling_rate: int) -> TranscriptResult:
        audio = np.asarray(audio, dtype=np.float32)
        out = self._pipe({"array": audio, "sampling_rate": sampling_rate})
        text = (out.get("text") or "").strip()
        return TranscriptResult(text=text)


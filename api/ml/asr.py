from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from transformers import pipeline


@dataclass(frozen=True)
class TranscriptResult:
    text: str


class ASRTranscriber:
    """
    Local automatic speech recognition using a Whisper-family model via Transformers.

    Note: the first run will download weights from Hugging Face.
    """

    def __init__(self, model_name: str = "openai/whisper-tiny") -> None:
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


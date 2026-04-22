from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from transformers import pipeline

from api.config import settings

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
        device = None
        # Prefer hardware acceleration when available.
        try:
            import torch

            if torch.cuda.is_available():
                device = 0
            elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
                device = "mps"
        except Exception:
            device = None
        self._pipe = pipeline(
            task="automatic-speech-recognition",
            model=model_name,
            device=device,  # may be None, int (CUDA), or "mps"
        )

    def transcribe(self, audio: np.ndarray, sampling_rate: int) -> TranscriptResult:
        audio = np.asarray(audio, dtype=np.float32)
        try:
            out = self._pipe(
                {"array": audio, "sampling_rate": sampling_rate},
                chunk_length_s=int(settings.asr_chunk_length_s),
                stride_length_s=int(settings.asr_stride_length_s),
                return_timestamps=False,
                generate_kwargs={"language": settings.asr_language, "task": "transcribe"},
            )
        except TypeError:
            # Older transformers pipeline versions may not accept these kwargs.
            out = self._pipe({"array": audio, "sampling_rate": sampling_rate})
        text = (out.get("text") or "").strip()
        return TranscriptResult(text=text)


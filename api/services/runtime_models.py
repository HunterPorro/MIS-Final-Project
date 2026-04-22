from __future__ import annotations

import threading
import time
from pathlib import Path

import torch

from api.config import settings
from api.ml.asr import ASRTranscriber
from api.ml.technical_infer import TechnicalAnalyzer
from api.ml.workspace_infer import WorkspaceClassifier

_lock = threading.Lock()
_workspace: WorkspaceClassifier | None = None
_technical: TechnicalAnalyzer | None = None
_asr: ASRTranscriber | None = None
_workspace_loaded_at: float | None = None
_technical_loaded_at: float | None = None
_asr_loaded_at: float | None = None


def workspace_path() -> Path:
    return settings.models_dir / settings.workspace_checkpoint


def technical_path() -> Path:
    return settings.models_dir / settings.technical_model_dir


def get_workspace() -> WorkspaceClassifier:
    global _workspace, _workspace_loaded_at
    with _lock:
        if _workspace is None:
            p = workspace_path()
            if not p.is_file():
                raise FileNotFoundError(
                    f"Workspace CNN not found at {p}. Run training/train_workspace_cnn.py after generating data."
                )
            _workspace = WorkspaceClassifier(p, device=torch.device("cpu"))
            _workspace_loaded_at = time.time()
        return _workspace


def get_technical() -> TechnicalAnalyzer:
    global _technical, _technical_loaded_at
    with _lock:
        if _technical is None:
            p = technical_path()
            if not (p / "config.json").is_file():
                raise FileNotFoundError(
                    f"Technical model not found under {p}. Run training/train_technical.py after build_technical_jsonl."
                )
            _technical = TechnicalAnalyzer(p, device=torch.device("cpu"))
            _technical_loaded_at = time.time()
        return _technical


def get_asr() -> ASRTranscriber:
    global _asr, _asr_loaded_at
    with _lock:
        if _asr is None:
            # Keep this small for local dev. Upgrade to whisper-small later if desired.
            _asr = ASRTranscriber(model_name=settings.asr_model)
            _asr_loaded_at = time.time()
        return _asr


def preload() -> None:
    """Warm caches if models exist."""
    try:
        get_workspace()
    except FileNotFoundError:
        pass
    try:
        get_technical()
    except FileNotFoundError:
        pass
    if settings.preload_asr:
        try:
            get_asr()
        except Exception:
            # ASR can require downloading weights; don't crash the service if it fails.
            pass


def model_status() -> dict[str, dict[str, object]]:
    """Runtime model load status for /health."""
    return {
        "workspace": {"loaded": _workspace is not None, "loaded_at": _workspace_loaded_at},
        "technical": {"loaded": _technical is not None, "loaded_at": _technical_loaded_at},
        "asr": {"loaded": _asr is not None, "loaded_at": _asr_loaded_at},
    }

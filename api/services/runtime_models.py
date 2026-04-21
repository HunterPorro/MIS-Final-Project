from __future__ import annotations

import threading
from pathlib import Path

import torch

from api.config import settings
from api.ml.technical_infer import TechnicalAnalyzer
from api.ml.workspace_infer import WorkspaceClassifier

_lock = threading.Lock()
_workspace: WorkspaceClassifier | None = None
_technical: TechnicalAnalyzer | None = None


def workspace_path() -> Path:
    return settings.models_dir / settings.workspace_checkpoint


def technical_path() -> Path:
    return settings.models_dir / settings.technical_model_dir


def get_workspace() -> WorkspaceClassifier:
    global _workspace
    with _lock:
        if _workspace is None:
            p = workspace_path()
            if not p.is_file():
                raise FileNotFoundError(
                    f"Workspace CNN not found at {p}. Run training/train_workspace_cnn.py after generating data."
                )
            _workspace = WorkspaceClassifier(p, device=torch.device("cpu"))
        return _workspace


def get_technical() -> TechnicalAnalyzer:
    global _technical
    with _lock:
        if _technical is None:
            p = technical_path()
            if not (p / "config.json").is_file():
                raise FileNotFoundError(
                    f"Technical model not found under {p}. Run training/train_technical.py after build_technical_jsonl."
                )
            _technical = TechnicalAnalyzer(p, device=torch.device("cpu"))
        return _technical


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

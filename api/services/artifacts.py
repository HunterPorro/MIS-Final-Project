from __future__ import annotations

import hashlib
from pathlib import Path

from api.services.runtime_models import technical_path, workspace_path


def verify_required_artifacts() -> dict[str, str]:
    """
    Verify required on-disk artifacts exist.

    Returns a small manifest (string paths) on success.
    Raises RuntimeError with a human-friendly message on failure.
    """
    ws = workspace_path()
    tech = technical_path() / "config.json"

    missing: list[str] = []
    if not ws.is_file():
        missing.append(f"- workspace checkpoint missing: {ws}")
    if not tech.is_file():
        missing.append(f"- technical model missing: {tech.parent} (expected config.json)")

    if missing:
        raise RuntimeError(
            "Required ML artifacts are missing.\n"
            + "\n".join(missing)
            + "\n\nBuild them locally with `./scripts/train_all.sh` "
            "and ensure the `models/` directory is present on the API host."
        )

    return {"workspace_checkpoint": str(ws), "technical_model_dir": str(tech.parent)}


def _fingerprint_file(p: Path, *, hash_limit_bytes: int = 1_000_000) -> dict[str, object]:
    """
    Lightweight artifact fingerprint for debugging “are we running the right model?”

    - Always includes size + mtime.
    - Includes sha256 of up to `hash_limit_bytes` from the beginning of the file to stay cheap.
    """
    st = p.stat()
    h = hashlib.sha256()
    with p.open("rb") as f:
        h.update(f.read(hash_limit_bytes))
    return {
        "path": str(p),
        "size_bytes": int(st.st_size),
        "mtime_s": float(st.st_mtime),
        "sha256_prefix": h.hexdigest(),
        "sha256_prefix_bytes": int(min(hash_limit_bytes, st.st_size)),
    }


def artifact_fingerprints() -> dict[str, dict[str, object]]:
    ws = workspace_path()
    tech_cfg = technical_path() / "config.json"
    tech_model = technical_path() / "model.safetensors"

    out: dict[str, dict[str, object]] = {}
    if ws.is_file():
        out["workspace_checkpoint"] = _fingerprint_file(ws)
    if tech_cfg.is_file():
        out["technical_config"] = _fingerprint_file(tech_cfg, hash_limit_bytes=250_000)
    if tech_model.is_file():
        out["technical_weights"] = _fingerprint_file(tech_model)
    return out


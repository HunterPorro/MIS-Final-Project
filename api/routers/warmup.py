from __future__ import annotations

import time

from fastapi import APIRouter

from api.services import runtime_models

router = APIRouter(tags=["ops"])


@router.post("/warmup")
def warmup():
    """
    Warm up model caches explicitly.

    Useful for demo day / first request latency: loads workspace + technical models and ASR (if enabled)
    and returns timing and current model_status.
    """
    t0 = time.perf_counter()
    timings: dict[str, float] = {}

    t = time.perf_counter()
    try:
        runtime_models.get_workspace()
        timings["workspace_load_ms"] = round((time.perf_counter() - t) * 1000, 1)
    except Exception as e:
        timings["workspace_load_ms"] = round((time.perf_counter() - t) * 1000, 1)
        timings["workspace_error"] = str(e)

    t = time.perf_counter()
    try:
        runtime_models.get_technical()
        timings["technical_load_ms"] = round((time.perf_counter() - t) * 1000, 1)
    except Exception as e:
        timings["technical_load_ms"] = round((time.perf_counter() - t) * 1000, 1)
        timings["technical_error"] = str(e)

    t = time.perf_counter()
    try:
        # ASR preload is optional; if it fails we still return status for debugging.
        runtime_models.get_asr()
        timings["asr_load_ms"] = round((time.perf_counter() - t) * 1000, 1)
    except Exception as e:
        timings["asr_load_ms"] = round((time.perf_counter() - t) * 1000, 1)
        timings["asr_error"] = str(e)

    timings["total_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return {"ok": True, "timings": timings, "models": runtime_models.model_status()}


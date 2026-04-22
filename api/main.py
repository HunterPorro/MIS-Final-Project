from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.middleware.rate_limit import RateLimitMiddleware
from api.middleware.request_id import RequestIdMiddleware
from api.routers import assess, mock_interview, warmup
from api.services.runtime_models import preload


@asynccontextmanager
async def lifespan(app: FastAPI):
    preload()
    yield


app = FastAPI(
    title="Final Round API",
    version="1.0.0",
    lifespan=lifespan,
    description="Workspace CNN + technical NLP fusion for screening-assist readiness scoring. See `/health` for model load status.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIdMiddleware)
if settings.enable_rate_limit:
    app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.rate_limit_per_minute)
app.include_router(assess.router, prefix="")
app.include_router(mock_interview.router, prefix="")
app.include_router(warmup.router, prefix="")


@app.get("/health")
def health(response: Response):
    from api.services.runtime_models import model_status, technical_path, workspace_path

    response.headers["Cache-Control"] = "no-store, max-age=0"

    ws_ok = workspace_path().is_file()
    tech_ok = (technical_path() / "config.json").is_file()
    ready = ws_ok and tech_ok

    return {
        "ok": True,
        "ready": ready,
        "status": "ready" if ready else "degraded",
        "service": "final-round-api",
        "version": "1.0.0",
        "workspace_ckpt": ws_ok,
        "technical_model": tech_ok,
        "models": model_status(),
        "env": settings.environment,
        # What each stage uses (no separate “embedding API”: DistilBERT uses token embeddings internally)
        "pipeline": {
            "workspace": "ResNet18 CNN (image → professional vs unprofessional workspace)",
            "technical_nlp": "DistilBERT sequence classifier (topic-prefixed text → expertise level 0–3); "
            "behavioral prompts use a dedicated communication rubric (finance classifier skipped — OOD-safe)",
            "asr": f"Transformers ASR pipeline ({settings.asr_model})",
            "behavioral": "Rule-based STAR/rubric scoring on transcript",
            "delivery": "Optional: DistilRoBERTa emotion on transcript + librosa prosody on WAV; "
            "optional OpenCV gaze heuristic from multi-frame JPEGs (advisory; small Fit weight when enabled)",
        },
        "artifacts": {
            "workspace_checkpoint": str(workspace_path()) if ws_ok else None,
            "technical_model_dir": str(technical_path()) if tech_ok else None,
        },
    }


@app.get("/")
def root():
    return {"service": "final-round-api", "docs": "/docs"}

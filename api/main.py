from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.routers import assess
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
app.include_router(assess.router, prefix="")


@app.get("/health")
def health():
    from pathlib import Path

    from api.services.runtime_models import technical_path, workspace_path

    return {
        "ok": True,
        "service": "final-round-api",
        "version": "1.0.0",
        "workspace_ckpt": workspace_path().is_file(),
        "technical_model": (technical_path() / "config.json").is_file(),
    }


@app.get("/")
def root():
    return {"service": "final-round-api", "docs": "/docs"}

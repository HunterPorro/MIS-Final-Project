from __future__ import annotations

import logging
import time
from io import BytesIO

from fastapi import APIRouter, File, Form, HTTPException, Header, Request, UploadFile
from PIL import Image

from api.config import settings
from api.ml.behavioral import analyze_behavioral
from api.ml.technical_infer import LEVEL_LABELS, TechnicalAnalyzer, normalize_topic
from api.schemas import BehavioralResult, MockInterviewResponse, TechnicalResult, WorkspaceResult
from api.services.fit import compute_fit
from api.services.narrative import build_narrative, maybe_enrich_with_llm
from api.services.runtime_models import get_asr, get_technical, get_workspace
from api.utils.audio import read_wav_bytes

router = APIRouter(tags=["mock-interview"])
logger = logging.getLogger("final-round-api.mock_interview")

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # ~25MB wav cap for safety
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def _professional_prob(classifier_labels: list[str], label: str, confidence: float, class_index: int) -> float:
    labels_lower = [x.lower() for x in classifier_labels]
    try:
        prof_i = labels_lower.index("professional")
    except ValueError:
        prof_i = 0
    if class_index == prof_i:
        return confidence
    return 1.0 - confidence


@router.post("/mock-interview", response_model=MockInterviewResponse)
async def mock_interview(
    request: Request,
    topic: str = Form(...),
    question_id: str | None = Form(default=None),
    question_track: str | None = Form(default=None),
    transcript_override: str | None = Form(default=None),
    audio_wav: UploadFile = File(...),
    image: UploadFile | None = File(default=None),
    x_admin_key: str | None = Header(default=None),
):
    """
    One-shot mock interview endpoint:
    - Accepts audio (WAV) and optional environment frame (image).
    - Transcribes audio locally (Whisper tiny).
    - Runs the existing technical analyzer on the transcript.
    - Runs workspace classifier if image provided; otherwise defaults to 'unknown' baseline.
    """
    t0 = time.perf_counter()
    t_norm = normalize_topic(topic)

    try:
        tech = get_technical()
        asr = get_asr()
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    # Read audio
    try:
        raw_audio = await audio_wav.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read audio upload: {e}") from e

    if len(raw_audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio too large")

    try:
        audio_arr, sr = read_wav_bytes(raw_audio)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid WAV audio: {e}") from e

    # Transcribe (or accept explicit transcript for deterministic testing)
    transcript = (transcript_override or "").strip()
    if transcript:
        allowed = settings.allow_transcript_override or (
            settings.admin_key is not None and x_admin_key is not None and x_admin_key == settings.admin_key
        )
        if not allowed:
            raise HTTPException(status_code=403, detail="transcript_override is disabled in this environment.")
    if not transcript:
        t_asr0 = time.perf_counter()
        tr = asr.transcribe(audio_arr, sr)
        transcript = tr.text
        logger.info(
            {
                "request_id": getattr(request.state, "request_id", None),
                "event": "asr_done",
                "ms": round((time.perf_counter() - t_asr0) * 1000, 1),
            }
        )
    if len(transcript.strip()) < 5:
        raise HTTPException(status_code=400, detail="Transcript too short—try a longer recording.")

    # If transcript_override is used, audio duration is not meaningful for behavioral pace.
    audio_seconds = None if transcript_override else (float(len(audio_arr) / sr) if sr > 0 else None)
    t_beh0 = time.perf_counter()
    beh = analyze_behavioral(transcript, audio_seconds=audio_seconds)
    beh_res = BehavioralResult(**beh.__dict__)
    logger.info(
        {
            "request_id": getattr(request.state, "request_id", None),
            "event": "behavioral_done",
            "ms": round((time.perf_counter() - t_beh0) * 1000, 1),
        }
    )

    # Workspace classification (optional)
    ws_label = "unknown"
    ws_conf = 0.5
    ws_idx = -1
    prof_prob = 0.5
    if image is not None:
        try:
            ws = get_workspace()
        except FileNotFoundError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        try:
            raw_img = await image.read()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read image upload: {e}") from e
        if len(raw_img) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="Image too large")
        try:
            pil = Image.open(BytesIO(raw_img))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image: {e}") from e
        t_ws0 = time.perf_counter()
        ws_label, ws_conf, ws_idx = ws.predict_pil(pil)
        prof_prob = _professional_prob(ws.classes, ws_label, ws_conf, ws_idx)
        logger.info(
            {
                "request_id": getattr(request.state, "request_id", None),
                "event": "workspace_done",
                "ms": round((time.perf_counter() - t_ws0) * 1000, 1),
            }
        )

    w_res = WorkspaceResult(label=ws_label, confidence=ws_conf, class_index=ws_idx)

    # Technical analyzer on transcript
    t_tech0 = time.perf_counter()
    level, level_conf, _probs = tech.predict(t_norm, transcript)
    skills, missed, coverage, explained, cov_score = TechnicalAnalyzer.lexicon_scan(t_norm, transcript)
    summ = TechnicalAnalyzer.short_summary(level, t_norm, skills)
    tech_res = TechnicalResult(
        expertise_level=level,
        expertise_label=LEVEL_LABELS[level],
        level_confidence=level_conf,
        topic=t_norm,
        skills_identified=skills,
        concepts_missed=missed,
        summary=summ,
        coverage=coverage,
        explained=explained,
        coverage_score=cov_score,
    )
    logger.info(
        {
            "request_id": getattr(request.state, "request_id", None),
            "event": "technical_done",
            "ms": round((time.perf_counter() - t_tech0) * 1000, 1),
        }
    )

    fit = compute_fit(
        prof_prob,
        level,
        behavioral_score=beh_res.score,
        transcript_word_count=beh_res.word_count,
        w_env=0.3,
        w_tech=0.55,
        w_beh=0.15,
    )
    t_narr0 = time.perf_counter()
    narrative = build_narrative(w_res, tech_res, fit, behavioral=beh_res)
    narrative = await maybe_enrich_with_llm(narrative)
    logger.info(
        {
            "request_id": getattr(request.state, "request_id", None),
            "event": "narrative_done",
            "ms": round((time.perf_counter() - t_narr0) * 1000, 1),
        }
    )

    logger.info(
        {
            "request_id": getattr(request.state, "request_id", None),
            "event": "mock_interview_done",
            "ms": round((time.perf_counter() - t0) * 1000, 1),
        }
    )

    return MockInterviewResponse(
        question_id=question_id,
        question_track=question_track,
        transcript=transcript,
        workspace=w_res,
        technical=tech_res,
        behavioral=beh_res,
        fit=fit,
        narrative=narrative,
    )


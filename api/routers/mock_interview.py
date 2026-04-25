from __future__ import annotations

import logging
import time
from io import BytesIO

import anyio
from fastapi import APIRouter, File, Form, HTTPException, Header, Request, UploadFile
from PIL import Image
import numpy as np

from api.config import settings
from api.ml.behavioral import analyze_behavioral
from api.ml.technical_infer import LEVEL_LABELS, interview_technical, normalize_topic
from api.schemas import (
    BehavioralResult,
    GazeInsight,
    MockInterviewResponse,
    ProsodyInsight,
    SentimentInsight,
    TechnicalResult,
    WorkspaceResult,
)
from api.services.fit import compute_fit
from api.services.narrative import build_narrative, maybe_enrich_with_llm_meta
from api.services.runtime_models import get_asr, get_technical, get_workspace
from api.utils.audio import read_wav_bytes
from api.utils.scoring import professional_probability

router = APIRouter(tags=["mock-interview"])
logger = logging.getLogger("final-round-api.mock_interview")

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # ~25MB wav cap for safety
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_GAZE_FRAME_BYTES = 2 * 1024 * 1024
MAX_GAZE_FRAMES = 8


async def _run_cpu_bound(label: str, fn, *args, timeout_s: int):
    t0 = time.perf_counter()
    try:
        with anyio.fail_after(timeout_s):
            return await anyio.to_thread.run_sync(fn, *args)
    except TimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail=f"{label} timed out after {timeout_s}s. Try a shorter recording or run warmup first.",
        ) from e
    finally:
        dt = round((time.perf_counter() - t0) * 1000, 1)
        logger.info(
            {"event": f"{label}_thread_ms", "ms": dt},
        )


@router.post("/mock-interview", response_model=MockInterviewResponse)
async def mock_interview(
    request: Request,
    topic: str = Form(...),
    question_id: str | None = Form(default=None),
    question_track: str | None = Form(default=None),
    session_id: str | None = Form(default=None),
    transcript_override: str | None = Form(default=None),
    audio_wav: UploadFile = File(...),
    image: UploadFile | None = File(default=None),
    gaze_frames: list[UploadFile] | None = File(default=None),
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
    timings_ms: dict[str, float] = {}
    warnings: list[str] = []
    if not topic or not str(topic).strip():
        raise HTTPException(status_code=400, detail="topic is required")
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
        # Be tolerant: still return a report with warnings so the UI doesn't "brick".
        warnings.append(f"Audio decode failed ({e}). Try re-recording or switching microphones.")
        audio_arr = np.zeros(1, dtype=np.float32)
        sr = 16000
    original_audio_seconds = float(len(audio_arr) / sr) if sr > 0 else None
    asr_trimmed = False

    # Transcribe (or accept explicit transcript for deterministic testing)
    transcript = (transcript_override or "").strip()
    if transcript:
        allowed = settings.allow_transcript_override or (
            settings.environment == "dev" and settings.dev_allow_transcript_override
        ) or (
            settings.admin_key is not None and x_admin_key is not None and x_admin_key == settings.admin_key
        )
        if not allowed:
            raise HTTPException(status_code=403, detail="transcript_override is disabled in this environment.")
    if not transcript:
        # Long answers can make local ASR painfully slow on CPU. We cap the audio used for ASR.
        if sr > 0:
            max_samples = int(max(1, settings.max_asr_seconds) * sr)
            if len(audio_arr) > max_samples:
                audio_arr = audio_arr[:max_samples]
                asr_trimmed = True
        t_asr0 = time.perf_counter()
        tr = await _run_cpu_bound("asr", asr.transcribe, audio_arr, sr, timeout_s=max(20, settings.request_timeout_s))
        transcript = tr.text
        timings_ms["asr"] = round((time.perf_counter() - t_asr0) * 1000, 1)
        logger.info(
            {
                "request_id": getattr(request.state, "request_id", None),
                "event": "asr_done",
                "ms": round((time.perf_counter() - t_asr0) * 1000, 1),
            }
        )
    stripped = transcript.strip()
    if len(stripped) < 5:
        # Don't hard-fail the whole request; return a coaching report with warnings.
        if not stripped:
            warnings.append(
                "No speech detected in the audio. Check the microphone input and record at least 6–10 seconds of clear speech."
            )
        else:
            warnings.append(
                "Transcript is very short. Record at least 6–10 seconds of clear speech for more reliable scoring."
            )

    # If transcript_override is used, audio duration is not meaningful for behavioral pace.
    audio_seconds = None if transcript_override else (float(len(audio_arr) / sr) if sr > 0 else None)
    t_beh0 = time.perf_counter()
    beh = analyze_behavioral(transcript, audio_seconds=audio_seconds, question_id=question_id)
    beh_res = BehavioralResult(**beh.__dict__)
    timings_ms["behavioral"] = round((time.perf_counter() - t_beh0) * 1000, 1)
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

        def _ws_predict():
            return ws.predict_pil(pil)

        ws_label, ws_conf, ws_idx = await _run_cpu_bound(
            "workspace",
            _ws_predict,
            timeout_s=min(60, settings.request_timeout_s),
        )
        prof_prob = professional_probability(ws.classes, ws_label, ws_conf, ws_idx)
        timings_ms["workspace"] = round((time.perf_counter() - t_ws0) * 1000, 1)
        logger.info(
            {
                "request_id": getattr(request.state, "request_id", None),
                "event": "workspace_done",
                "ms": round((time.perf_counter() - t_ws0) * 1000, 1),
            }
        )

    w_res = WorkspaceResult(label=ws_label, confidence=ws_conf, class_index=ws_idx)

    # Technical / communication analysis on transcript (behavioral prompts skip finance classifier — OOD-safe)
    t_tech0 = time.perf_counter()
    is_behavioral = (question_track or "").strip().lower() == "behavioral"
    level, level_conf, skills, missed, coverage, explained, cov_score, explanation_score, summ = await _run_cpu_bound(
        "technical",
        interview_technical,
        t_norm,
        transcript,
        question_track,
        tech,
        timeout_s=max(20, settings.request_timeout_s),
    )
    tech_topic = "Behavioral" if is_behavioral else t_norm
    tech_res = TechnicalResult(
        expertise_level=level,
        expertise_label=LEVEL_LABELS[level],
        level_confidence=level_conf,
        topic=tech_topic,
        skills_identified=skills,
        concepts_missed=missed,
        summary=summ,
        coverage=coverage,
        explained=explained,
        coverage_score=cov_score,
        explanation_score=explanation_score,
    )
    timings_ms["technical"] = round((time.perf_counter() - t_tech0) * 1000, 1)
    logger.info(
        {
            "request_id": getattr(request.state, "request_id", None),
            "event": "technical_done",
            "ms": round((time.perf_counter() - t_tech0) * 1000, 1),
        }
    )

    sentiment_insight: SentimentInsight | None = None
    prosody_insight: ProsodyInsight | None = None
    gaze_insight: GazeInsight | None = None
    delivery_score: float | None = None
    pr = None
    sent = None

    if settings.enable_delivery_insights:
        from api.ml.delivery import delivery_score_0_100
        from api.ml.prosody import analyze_prosody
        from api.ml.sentiment_infer import analyze_sentiment

        try:
            pr = analyze_prosody(
                audio_arr,
                sr,
                transcript_word_count=beh_res.word_count,
                audio_seconds=audio_seconds,
                speaking_rate_wpm=beh_res.speaking_rate_wpm,
            )
            prosody_insight = ProsodyInsight(
                label=pr.label,
                words_per_minute=pr.words_per_minute,
                pause_fraction=pr.pause_fraction,
                pitch_std_hz=pr.pitch_std_hz,
                rms_cv=pr.rms_cv,
                note=pr.note,
            )
        except Exception as e:
            logger.warning("prosody analysis failed: %s", e)

        try:
            sent = analyze_sentiment(transcript, hedge_hits=beh_res.hedge_hits or 0)
            if sent is not None:
                sentiment_insight = SentimentInsight(
                    tone=sent.tone,
                    dominant_emotion=sent.dominant_emotion,
                    emotion_scores=sent.emotion_scores,
                    note=sent.note,
                )
        except Exception as e:
            logger.warning("sentiment analysis failed: %s", e)

        if pr is not None:
            delivery_score = delivery_score_0_100(sent, pr)

    gaze_uploads = gaze_frames or []
    if gaze_uploads:
        pil_gaze: list[Image.Image] = []
        for uf in gaze_uploads[:MAX_GAZE_FRAMES]:
            try:
                raw_g = await uf.read()
            except Exception as e:
                logger.warning("gaze frame read failed: %s", e)
                continue
            if len(raw_g) > MAX_GAZE_FRAME_BYTES:
                continue
            try:
                pil_gaze.append(Image.open(BytesIO(raw_g)))
            except Exception as e:
                logger.warning("gaze frame decode failed: %s", e)
        if pil_gaze:

            def _gaze_run():
                from api.ml.gaze import analyze_gaze_sequence

                return analyze_gaze_sequence(pil_gaze)

            gr = await _run_cpu_bound(
                "gaze",
                _gaze_run,
                timeout_s=min(45, settings.request_timeout_s),
            )
            gaze_insight = GazeInsight(
                status=gr.status,
                pattern=gr.pattern,
                confidence=gr.confidence,
                frames_used=gr.frames_used,
                warning=gr.warning,
            )

    w_env, w_tech, w_beh = 0.3, 0.55, 0.15
    w_del = 0.0
    if settings.enable_delivery_insights and delivery_score is not None:
        w_env, w_tech, w_beh = 0.28, 0.52, 0.15
        w_del = float(settings.fit_weight_delivery)

    fit = compute_fit(
        prof_prob,
        level,
        behavioral_score=beh_res.score,
        transcript_word_count=beh_res.word_count,
        delivery_score=delivery_score,
        w_env=w_env,
        w_tech=w_tech,
        w_beh=w_beh,
        w_del=w_del,
    )
    t_narr0 = time.perf_counter()
    narrative = build_narrative(
        w_res,
        tech_res,
        fit,
        behavioral=beh_res,
        sentiment=sentiment_insight,
        prosody=prosody_insight,
        gaze=gaze_insight,
    )
    narrative, llm_meta = await maybe_enrich_with_llm_meta(narrative)
    if llm_meta.get("skip_reason") == "llm_timeout":
        warnings.append("Narrative enrichment timed out; returning the base narrative.")
    timings_ms["narrative"] = round((time.perf_counter() - t_narr0) * 1000, 1)
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

    timings_ms["total"] = round((time.perf_counter() - t0) * 1000, 1)
    resp = MockInterviewResponse(
        question_id=question_id,
        question_track=question_track,
        transcript=transcript,
        workspace=w_res,
        technical=tech_res,
        behavioral=beh_res,
        fit=fit,
        narrative=narrative,
        sentiment=sentiment_insight,
        prosody=prosody_insight,
        gaze=gaze_insight,
        timings_ms=timings_ms,
        analysis_meta={
            "audio_seconds_uploaded": original_audio_seconds or 0.0,
            "audio_seconds_asr_used": (audio_seconds or 0.0),
            "asr_trimmed": bool(asr_trimmed),
            "asr_model": settings.asr_model,
            "llm_enriched": bool(llm_meta.get("enriched")),
            "llm_skip_reason": (llm_meta.get("skip_reason") or ""),
        },
        warnings=warnings or None,
    )

    # Future recommendations (deterministic + optional Google Gemini enrichment).
    try:
        from api.services.recommendations import build_future_recommendations

        recs, rec_meta = await build_future_recommendations(resp)
        resp.recommendations = recs
        if resp.analysis_meta is not None:
            resp.analysis_meta["google_enriched"] = bool(rec_meta.get("enriched"))
            resp.analysis_meta["google_skip_reason"] = str(rec_meta.get("skip_reason") or "")
    except Exception as e:
        logger.warning("recommendations failed: %s", e)

    if session_id:
        try:
            from api.services.db import PersistenceDisabled, add_response

            add_response(
                session_id=session_id,
                question_id=question_id,
                question_track=question_track,
                topic=t_norm,
                transcript=transcript,
                workspace=w_res.model_dump(),
                technical=tech_res.model_dump(),
                behavioral=beh_res.model_dump(),
                fit=fit.model_dump(),
                narrative=narrative,
                warnings=warnings or None,
                timings_ms=timings_ms,
            )
        except PersistenceDisabled:
            # Persistence is optional; don't fail the main interview flow.
            pass
        except Exception as e:
            logger.warning("failed to persist session response: %s", e)

    return resp


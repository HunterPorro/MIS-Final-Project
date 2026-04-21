from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image

from api.ml.behavioral import analyze_behavioral
from api.ml.technical_infer import LEVEL_LABELS, TechnicalAnalyzer, normalize_topic
from api.schemas import BehavioralResult, MockInterviewResponse, TechnicalResult, WorkspaceResult
from api.services.fit import compute_fit
from api.services.narrative import build_narrative, maybe_enrich_with_llm
from api.services.runtime_models import get_asr, get_technical, get_workspace
from api.utils.audio import read_wav_bytes

router = APIRouter()

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
    topic: str = Form(...),
    audio_wav: UploadFile = File(...),
    image: UploadFile | None = File(default=None),
):
    """
    One-shot mock interview endpoint:
    - Accepts audio (WAV) and optional environment frame (image).
    - Transcribes audio locally (Whisper tiny).
    - Runs the existing technical analyzer on the transcript.
    - Runs workspace classifier if image provided; otherwise defaults to 'unknown' baseline.
    """
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

    # Transcribe
    tr = asr.transcribe(audio_arr, sr)
    transcript = tr.text
    if len(transcript.strip()) < 5:
        raise HTTPException(status_code=400, detail="Transcript too short—try a longer recording.")

    audio_seconds = float(len(audio_arr) / sr) if sr > 0 else None
    beh = analyze_behavioral(transcript, audio_seconds=audio_seconds)
    beh_res = BehavioralResult(**beh.__dict__)

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
        ws_label, ws_conf, ws_idx = ws.predict_pil(pil)
        prof_prob = _professional_prob(ws.classes, ws_label, ws_conf, ws_idx)

    w_res = WorkspaceResult(label=ws_label, confidence=ws_conf, class_index=ws_idx)

    # Technical analyzer on transcript
    level, level_conf, _probs = tech.predict(t_norm, transcript)
    skills, missed = TechnicalAnalyzer.lexicon_scan(t_norm, transcript)
    summ = TechnicalAnalyzer.short_summary(level, t_norm, skills)
    tech_res = TechnicalResult(
        expertise_level=level,
        expertise_label=LEVEL_LABELS[level],
        level_confidence=level_conf,
        topic=t_norm,
        skills_identified=skills,
        concepts_missed=missed,
        summary=summ,
    )

    fit = compute_fit(prof_prob, level)
    narrative = build_narrative(w_res, tech_res, fit)
    narrative = await maybe_enrich_with_llm(narrative)

    return MockInterviewResponse(
        transcript=transcript,
        workspace=w_res,
        technical=tech_res,
        behavioral=beh_res,
        fit=fit,
        narrative=narrative,
    )


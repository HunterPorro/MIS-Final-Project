from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image

from api.schemas import AssessResponse, TechnicalResult, WorkspaceResult
from api.services.fit import compute_fit
from api.services.narrative import build_narrative, maybe_enrich_with_llm
from api.services.runtime_models import get_technical, get_workspace
from api.ml.technical_infer import LEVEL_LABELS, normalize_topic, TechnicalAnalyzer

router = APIRouter()

# ~8 MiB — enough for high-res webcam JPEGs without accepting huge uploads
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_ANSWER_CHARS = 12000


def _professional_prob(classifier_labels: list[str], label: str, confidence: float, class_index: int) -> float:
    """Map predicted class to P(professional) for scoring."""
    labels_lower = [x.lower() for x in classifier_labels]
    try:
        prof_i = labels_lower.index("professional")
    except ValueError:
        prof_i = 0
    if class_index == prof_i:
        return confidence
    return 1.0 - confidence


@router.post("/assess", response_model=AssessResponse)
async def assess(
    topic: str = Form(...),
    answer_text: str = Form(...),
    image: UploadFile = File(...),
):
    if len(answer_text.strip()) < 10:
        raise HTTPException(status_code=400, detail="answer_text too short")
    if len(answer_text) > MAX_ANSWER_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"answer_text too long (max {MAX_ANSWER_CHARS} characters)",
        )

    try:
        ws = get_workspace()
        tech = get_technical()
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    try:
        raw = await image.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read upload: {e}") from e

    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large (max {MAX_IMAGE_BYTES // (1024 * 1024)} MiB)",
        )

    try:
        pil = Image.open(BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}") from e

    t_norm = normalize_topic(topic)
    label, conf, idx = ws.predict_pil(pil)
    prof_prob = _professional_prob(ws.classes, label, conf, idx)

    w_res = WorkspaceResult(label=label, confidence=conf, class_index=idx)

    level, level_conf, _probs = tech.predict(t_norm, answer_text)
    skills, missed, coverage, explained, cov_score = TechnicalAnalyzer.lexicon_scan(t_norm, answer_text)
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

    fit = compute_fit(prof_prob, level)
    text = build_narrative(w_res, tech_res, fit)
    text = await maybe_enrich_with_llm(text)

    return AssessResponse(workspace=w_res, technical=tech_res, fit=fit, narrative=text)

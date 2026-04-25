from __future__ import annotations

import logging

import anyio
import httpx

from api.config import settings
from api.schemas import MockInterviewResponse

logger = logging.getLogger(__name__)


def _deterministic_recommendations(resp: MockInterviewResponse) -> list[str]:
    """
    Always-available recommendations (no external APIs).
    Keep these concrete, practice-able, and based on model outputs.
    """
    recs: list[str] = []

    # Behavioral: top fixes + STAR + numbers
    b = resp.behavioral
    if getattr(b, "top_fixes", None):
        recs.extend([f"Behavioral: {x}" for x in (b.top_fixes or [])])
    if not b.has_numbers:
        recs.append("Behavioral: add one metric (%, $, bps, time) tied to the result.")
    if (b.star_hits or 0) < 3:
        recs.append("Behavioral: restructure as STAR (Situation → Task → Actions → Result).")

    # Technical: gaps
    t = resp.technical
    if t.concepts_missed:
        for c in t.concepts_missed[:3]:
            recs.append(f"Technical: drill `{c}` with one 60-second explanation + one example.")
    if (t.explanation_score or 0) < 35 and (t.coverage_score or 0) > 0:
        recs.append("Technical: add 2 explicit causal links (“because/therefore”) between your steps.")

    # Environment
    if resp.workspace.label.lower() == "unknown":
        recs.append("Environment: capture a camera frame once (lighting + background) for a grounded workspace score.")
    elif resp.workspace.label.lower() == "unprofessional":
        recs.append("Environment: improve lighting + background; position camera at eye level.")

    # Make sure we always return something usable.
    out = []
    for r in recs:
        r = r.strip()
        if r and r not in out:
            out.append(r)
    return out[:7] if out else ["Repeat the same question and aim to add: (1) one metric, (2) one clear result, (3) one causal link."]


async def _gemini_generate(prompt: str) -> str:
    """
    Call Google Generative Language API (Gemini) via HTTP.
    """
    if not settings.google_api_key:
        raise RuntimeError("missing_google_api_key")
    model = settings.google_model
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    params = {"key": settings.google_api_key}
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.35, "maxOutputTokens": 450},
    }
    timeout = httpx.Timeout(timeout=max(5.0, float(settings.google_timeout_s)))
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, params=params, json=payload)
        r.raise_for_status()
        j = r.json()
    # Extract text (best-effort)
    try:
        return (
            j["candidates"][0]["content"]["parts"][0]["text"]  # type: ignore[index]
        ).strip()
    except Exception:
        return ""


def _parse_bullets(text: str) -> list[str]:
    lines = [ln.strip(" \t-•") for ln in (text or "").splitlines()]
    lines = [ln for ln in lines if ln]
    # Prefer 3–6 bullets; if the model returns paragraphs, keep first lines.
    out: list[str] = []
    for ln in lines:
        if len(ln) < 4:
            continue
        if ln.lower().startswith(("recommendation", "recs", "plan")):
            continue
        out.append(ln)
    return out[:7]


async def build_future_recommendations(resp: MockInterviewResponse) -> tuple[list[str], dict[str, str | bool | None]]:
    """
    Returns (recommendations, meta).
    Meta fields: enriched(bool), skip_reason(str|None), error(str|None)
    """
    base = _deterministic_recommendations(resp)
    if not settings.google_api_key:
        return base, {"enriched": False, "skip_reason": "missing_google_api_key", "error": None}

    # Build a compact prompt. Avoid dumping giant JSON.
    b = resp.behavioral
    t = resp.technical
    prompt = "\n".join(
        [
            "You are an expert interview coach. Produce 5 short, concrete recommendations for what to practice next.",
            "Each bullet must start with one of: Behavioral:, Technical:, Delivery:, Environment:, Plan:.",
            "Keep bullets actionable (a drill, a script line to add, or a practice routine).",
            "",
            f"Question ID: {resp.question_id or 'n/a'}",
            f"Track: {resp.question_track or 'n/a'}",
            f"Behavioral score: {b.score:.1f}/100 (STAR hits: {b.star_hits or 0}, has_numbers: {b.has_numbers})",
            f"Technical: {t.expertise_label} ({t.topic}), coverage {t.coverage_score or 0:.1f}, explanation {t.explanation_score or 0:.1f}",
            f"Top missed concepts: {', '.join((t.concepts_missed or [])[:5]) or 'n/a'}",
            f"Question beats missed: {', '.join([k for k,v in (b.question_coverage or {}).items() if not v]) or 'n/a'}",
            "",
            "Transcript (trimmed):",
            (resp.transcript or "")[:1400],
        ]
    )

    try:
        with anyio.fail_after(max(6, int(settings.google_timeout_s))):
            text = await _gemini_generate(prompt)
        bullets = _parse_bullets(text)
        if bullets:
            return bullets, {"enriched": True, "skip_reason": None, "error": None}
        return base, {"enriched": False, "skip_reason": "empty_google_response", "error": None}
    except TimeoutError:
        return base, {"enriched": False, "skip_reason": "google_timeout", "error": None}
    except Exception as e:
        logger.warning("google recommendations skipped: %s", e)
        return base, {"enriched": False, "skip_reason": "google_error", "error": str(e)}


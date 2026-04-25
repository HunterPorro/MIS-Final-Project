from __future__ import annotations

import logging

import anyio

from api.schemas import (
    BehavioralResult,
    FitResult,
    GazeInsight,
    ProsodyInsight,
    SentimentInsight,
    TechnicalResult,
    WorkspaceResult,
)

logger = logging.getLogger(__name__)


def _is_behavioral_topic(topic: str) -> bool:
    return topic.strip().lower() == "behavioral"


def build_narrative(
    workspace: WorkspaceResult,
    technical: TechnicalResult,
    fit: FitResult,
    behavioral: BehavioralResult | None = None,
    sentiment: SentimentInsight | None = None,
    prosody: ProsodyInsight | None = None,
    gaze: GazeInsight | None = None,
) -> str:
    wl = workspace.label.lower()
    if wl == "unknown":
        env_note = (
            "No environment frame was provided, so workspace scoring uses a neutral baseline. "
            "Add a quick camera snapshot for a grounded read on setting and framing."
        )
    elif wl == "professional":
        env_note = "Environment reads as firm-ready for virtual interviews."
    else:
        env_note = "Environment signal suggests tightening setup (lighting, background, and on-camera framing)."
    is_behavioral_topic = _is_behavioral_topic(technical.topic)
    gaps = (
        ", ".join(technical.concepts_missed[:4])
        if technical.concepts_missed
        else (
            "add specificity (metrics, timeframe, stakeholders) so reviewers can verify impact."
            if is_behavioral_topic
            else "no major topic gaps flagged by the checklist (still verify depth verbally)."
        )
    )
    strengths = (
        ", ".join(technical.skills_identified[:5])
        if technical.skills_identified
        else (
            "add concrete story beats (context, your actions, measurable result)."
            if is_behavioral_topic
            else "limited explicit markers—consider adding structured technical anchors."
        )
    )
    beh_note = ""
    feedback_line = ""
    if behavioral is not None:
        star_hits = sum(1 for v in behavioral.star_coverage.values() if v)
        beh_note = (
            f" Delivery: {behavioral.score:.0f}/100 behavioral rubric. "
            + ("Quantified impact present. " if behavioral.has_numbers else "Add one quantified outcome. ")
            + ("STAR coverage looks solid. " if star_hits >= 3 else "Tighten STAR: situation → task → actions → result. ")
        )
        if behavioral.feedback:
            feedback_line = " Coaching priorities: " + "; ".join(behavioral.feedback[:4]) + "."
    del_note = ""
    if sentiment is not None or prosody is not None:
        parts: list[str] = []
        if sentiment is not None:
            parts.append(f"Transcript tone skews {sentiment.tone} (dominant cue: {sentiment.dominant_emotion or 'n/a'}).")
        if prosody is not None:
            parts.append(f"Vocal delivery reads as {prosody.label} (prosody signal).")
        if parts:
            del_note = " " + " ".join(parts)
    gaze_note = ""
    if gaze is not None and gaze.status == "ok" and gaze.pattern:
        gwarn = f" {gaze.warning}" if gaze.warning else ""
        pct = min(100.0, max(0.0, gaze.confidence * 100.0))
        gaze_note = (
            f" Optional gaze heuristic: movement pattern `{gaze.pattern}`"
            f" (confidence {pct:.0f}%).{gwarn}"
            if gaze.confidence is not None
            else f" Optional gaze heuristic: movement pattern `{gaze.pattern}`.{gwarn}"
        )
    rubric_label = "Communication & story depth" if is_behavioral_topic else "Technical stance"
    causal_note = ""
    if (
        not is_behavioral_topic
        and behavioral is None
        and technical.explanation_score is not None
    ):
        es = technical.explanation_score
        if es < 34.0:
            causal_note = " Causal clarity looks thin—add a few explicit “because” / “therefore” links between steps."
        elif es < 55.0:
            causal_note = " Causal clarity is uneven—tie each major step to why it moves the answer."
    del_fit = ""
    if fit.delivery_component is not None:
        del_fit = f", delivery {fit.delivery_component:.0f}"
    return (
        f"Readiness snapshot — Fit {fit.fit_score:.0f}/100 (env {fit.environment_component:.0f}, "
        f"technical {fit.technical_component:.0f}{del_fit}).{beh_note} {env_note} "
        f"{rubric_label}: {technical.expertise_label} on {technical.topic}. "
        f"Observed strengths: {strengths}. "
        f"{'Gaps to address next' if is_behavioral_topic else 'Concepts to reinforce next'}: {gaps}. "
        f"{technical.summary}{causal_note}{feedback_line}{del_note}{gaze_note}"
    )


async def maybe_enrich_with_llm(narrative: str) -> str:
    text, _meta = await maybe_enrich_with_llm_meta(narrative)
    return text


async def maybe_enrich_with_llm_meta(narrative: str) -> tuple[str, dict[str, str | bool | None]]:
    """Optional OpenAI polish; returns original on failure/missing key.

    Returns (narrative, meta) where meta includes:
    - enriched: bool
    - skip_reason: str|None
    - error: str|None
    """
    from api.config import settings

    if not settings.openai_api_key:
        return narrative, {"enriched": False, "skip_reason": "missing_openai_api_key", "error": None}

    def _call_openai(prompt: str) -> str:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        r = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert campus and finance interview coach. Rewrite the rubric output into "
                    "a tight brief: (1) readiness snapshot with fit score, (2) two concrete strengths, "
                    "(3) two prioritized improvements. Preserve every numeric score verbatim. "
                    "Professional, encouraging tone. No medical or legal claims.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.25,
            max_tokens=650,
        )
        return (r.choices[0].message.content or "").strip()

    try:
        timeout_s = max(8, int(settings.narrative_timeout_s))
        with anyio.fail_after(timeout_s):
            text = await anyio.to_thread.run_sync(_call_openai, narrative)
        if not text:
            return narrative, {"enriched": False, "skip_reason": "empty_llm_response", "error": None}
        return text, {"enriched": True, "skip_reason": None, "error": None}
    except TimeoutError:
        return narrative, {"enriched": False, "skip_reason": "llm_timeout", "error": None}
    except Exception as e:
        logger.warning("LLM narrative enrich skipped: %s", e)
        return narrative, {"enriched": False, "skip_reason": "llm_error", "error": str(e)}

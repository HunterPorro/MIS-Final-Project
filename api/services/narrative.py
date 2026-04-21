from __future__ import annotations

from api.schemas import FitResult, TechnicalResult, WorkspaceResult


def build_narrative(
    workspace: WorkspaceResult,
    technical: TechnicalResult,
    fit: FitResult,
) -> str:
    env_note = (
        "Environment reads as firm-ready for virtual interviews."
        if workspace.label.lower() == "professional"
        else "Environment signal suggests tightening setup (lighting, background, and on-camera framing)."
    )
    gaps = (
        ", ".join(technical.concepts_missed[:4])
        if technical.concepts_missed
        else "no major topic gaps flagged by the checklist (still verify depth verbally)."
    )
    strengths = (
        ", ".join(technical.skills_identified[:5])
        if technical.skills_identified
        else "limited explicit markers—consider adding structured technical anchors."
    )
    return (
        f"Readiness snapshot — Fit {fit.fit_score:.0f}/100 (env {fit.environment_component:.0f}, "
        f"technical {fit.technical_component:.0f}). {env_note} "
        f"Technical stance: {technical.expertise_label} on {technical.topic}. "
        f"Observed strengths: {strengths}. "
        f"Concepts to reinforce next: {gaps}. "
        f"{technical.summary}"
    )


async def maybe_enrich_with_llm(narrative: str) -> str:
    """Optional OpenAI polish; returns original on failure or missing key."""
    from api.config import settings

    if not settings.openai_api_key:
        return narrative
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a concise recruiting coach. Rewrite the assessment in 3 short paragraphs. "
                    "Keep numbers. No medical or legal claims.",
                },
                {"role": "user", "content": narrative},
            ],
            temperature=0.3,
            max_tokens=500,
        )
        text = (r.choices[0].message.content or "").strip()
        return text or narrative
    except Exception:
        return narrative

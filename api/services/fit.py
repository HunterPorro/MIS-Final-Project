from __future__ import annotations

from api.schemas import FitResult


def compute_fit(
    professional_probability: float,
    expertise_level: int,
    behavioral_score: float | None = None,
    w_env: float = 0.35,
    w_tech: float = 0.65,
    w_beh: float = 0.0,
) -> FitResult:
    """
    professional_probability: P(class == 'professional') in [0,1].
    expertise_level: 0..3 from classifier.
    """
    env_component = round(100.0 * professional_probability, 1)
    tech_component = round((expertise_level / 3.0) * 100.0, 1) if expertise_level >= 0 else 0.0
    beh_component = float(behavioral_score) if behavioral_score is not None else None

    # If behavioral is provided, fold it into the final Fit Score while keeping the same response shape
    # (env_component + technical_component remain comparable across versions).
    if beh_component is None or w_beh <= 0:
        fit = round(w_env * env_component + w_tech * tech_component, 1)
        weights = {"environment": w_env, "technical": w_tech}
    else:
        total = w_env + w_tech + w_beh
        w_env_n = w_env / total
        w_tech_n = w_tech / total
        w_beh_n = w_beh / total
        fit = round(w_env_n * env_component + w_tech_n * tech_component + w_beh_n * beh_component, 1)
        weights = {"environment": round(w_env_n, 4), "technical": round(w_tech_n, 4), "behavioral": round(w_beh_n, 4)}
    return FitResult(
        fit_score=fit,
        environment_component=env_component,
        technical_component=tech_component,
        weights=weights,
    )

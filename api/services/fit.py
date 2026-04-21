from __future__ import annotations

from api.schemas import FitResult


def compute_fit(
    professional_probability: float,
    expertise_level: int,
    w_env: float = 0.35,
    w_tech: float = 0.65,
) -> FitResult:
    """
    professional_probability: P(class == 'professional') in [0,1].
    expertise_level: 0..3 from classifier.
    """
    env_component = round(100.0 * professional_probability, 1)
    tech_component = round((expertise_level / 3.0) * 100.0, 1) if expertise_level >= 0 else 0.0
    fit = round(w_env * env_component + w_tech * tech_component, 1)
    return FitResult(
        fit_score=fit,
        environment_component=env_component,
        technical_component=tech_component,
        weights={"environment": w_env, "technical": w_tech},
    )

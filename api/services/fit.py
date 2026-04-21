from __future__ import annotations

from api.schemas import FitResult


def compute_fit(
    professional_probability: float,
    expertise_level: int,
    behavioral_score: float | None = None,
    transcript_word_count: int | None = None,
    delivery_score: float | None = None,
    w_env: float = 0.35,
    w_tech: float = 0.65,
    w_beh: float = 0.0,
    w_del: float = 0.0,
) -> FitResult:
    """
    professional_probability: P(class == 'professional') in [0,1].
    expertise_level: 0..3 from classifier.
    delivery_score: optional 0–100 from tone + prosody (small Fit weight).
    """
    env_component = round(100.0 * professional_probability, 1)
    tech_component = round((expertise_level / 3.0) * 100.0, 1) if expertise_level >= 0 else 0.0
    beh_component = float(behavioral_score) if behavioral_score is not None else None
    del_component = float(delivery_score) if delivery_score is not None else None

    # Guardrails: very short transcripts are noisy. Smooth tech/behavioral toward a neutral baseline
    # and reduce behavioral weight so Fit doesn't swing wildly.
    wc = transcript_word_count or 0
    if wc > 0:
        tech_r = min(1.0, wc / 55.0)  # tech stabilizes quickly
        beh_r = min(1.0, wc / 85.0)  # behavioral needs more context
        baseline = 50.0
        tech_component = round(baseline + (tech_component - baseline) * tech_r, 1)
        if beh_component is not None:
            beh_component = round(baseline + (beh_component - baseline) * beh_r, 1)
            w_beh = w_beh * beh_r
        if del_component is not None:
            del_component = round(baseline + (del_component - baseline) * min(1.0, wc / 70.0), 1)
            w_del = w_del * min(1.0, wc / 70.0)

    use_beh = beh_component is not None and w_beh > 0
    use_del = del_component is not None and w_del > 0

    if not use_beh and not use_del:
        fit = round(w_env * env_component + w_tech * tech_component, 1)
        weights = {"environment": w_env, "technical": w_tech}
        return FitResult(
            fit_score=fit,
            environment_component=env_component,
            technical_component=tech_component,
            weights=weights,
            delivery_component=None,
        )

    total = w_env + w_tech
    if use_beh:
        total += w_beh
    if use_del:
        total += w_del

    w_env_n = w_env / total
    w_tech_n = w_tech / total
    acc = w_env_n * env_component + w_tech_n * tech_component
    weights: dict[str, float] = {
        "environment": round(w_env_n, 4),
        "technical": round(w_tech_n, 4),
    }
    if use_beh:
        w_beh_n = w_beh / total
        acc += w_beh_n * beh_component  # type: ignore[arg-type]
        weights["behavioral"] = round(w_beh_n, 4)
    if use_del:
        w_del_n = w_del / total
        acc += w_del_n * del_component  # type: ignore[arg-type]
        weights["delivery"] = round(w_del_n, 4)

    fit = round(acc, 1)
    return FitResult(
        fit_score=fit,
        environment_component=env_component,
        technical_component=tech_component,
        weights=weights,
        delivery_component=round(del_component, 1) if use_del else None,
    )

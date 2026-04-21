"""Shared scoring helpers for workspace → environment signal."""


def professional_probability(classifier_labels: list[str], _label: str, confidence: float, class_index: int) -> float:
    """
    Map CNN softmax output to P(professional) for the environment component.
    If 'professional' is not a class name, treat index 0 as the positive class.
    """
    labels_lower = [x.lower() for x in classifier_labels]
    try:
        prof_i = labels_lower.index("professional")
    except ValueError:
        prof_i = 0
    if class_index == prof_i:
        return confidence
    return 1.0 - confidence

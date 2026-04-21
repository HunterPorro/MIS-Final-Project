"""Unit tests for technical scoring helpers (no model weights required)."""

from __future__ import annotations

import math
import unittest

from api.ml.technical_infer import (
    TechnicalAnalyzer,
    _sanitize_probability_vector,
    answer_text_for_classifier,
    blend_technical_level,
    composite_rubric_score,
    compute_explanation_score,
    softmax_entropy,
    softmax_margin,
)


class TestSoftmaxEntropy(unittest.TestCase):
    def test_uniform_four_way(self) -> None:
        p = [0.25, 0.25, 0.25, 0.25]
        h = softmax_entropy(p)
        self.assertAlmostEqual(h, math.log(4), places=5)

    def test_peaked(self) -> None:
        p = [0.97, 0.01, 0.01, 0.01]
        h = softmax_entropy(p)
        self.assertLess(h, 0.35)


class TestBlendTechnicalLevel(unittest.TestCase):
    def test_high_confidence_ignores_coverage(self) -> None:
        level = blend_technical_level(1, 0.9, 90.0, entropy=0.2)
        self.assertEqual(level, 1)

    def test_low_conf_blends_toward_coverage(self) -> None:
        level = blend_technical_level(0, 0.4, 80.0, entropy=0.5)
        self.assertGreaterEqual(level, 1)

    def test_high_entropy_triggers_blend(self) -> None:
        level = blend_technical_level(3, 0.6, 10.0, entropy=1.25)
        self.assertLessEqual(level, 3)

    def test_short_answer_triggers_coverage_blend(self) -> None:
        """Very short transcripts should not anchor solely on a peaked classifier."""
        level = blend_technical_level(3, 0.92, 12.0, entropy=0.25, word_count=20)
        self.assertLess(level, 3)

    def test_tight_softmax_margin_triggers_blend(self) -> None:
        """Near ties between top classes should lean on rubric, not a fragile argmax."""
        level = blend_technical_level(
            3,
            0.88,
            12.0,
            entropy=0.55,
            margin=0.05,
            explanation_score=10.0,
        )
        self.assertLessEqual(level, 2)


class TestSoftmaxMargin(unittest.TestCase):
    def test_clear_winner(self) -> None:
        self.assertGreater(softmax_margin([0.9, 0.05, 0.03, 0.02]), 0.4)

    def test_near_tie(self) -> None:
        self.assertLess(softmax_margin([0.27, 0.26, 0.24, 0.23]), 0.05)


class TestCompositeRubric(unittest.TestCase):
    def test_blends_cov_and_expl(self) -> None:
        self.assertAlmostEqual(composite_rubric_score(80.0, 0.0), 44.0, places=5)
        self.assertEqual(composite_rubric_score(50.0, None), 50.0)

    def test_nan_inputs_clamped(self) -> None:
        self.assertEqual(composite_rubric_score(float("nan"), 50.0), 22.5)


class TestSanitizeProbs(unittest.TestCase):
    def test_empty_uniform(self) -> None:
        p = _sanitize_probability_vector([])
        self.assertEqual(len(p), 4)
        self.assertAlmostEqual(sum(p), 1.0, places=5)

    def test_nan_dropped(self) -> None:
        import math

        p = _sanitize_probability_vector([0.5, float("nan"), 0.5, 0.0])
        self.assertFalse(any(math.isnan(x) for x in p))
        self.assertAlmostEqual(sum(p), 1.0, places=5)


class TestLexiconScan(unittest.TestCase):
    """Regression: LBO/M&A paths must not reference undefined helpers."""

    def test_lbo_scan_runs(self) -> None:
        s, m, c, e, cs, es = TechnicalAnalyzer.lexicon_scan(
            "LBO",
            "IRR and MOIC matter because leverage drives returns; cash flow deleverages the balance sheet.",
        )
        self.assertGreater(len(s), 0)
        self.assertIsInstance(c, dict)

    def test_behavioral_quant_explained(self) -> None:
        _s, _m, cov, expl, _cs, es = TechnicalAnalyzer.lexicon_scan(
            "Behavioral", "We saved 15% over 8 weeks during my internship."
        )
        if cov.get("quant"):
            self.assertTrue(expl.get("quant"))


class TestExplanationScore(unittest.TestCase):
    def test_all_explained(self) -> None:
        cov = {"a": True, "b": True}
        expl = {"a": True, "b": True}
        self.assertEqual(compute_explanation_score(cov, expl), 100.0)

    def test_partial(self) -> None:
        cov = {"a": True, "b": True, "c": False}
        expl = {"a": True, "b": False, "c": False}
        self.assertEqual(compute_explanation_score(cov, expl), 50.0)


class TestAnswerTail(unittest.TestCase):
    def test_short_unchanged(self) -> None:
        s = "hello world"
        self.assertEqual(answer_text_for_classifier(s), s)

    def test_long_uses_tail(self) -> None:
        s = "x" * 3000
        t = answer_text_for_classifier(s, max_chars=100)
        self.assertEqual(len(t), 100)
        self.assertTrue(t.endswith("x"))


if __name__ == "__main__":
    unittest.main()

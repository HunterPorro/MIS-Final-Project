"""Behavioral vs technical routing for mock-interview analysis."""

from __future__ import annotations

import unittest

from api.ml.technical_infer import TechnicalAnalyzer, interview_technical
from api.services.runtime_models import technical_path


class TestInterviewTechnicalRouting(unittest.TestCase):
    def test_behavioral_uses_communication_rubric(self) -> None:
        p = technical_path()
        if not (p / "config.json").is_file():
            self.skipTest(f"Missing technical model under {p}")
        tech = TechnicalAnalyzer(p)
        txt = (
            "During my internship I owned a diligence stream. I coordinated with legal and modeled synergies. "
            "We closed in eight weeks and saved roughly fifteen percent on fees."
        )
        level, conf, skills, missed, _cov, _expl, _cs, _es, summ = interview_technical("M&A", txt, "behavioral", tech)
        self.assertIn(level, (0, 1, 2, 3))
        self.assertGreater(conf, 0.4)
        self.assertIn("Behavioral", summ)
        self.assertIsInstance(skills, list)
        self.assertIsInstance(missed, list)

    def test_technical_uses_finance_classifier(self) -> None:
        p = technical_path()
        if not (p / "config.json").is_file():
            self.skipTest(f"Missing technical model under {p}")
        tech = TechnicalAnalyzer(p)
        txt = (
            "Accretion depends on purchase price, synergies, and pro forma EPS. We built sources and uses and "
            "checked goodwill and PPA."
        )
        level, conf, skills, missed, _cov, _expl, _cs, _es, summ = interview_technical("M&A", txt, "technical", tech)
        self.assertIn(level, (0, 1, 2, 3))
        self.assertGreater(conf, 0.0)
        self.assertNotIn("Behavioral", summ)
        self.assertIn("M&A", summ)


if __name__ == "__main__":
    unittest.main()

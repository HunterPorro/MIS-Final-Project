"""Smoke tests: verify CNN workspace, DistilBERT technical, and behavioral rubric run end-to-end.

Set SMOKE_TEST_ASR=1 to also load Whisper ASR (slow / may download weights).
"""

from __future__ import annotations

import os
import unittest
from pathlib import Path

from PIL import Image

from api.ml.behavioral import analyze_behavioral
from api.ml.technical_infer import TechnicalAnalyzer
from api.ml.workspace_infer import WorkspaceClassifier
from api.services.runtime_models import get_asr, technical_path, workspace_path


class TestPipelineSmoke(unittest.TestCase):
    def test_workspace_cnn_predicts(self) -> None:
        p = workspace_path()
        if not p.is_file():
            self.skipTest(f"Missing workspace checkpoint: {p}")
        ws = WorkspaceClassifier(p)
        img = Image.new("RGB", (640, 480), (200, 200, 200))
        label, conf, idx = ws.predict_pil(img)
        self.assertIsInstance(label, str)
        self.assertGreater(conf, 0.0)
        self.assertGreaterEqual(idx, 0)

    def test_technical_distilbert_predicts(self) -> None:
        p = technical_path()
        if not (p / "config.json").is_file():
            self.skipTest(f"Missing technical model: {p}")
        tech = TechnicalAnalyzer(p)
        idx, conf, probs = tech.predict(
            "M&A",
            "We analyzed synergies, sources and uses, and EPS accretion with a 20% premium.",
        )
        self.assertIn(idx, (0, 1, 2, 3))
        self.assertGreater(conf, 0.0)
        self.assertEqual(len(probs), 4)

    def test_behavioral_rubric(self) -> None:
        beh = analyze_behavioral(
            "In my internship I owned a diligence workstream. I coordinated with legal and modeled synergies. "
            "We closed the process in 8 weeks and the team saved roughly 15% on fees.",
            audio_seconds=45.0,
        )
        self.assertGreater(beh.score, 0.0)
        self.assertGreater(beh.word_count, 10)

    @unittest.skipUnless(os.environ.get("SMOKE_TEST_ASR") == "1", "Set SMOKE_TEST_ASR=1 to run Whisper ASR smoke")
    def test_asr_whisper_loads(self) -> None:
        asr = get_asr()
        self.assertIsNotNone(asr)


if __name__ == "__main__":
    unittest.main()

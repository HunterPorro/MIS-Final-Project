from __future__ import annotations

import asyncio
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


class TestMockInterviewEndpoint(unittest.TestCase):
    def test_mock_interview_transcript_override_returns_report(self) -> None:
        # Import inside test so we can tweak settings safely.
        from api.config import settings
        from api.main import app

        settings.openai_api_key = None  # deterministic: no external calls

        wav_path = Path(__file__).resolve().parents[2] / "training" / "data" / "sample.wav"
        self.assertTrue(wav_path.is_file(), f"Missing fixture wav: {wav_path}")

        with TestClient(app) as client, wav_path.open("rb") as f:
            resp = client.post(
                "/mock-interview",
                data={
                    "topic": "DCF",
                    "question_track": "technical",
                    "transcript_override": "I would forecast unlevered free cash flows, discount by WACC, and compute terminal value.",
                },
                files={"audio_wav": ("sample.wav", f, "audio/wav")},
            )

        self.assertEqual(resp.status_code, 200, resp.text)
        j = resp.json()

        self.assertIn("narrative", j)
        self.assertIsInstance(j["narrative"], str)
        self.assertGreater(len(j["narrative"]), 20)

        self.assertIn("analysis_meta", j)
        self.assertEqual(j["analysis_meta"].get("llm_enriched"), False)
        self.assertEqual(j["analysis_meta"].get("llm_skip_reason"), "missing_openai_api_key")


class TestNarrativeLLMSkipMeta(unittest.TestCase):
    def test_missing_key_sets_skip_reason(self) -> None:
        from api.config import settings
        from api.services.narrative import maybe_enrich_with_llm_meta

        settings.openai_api_key = None
        text, meta = asyncio.run(maybe_enrich_with_llm_meta("hello"))
        self.assertEqual(text, "hello")
        self.assertEqual(meta["enriched"], False)
        self.assertEqual(meta["skip_reason"], "missing_openai_api_key")


class TestUnhandledExceptionReturnsJson(unittest.TestCase):
    def test_unhandled_exception_is_json_with_request_id(self) -> None:
        from api.main import app

        # Add a route that deliberately errors so we can validate the global handler.
        def boom():  # pragma: no cover
            raise RuntimeError("boom")

        app.add_api_route("/__boom", boom, methods=["GET"])
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/__boom", headers={"x-request-id": "test-rid-123"})

        self.assertEqual(resp.status_code, 500)
        self.assertEqual(resp.headers.get("x-request-id"), "test-rid-123")
        j = resp.json()
        self.assertEqual(j.get("detail"), "Internal Server Error")
        self.assertEqual(j.get("request_id"), "test-rid-123")


if __name__ == "__main__":
    unittest.main()

